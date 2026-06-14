"""第五步：按学习路径各阶段高质量重新生成配套资源。"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable
from typing import Any

RegenStageProgressCallback = Callable[[int, int, str], Awaitable[None] | None]

from app.agents.nodes.generate_router import RESOURCE_NODE_MAP
from app.agents.nodes.reviewer_agent import review_resources
from app.agents.state import AgentState
from app.core.llm import get_primary_llm
from app.core.prompts import PATH_REPLAN_QUALITY_APPEND
from app.db.repository import get_learner_analysis, get_library, get_path, list_resources, save_path, save_resources
from app.rag.library_retriever import builtin_kb_root, retrieve_from_library
from app.services.graph_state import build_graph_state
from app.services.path_utils import assign_resources_to_stage, ensure_substeps_for_resources
from app.services.profile_analysis_service import format_learner_analysis_for_ai, get_learner_analysis_brief
from app.services.resource_context_service import build_generation_context

logger = logging.getLogger(__name__)

CORE_STAGE_TYPES = ("doc", "quiz", "reading")
MAX_STAGES = 6

_TYPE_LABELS = {
    "doc": "讲解文档",
    "quiz": "练习测验",
    "reading": "延伸阅读",
    "mindmap": "思维导图",
    "code": "代码示例",
    "media": "媒体脚本",
}


def _default_titles(stage_title: str, types: list[str]) -> dict[str, str]:
    short = stage_title[:24] if stage_title else "本阶段"
    return {
        t: f"「{short}」· {_TYPE_LABELS.get(t, t)}"
        for t in types
    }


def _infer_path_topic(steps: list[dict]) -> str:
    for stage in steps:
        title = str(stage.get("title") or "").strip()
        if title:
            return title[:48]
    return "综合学习"


def _library_fallback_dir(lib: dict) -> Any:
    path = lib.get("kb_path")
    if path:
        return builtin_kb_root() / path
    return None


async def _resolve_regen_context(
    *,
    user_id: str,
    topic: str,
    library_id: str | None,
) -> dict[str, Any]:
    library_id_for_ctx: str | None = None
    lib = None
    if library_id:
        lib = await get_library(library_id, user_id)
        if lib and lib.get("status") == "ready" and lib.get("chunk_count", 0) > 0:
            library_id_for_ctx = library_id

    gen_ctx = await build_generation_context(
        topic=topic,
        library_id=library_id_for_ctx,
        user_id=user_id,
    )
    if lib and library_id_for_ctx:
        gen_ctx["library_id"] = lib.get("id", library_id or "")
        if lib.get("name"):
            gen_ctx["library_name"] = lib["name"]
    return gen_ctx


async def _overlay_stage_library_context(
    gen_ctx: dict[str, Any],
    *,
    stage_title: str,
    library_id: str | None,
    user_id: str,
) -> dict[str, Any]:
    """阶段级资料库检索（向量检索，无额外 LLM）。"""
    if not library_id or not gen_ctx.get("library_id"):
        return gen_ctx

    lib = await get_library(library_id, user_id)
    if not lib or lib.get("chunk_count", 0) <= 0:
        return gen_ctx

    chunks = await retrieve_from_library(
        library_id,
        stage_title,
        collection_name=lib.get("collection_name", ""),
        k=4,
        fallback_dir=_library_fallback_dir(lib),
    )
    if not chunks:
        return gen_ctx

    stage_ctx = "\n\n---\n\n".join(
        f"【{c.get('metadata', {}).get('title', '片段')}】\n{c['text']}"
        for c in chunks
    )
    merged = gen_ctx.copy()
    base = str(gen_ctx.get("library_context") or "")
    merged["library_context"] = (
        f"【本阶段「{stage_title}」相关资料】\n{stage_ctx}"
        + (f"\n\n【路径整体资料】\n{base[:1200]}" if base else "")
    )
    return merged


async def _plan_stage_bundle_with_llm(
    *,
    stage_title: str,
    stage_objective: str,
    learner_brief: str,
) -> tuple[list[str], dict[str, str]]:
    """单次 LLM 同时规划类型与标题，避免每阶段两次规划调用。"""
    types_fallback = list(CORE_STAGE_TYPES)
    titles_fallback = _default_titles(stage_title, types_fallback)
    llm = get_primary_llm()
    if llm.use_mock:
        return types_fallback, titles_fallback
    try:
        raw = await llm.chat(
            [
                {
                    "role": "system",
                    "content": (
                        "你是学习资源规划专家。根据路径阶段输出资源类型与标题。"
                        "仅输出 JSON："
                        '{"types":["doc","quiz","reading"],"titles":{"doc":"...","quiz":"...","reading":"..."}}'
                        "types 从 doc/quiz/reading 中选 2-3 种；titles 每项 ≤24 字且互不重复。"
                        + PATH_REPLAN_QUALITY_APPEND
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "stage_title": stage_title,
                            "stage_objective": stage_objective,
                            "learner_analysis_brief": learner_brief[:700],
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            temperature=0.3,
            deep_thinking=False,
            task="generate",
        )
        match = re.search(r"\{[\s\S]*\}", raw or "")
        if not match:
            return types_fallback, titles_fallback
        data = json.loads(match.group())
        allowed = set(CORE_STAGE_TYPES)
        picked = [str(x) for x in (data.get("types") or []) if str(x) in allowed]
        types_out = picked[:3] if picked else types_fallback
        titles_out = dict(titles_fallback)
        raw_titles = data.get("titles") if isinstance(data.get("titles"), dict) else {}
        for t in types_out:
            val = raw_titles.get(t)
            if val and str(val).strip():
                titles_out[t] = str(val).strip()[:80]
        return types_out, titles_out
    except Exception:
        return types_fallback, titles_fallback


async def _generate_types_for_stage(
    base_state: dict[str, Any],
    *,
    stage_title: str,
    stage_objective: str,
    types_to_gen: list[str],
    resource_titles: dict[str, str],
    gen_ctx: dict[str, Any],
    learner_brief: str,
    prior_ids: set[str],
) -> tuple[list[dict], list[str]]:
    gen_ctx = {
        **gen_ctx,
        "stage_objective": stage_objective,
        "learner_analysis_brief": learner_brief,
    }

    current: AgentState = dict(base_state)  # type: ignore
    current["topic"] = stage_title[:48] or "学习阶段"
    current["stage_title"] = stage_title
    current["deep_thinking"] = False
    current["generation_context"] = gen_ctx
    current["resource_types"] = types_to_gen
    current["resource_titles"] = resource_titles
    current["resources"] = list(base_state.get("resources") or [])
    current["messages"] = [
        {
            "role": "user",
            "content": (
                f"请为学习路径阶段「{stage_title}」生成配套资源。"
                f"阶段目标：{stage_objective}"
            ),
        }
    ]

    for rt in types_to_gen:
        node_fn = RESOURCE_NODE_MAP.get(rt)
        if node_fn:
            result = await node_fn(current)
            current["resources"] = result.get("resources", current.get("resources", []))

    all_resources = current.get("resources") or []
    new_items = [r for r in all_resources if r.get("id") and r.get("id") not in prior_ids]
    if not new_items:
        return [], []

    warnings = [
        f"{stage_title} · {r.get('type', '')}「{r.get('title', '')}」：{r.get('generation_warning', '')}"
        for r in new_items
        if r.get("generation_warning")
    ]

    reviewed = await review_resources(new_items, skip_llm=True)
    await save_resources(base_state["user_id"], reviewed)
    return reviewed, warnings


async def regen_path_resources(
    user_id: str,
    *,
    library_id: str | None = None,
    on_stage_progress: RegenStageProgressCallback | None = None,
) -> dict[str, Any]:
    """为当前路径各主阶段强制重新生成配套资源，并写回路径关联。"""
    path_data = await get_path(user_id)
    if not path_data or not path_data.get("steps"):
        raise ValueError("请先生成学习路径（第四步）")

    analysis_row = await get_learner_analysis(user_id) or {}
    learner_brief = (
        str(analysis_row.get("ai_context_brief") or "")
        or await get_learner_analysis_brief(user_id)
        or format_learner_analysis_for_ai(analysis_row)
    )

    base = await build_graph_state(
        user_id,
        {
            "learner_analysis": analysis_row,
            "deep_thinking": False,
        },
    )

    existing = await list_resources(user_id)
    prior_ids = {r.get("id", "") for r in existing if r.get("id")}

    steps = list(path_data.get("steps") or [])
    stages = steps[:MAX_STAGES]
    path_topic = _infer_path_topic(stages)

    shared_gen_ctx = await _resolve_regen_context(
        user_id=user_id,
        topic=path_topic,
        library_id=library_id,
    )
    generation_mode = str(shared_gen_ctx.get("mode") or "web")
    library_name = str(shared_gen_ctx.get("library_name") or "")

    logger.info(
        "regen_path_resources start user=%s stages=%s mode=%s library=%s",
        user_id,
        len(stages),
        generation_mode,
        library_name or "none",
    )

    generated_total = 0
    stages_processed: list[dict[str, Any]] = []
    type_counter: dict[str, int] = {}
    fallback_warnings: list[str] = []

    for idx, stage in enumerate(stages):
        step_id = str(stage.get("id") or stage.get("order") or idx + 1)
        title = str(stage.get("title") or f"阶段 {idx + 1}")
        objective = str(stage.get("objective") or "按阶段完成学习与练习")

        logger.info("regen stage %s/%s id=%s title=%s", idx + 1, len(stages), step_id, title[:40])

        if on_stage_progress:
            cb = on_stage_progress(idx, len(stages), title)
            if asyncio.iscoroutine(cb):
                await cb

        types_to_gen, resource_titles = await _plan_stage_bundle_with_llm(
            stage_title=title,
            stage_objective=objective,
            learner_brief=learner_brief,
        )

        gen_ctx = await _overlay_stage_library_context(
            shared_gen_ctx,
            stage_title=title,
            library_id=library_id,
            user_id=user_id,
        )

        new_items, stage_warnings = await _generate_types_for_stage(
            base,
            stage_title=title,
            stage_objective=objective,
            types_to_gen=types_to_gen,
            resource_titles=resource_titles,
            gen_ctx=gen_ctx,
            learner_brief=learner_brief,
            prior_ids=prior_ids,
        )
        fallback_warnings.extend(stage_warnings)

        new_ids = [r.get("id", "") for r in new_items if r.get("id")]
        for rid in new_ids:
            prior_ids.add(rid)
            row = next((r for r in new_items if r.get("id") == rid), None)
            if row:
                type_counter[str(row.get("type", ""))] = type_counter.get(str(row.get("type", "")), 0) + 1
                base.setdefault("resources", []).append(row)

        assignments: list[dict[str, Any]] = []
        if new_ids:
            ensure_substeps_for_resources(stage, new_items)
            assignments = assign_resources_to_stage(stage, new_ids)
            generated_total += len(new_ids)

        stages_processed.append(
            {
                "step_id": step_id,
                "title": title,
                "generated_count": len(new_ids),
                "types": types_to_gen,
                "resource_ids": new_ids,
                "assignments": assignments,
                "titles": [r.get("title", "") for r in new_items],
            }
        )

    path_data["steps"] = steps
    await save_path(path_data)

    all_resources = await list_resources(user_id)
    logger.info(
        "regen_path_resources done user=%s generated=%s stages=%s",
        user_id,
        generated_total,
        len(stages_processed),
    )
    return {
        "path": path_data,
        "resources": all_resources,
        "meta": {
            "generated_count": generated_total,
            "stages_processed": len(stages_processed),
            "type_breakdown": type_counter,
            "stages": stages_processed,
            "quality_checked": True,
            "generation_mode": generation_mode,
            "library_name": library_name,
            "library_id": library_id or "",
            "fallback_count": len(fallback_warnings),
            "fallback_warnings": fallback_warnings[:12],
            "forced_regen": True,
        },
    }
