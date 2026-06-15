import json
import logging
import uuid
from collections.abc import AsyncIterator

from app.agents.graph import build_graph
from app.agents.nodes.generate_router import RESOURCE_NODE_MAP
from app.agents.state import AgentState
from app.db.repository import get_path, get_resource, save_resources
from app.models.schemas import GenerateResourcesRequest, LearningResource, ResourceRegenerateRequest
from app.services.graph_state import build_graph_state
from app.db.repository import get_library
from app.services.library_service import get_or_create_library
from app.services.resource_context_service import build_generation_context
from app.services.resource_generation_utils import (
    expand_resource_jobs,
    normalize_resource_type_counts,
    progress_stage_key,
    resource_generation_stage_plan,
    resource_jobs_to_types,
)

logger = logging.getLogger(__name__)


def _resolve_generation_jobs(req: GenerateResourcesRequest) -> tuple[dict[str, int], list[tuple[str, int]]]:
    counts = normalize_resource_type_counts(req.resource_type_counts, req.resource_types)
    jobs = expand_resource_jobs(counts)
    return counts, jobs


def _resource_stage_progress(stage_index: int, total: int) -> int:
    if total <= 0:
        return 0
    return min(99, int(round((stage_index + 1) / total * 99)))


def _resource_progress_event(
    stage: str,
    stage_index: int,
    total: int,
    extra: dict | None = None,
) -> dict:
    payload: dict = {
        "stage": stage,
        "progress": _resource_stage_progress(stage_index, total),
    }
    if extra:
        payload.update(extra)
    return {
        "event": "progress",
        "data": json.dumps(payload, ensure_ascii=False),
    }


def _extract_new_resources(result: dict, prior_ids: set[str]) -> list[dict]:
    explicit = result.get("new_resources")
    if explicit is not None:
        return list(explicit)
    return [
        r
        for r in (result.get("resources") or [])
        if r.get("id") and r.get("id") not in prior_ids
    ]


def _fallback_resource(req: GenerateResourcesRequest, resource_type: str, reason: str = "") -> dict:
    title_map = {
        "doc": "讲解文档",
        "mindmap": "思维导图",
        "quiz": "练习测验",
        "reading": "拓展阅读",
        "media": "多模态讲解",
        "code": "代码示例",
        "ppt": "课件提纲",
        "design": "方案设计",
        "project": "项目任务",
    }
    label = title_map.get(resource_type, "学习资源")
    reason_line = f"\n\n> 降级原因：{reason}" if reason else ""
    return {
        "id": str(uuid.uuid4()),
        "type": resource_type,
        "title": f"{req.topic} · {label}",
        "topic": req.topic,
        "content": (
            f"# {req.topic} · {label}\n\n"
            "## 学习目标\n"
            f"- 理解「{req.topic}」的核心概念、适用场景和常见误区。\n"
            "- 能用一个具体例子说明关键步骤。\n"
            "- 能完成一道基础练习，并说清楚答案依据。\n\n"
            "## 建议学习路径\n"
            "1. 先写下你已经知道的内容和最困惑的一点。\n"
            "2. 按“定义 -> 例子 -> 练习 -> 复盘”的顺序学习。\n"
            "3. 如果遇到卡点，把卡点带回智能对话或 AI 课堂继续追问。\n\n"
            "## 快速练习\n"
            f"- 用自己的话解释「{req.topic}」解决的是什么问题。\n"
            "- 找一个生活、数学或代码中的小例子，标出输入、过程和输出。"
            f"{reason_line}"
        ),
        "sources": ["本地降级生成"],
        "generation_mode": "fallback",
    }


def _find_resource_path_context(path: dict | None, resource_id: str) -> dict:
    if not path:
        return {}

    def walk(steps: list[dict]) -> dict | None:
        for step in steps:
            if resource_id in (step.get("resource_ids") or []):
                return {
                    "step_id": step.get("id", ""),
                    "stage_title": step.get("title", ""),
                    "stage_objective": step.get("objective", ""),
                }
            found = walk(step.get("substeps") or [])
            if found:
                return found
        return None

    return walk(path.get("steps") or []) or {}


def _regenerate_topic(resource: dict, req: ResourceRegenerateRequest, path_ctx: dict) -> str:
    tags = "、".join(t.strip() for t in req.tags if t.strip())
    requirements = (req.requirements or "").strip()
    topic = resource.get("topic") or resource.get("title") or "学习资源"
    parts = [
        f"请原地重新生成这份学习资源：{resource.get('title') or topic}",
        f"核心主题：{topic}",
    ]
    if path_ctx.get("stage_title"):
        parts.append(f"所属路径节点：{path_ctx.get('stage_title')}")
    if tags:
        parts.append(f"用户选择的修改方向：{tags}")
    if requirements:
        parts.append(f"用户补充要求：{requirements}")
    parts.append("保持资源类型不变，保留原主题关联，但内容必须明显回应用户修改要求。")
    return "；".join(parts)


async def regenerate_resource(
    resource_id: str,
    req: ResourceRegenerateRequest,
) -> LearningResource:
    original = await get_resource(req.user_id, resource_id)
    if not original:
        raise ValueError("资源不存在")

    resource_type = str(original.get("type") or "doc")
    node_fn = RESOURCE_NODE_MAP.get(resource_type) or RESOURCE_NODE_MAP.get("doc")
    if not node_fn:
        raise ValueError("当前资源类型暂不支持重生成")

    path = await get_path(req.user_id)
    path_ctx = _find_resource_path_context(path, resource_id)
    topic = _regenerate_topic(original, req, path_ctx)
    gen_ctx = await build_generation_context(
        topic=topic,
        library_id=original.get("library_id") or None,
        user_id=req.user_id,
    )
    if path_ctx.get("stage_objective"):
        gen_ctx["stage_objective"] = path_ctx["stage_objective"]

    title = original.get("title") or topic
    base = await build_graph_state(
        req.user_id,
        {
            "intent": "generate",
            "topic": topic,
            "resource_types": [resource_type],
            "resource_titles": {resource_type: title},
            "library_id": gen_ctx.get("library_id", ""),
            "generation_context": gen_ctx,
            "deep_thinking": True,
            "stage_title": path_ctx.get("stage_title") or original.get("topic") or title,
            "messages": [
                {
                    "role": "user",
                    "content": f"请根据我的修改要求重新生成资源《{title}》：{topic}",
                }
            ],
        },
    )
    current: AgentState = dict(base)  # type: ignore
    current["resources"] = list(base.get("resources") or [])
    result = await node_fn(current)
    generated = list(result.get("resources") or [])
    new_item = generated[-1] if generated else None
    if not new_item:
        raise ValueError("资源重生成失败")

    tags = [t.strip() for t in req.tags if t.strip()]
    requirements = (req.requirements or "").strip()
    merged = {
        **original,
        **new_item,
        "id": resource_id,
        "type": resource_type,
        "title": new_item.get("title") or original.get("title", ""),
        "topic": original.get("topic") or new_item.get("topic", ""),
        "library_id": original.get("library_id") or new_item.get("library_id", ""),
        "library_name": original.get("library_name") or new_item.get("library_name", ""),
        "regenerated": True,
        "regeneration_requirements": requirements,
        "regeneration_tags": tags,
    }
    note = "、".join([*tags, requirements][:4])
    if note:
        merged["content"] = f"{merged.get('content', '')}\n\n> 本次重生成要求：{note}".strip()

    await save_resources(req.user_id, [merged])
    return LearningResource(
        id=merged.get("id", resource_id),
        type=merged.get("type", resource_type),
        title=merged.get("title", ""),
        content=merged.get("content", ""),
        sources=merged.get("sources", []),
        topic=merged.get("topic", ""),
        generation_mode=merged.get("generation_mode", ""),
        library_id=merged.get("library_id", ""),
        library_name=merged.get("library_name", ""),
    )


async def _resolve_generation_context(req: GenerateResourcesRequest) -> dict:
    lib = await get_or_create_library(
        req.user_id,
        library_id=req.library_id,
        new_library_name=req.new_library_name,
    )
    library_id_for_ctx: str | None = None
    if lib and lib.get("status") == "ready" and lib.get("chunk_count", 0) > 0:
        library_id_for_ctx = lib["id"]
    elif req.library_id:
        check = await get_library(req.library_id, req.user_id)
        if check and check.get("chunk_count", 0) > 0:
            library_id_for_ctx = req.library_id

    gen_ctx = await build_generation_context(
        topic=req.topic,
        library_id=library_id_for_ctx,
        user_id=req.user_id,
    )
    if lib:
        gen_ctx["library_id"] = lib["id"]
        if lib.get("name"):
            gen_ctx["library_name"] = lib["name"]
    return gen_ctx


async def generate_resources(req: GenerateResourcesRequest) -> list[LearningResource]:
    gen_ctx = await _resolve_generation_context(req)
    _, jobs = _resolve_generation_jobs(req)
    base = await build_graph_state(
        req.user_id,
        {
            "intent": "generate",
            "topic": req.topic,
            "resource_types": resource_jobs_to_types(jobs),
            "resource_type_counts": normalize_resource_type_counts(
                req.resource_type_counts, req.resource_types
            ),
            "resource_generation_jobs": jobs,
            "library_id": gen_ctx.get("library_id", ""),
            "generation_context": gen_ctx,
            "deep_thinking": req.deep_thinking,
            "messages": [{"role": "user", "content": f"请生成关于{req.topic}的学习资源"}],
        },
    )
    prior_ids = {r.get("id") for r in base.get("resources") or [] if r.get("id")}

    graph = build_graph()
    result = await graph.ainvoke(base)

    new_items = _extract_new_resources(result, prior_ids)
    if new_items:
        await save_resources(req.user_id, new_items)

    return await get_user_resources(req.user_id)


async def stream_generate_resources(
    req: GenerateResourcesRequest,
) -> AsyncIterator[dict]:
    """SSE: context -> progress per type -> resources -> done"""
    gen_ctx = await _resolve_generation_context(req)
    _, jobs = _resolve_generation_jobs(req)
    if not jobs:
        yield {
            "event": "error",
            "data": json.dumps({"message": "请至少选择一种资源类型并设置数量"}, ensure_ascii=False),
        }
        return

    stage_plan = resource_generation_stage_plan(gen_ctx, jobs, req.deep_thinking)
    stage_total = len(stage_plan)
    stage_index = 0

    yield _resource_progress_event(
        "context",
        stage_index,
        stage_total,
        {"mode": gen_ctx.get("mode"), "library": gen_ctx.get("library_name", "")},
    )
    stage_index += 1

    type_counts = normalize_resource_type_counts(req.resource_type_counts, req.resource_types)
    base = await build_graph_state(
        req.user_id,
        {
            "intent": "generate",
            "topic": req.topic,
            "resource_types": resource_jobs_to_types(jobs),
            "resource_type_counts": type_counts,
            "resource_generation_jobs": jobs,
            "library_id": gen_ctx.get("library_id", ""),
            "generation_context": gen_ctx,
            "deep_thinking": req.deep_thinking,
            "messages": [{"role": "user", "content": f"请生成关于{req.topic}的学习资源"}],
        },
    )
    prior_ids = {r.get("id") for r in base.get("resources") or [] if r.get("id")}
    current: AgentState = dict(base)  # type: ignore
    current["resources"] = list(base.get("resources") or [])
    current["generation_context"] = gen_ctx

    if gen_ctx.get("mode") == "web":
        yield _resource_progress_event("web_research", stage_index, stage_total)
        stage_index += 1

    mode_stage = "deep_thinking" if req.deep_thinking else "fast_resource"
    yield _resource_progress_event(mode_stage, stage_index, stage_total)
    stage_index += 1

    for rt, variant in jobs:
        variant_total = sum(1 for t, _ in jobs if t == rt)
        stage_key = progress_stage_key(rt, variant, variant_total)
        yield _resource_progress_event(
            stage_key,
            stage_index,
            stage_total,
            {
                "resource_type": rt,
                "variant": variant,
                "variant_total": variant_total,
            },
        )
        stage_index += 1
        node_fn = RESOURCE_NODE_MAP.get(rt)
        if node_fn:
            current["resource_variant_index"] = variant
            current["resource_variant_total"] = variant_total
            try:
                result = await node_fn(current)
                current["resources"] = result.get("resources", current.get("resources", []))
            except Exception as exc:
                logger.warning(
                    "resource node failed type=%s variant=%s topic=%s: %s",
                    rt,
                    variant,
                    req.topic,
                    exc,
                )
                fallback = _fallback_resource(req, rt, str(exc))
                if variant_total > 1:
                    fallback["title"] = f"{fallback['title']} · 第{variant}份"
                current["resources"] = [
                    *(current.get("resources") or []),
                    fallback,
                ]

    yield _resource_progress_event("reviewer", stage_index, stage_total)
    from app.agents.nodes.reviewer_agent import review_resources

    all_res = current.get("resources") or []
    new_items = [r for r in all_res if r.get("id") and r.get("id") not in prior_ids]
    try:
        reviewed = await review_resources(new_items)
    except Exception as exc:
        logger.warning("resource review failed topic=%s: %s", req.topic, exc)
        reviewed = new_items
    if reviewed:
        await save_resources(req.user_id, reviewed)
        summaries = [
            {"id": r.get("id", ""), "type": r.get("type", ""), "title": r.get("title", "")}
            for r in reviewed
            if r.get("id")
        ]
        yield {"event": "resources", "data": json.dumps(summaries, ensure_ascii=False)}

    full = await get_user_resources(req.user_id)
    yield {
        "event": "done",
        "data": json.dumps(
            {
                "count": len(new_items),
                "total": len(full),
                "mode": gen_ctx.get("mode"),
                "progress": 100,
            },
            ensure_ascii=False,
        ),
    }


async def get_user_resources(user_id: str) -> list[LearningResource]:
    from app.db.repository import list_resources

    raw = await list_resources(user_id)
    if not raw:
        return []
    return [
        LearningResource(
            id=r.get("id", ""),
            type=r.get("type", "doc"),
            title=r.get("title", ""),
            content=r.get("content", ""),
            sources=r.get("sources", []),
            topic=r.get("topic", ""),
            generation_mode=r.get("generation_mode", ""),
            library_id=r.get("library_id", ""),
            library_name=r.get("library_name", ""),
        )
        for r in raw
    ]
