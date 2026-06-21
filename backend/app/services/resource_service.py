import json
import logging
import uuid
from collections.abc import AsyncIterator

from app.agents.graph import build_graph
from app.agents.nodes.generate_router import RESOURCE_NODE_MAP
from app.agents.state import AgentState
from app.db.repository import (
    get_path,
    get_profile,
    get_realtime_state,
    get_resource,
    save_library,
    save_path,
    save_resources,
)
from app.models.schemas import GenerateResourcesRequest, LearningResource, ResourceRegenerateRequest
from app.services.graph_state import build_graph_state
from app.db.repository import get_library
from app.services.library_service import ensure_library_assets, get_or_create_library
from app.services.resource_context_service import build_generation_context
from app.services.resource_generation_utils import (
    expand_resource_jobs,
    normalize_resource_type_counts,
    progress_stage_key,
    resource_generation_stage_plan,
    resource_jobs_to_types,
)
from app.services.resource_metadata_service import with_resource_metadata

logger = logging.getLogger(__name__)


def _resolve_generation_jobs(req: GenerateResourcesRequest) -> tuple[dict[str, int], list[tuple[str, int]]]:
    counts = normalize_resource_type_counts(
        req.resource_type_counts,
        req.resource_types,
        topic=req.topic,
        requirements=req.requirements,
    )
    jobs = expand_resource_jobs(counts)
    return counts, jobs


async def _update_library_resource_index(user_id: str, library_id: str, resources: list[dict]) -> None:
    if not library_id or not resources:
        return
    lib = await get_library(library_id, user_id)
    if not lib:
        return
    synthesis = dict(lib.get("synthesis") or {})
    resource_index = dict(synthesis.get("resource_index") or {})
    manifest = list(synthesis.get("resource_manifest") or [])
    for item in resources:
        rid = str(item.get("id") or "")
        if not rid:
            continue
        rtype = str(item.get("type") or "doc")
        bucket = list(resource_index.get(rtype) or [])
        row = {
            "id": rid,
            "title": str(item.get("title") or ""),
            "topic": str(item.get("topic") or ""),
            "type": rtype,
            "metadata": dict(item.get("metadata") or {}),
            "status": str(item.get("status") or "published"),
        }
        bucket = [old for old in bucket if old.get("id") != rid]
        bucket.append(row)
        resource_index[rtype] = bucket[-50:]
        metadata = dict(item.get("metadata") or {})
        manifest_row = {
            "id": rid,
            "title": row["title"],
            "type": rtype,
            "knowledge_points": list(metadata.get("knowledge_points") or []),
            "learning_purpose": metadata.get("learning_purpose", "explain"),
            "difficulty": metadata.get("difficulty", "basic"),
            "used_for": list(metadata.get("used_for") or []),
            "path_step_key": metadata.get("path_step_key", ""),
            "quality_score": metadata.get("quality_score", 0),
            "expected_outcome": metadata.get("expected_outcome", ""),
            "summary": metadata.get("summary", ""),
            "suitable_scenarios": list(metadata.get("suitable_scenarios") or []),
            "classroom_ready": bool(metadata.get("classroom_ready", False)),
            "status": item.get("status", "published"),
        }
        manifest = [old for old in manifest if old.get("id") != rid]
        manifest.append(manifest_row)
    synthesis["resource_index"] = resource_index
    synthesis["resource_manifest"] = manifest[-300:]
    synthesis["index_doc"] = _render_resource_index_doc(
        str(lib.get("name") or "资料库"),
        str(synthesis.get("index_doc") or ""),
        resource_index,
    )
    await save_library({**lib, "synthesis": synthesis})


async def update_library_resource_manifest(user_id: str, library_id: str, resources: list[dict]) -> None:
    await _update_library_resource_index(user_id, library_id, resources)


async def remove_resource_from_manifest(user_id: str, library_id: str, resource_id: str) -> None:
    if not library_id or not resource_id:
        return
    lib = await get_library(library_id, user_id)
    if not lib:
        return
    synthesis = dict(lib.get("synthesis") or {})
    resource_index = dict(synthesis.get("resource_index") or {})
    for key, rows in list(resource_index.items()):
        resource_index[key] = [row for row in list(rows or []) if row.get("id") != resource_id]
    synthesis["resource_index"] = resource_index
    synthesis["resource_manifest"] = [
        row for row in list(synthesis.get("resource_manifest") or []) if row.get("id") != resource_id
    ]
    await save_library({**lib, "synthesis": synthesis})


def _render_resource_index_doc(library_name: str, existing: str, resource_index: dict) -> str:
    base = existing.strip() or f"# {library_name} 索引"
    marker = "\n\n## 已生成资源索引"
    if marker in base:
        base = base.split(marker, 1)[0].rstrip()
    lines = [base, marker.strip()]
    label_map = {
        "doc": "讲解文档",
        "mindmap": "思维导图",
        "quiz": "练习题库",
        "reading": "拓展阅读",
        "media": "多模态讲解",
        "code": "代码案例",
        "ppt": "课件提纲",
        "design": "设计方案",
        "project": "实践项目",
    }
    for rtype, rows in resource_index.items():
        lines.append(f"\n### {label_map.get(rtype, rtype)}")
        for row in list(rows)[-20:]:
            lines.append(f"- {row.get('title') or row.get('id')}（{row.get('id')}）")
    return "\n".join(lines).strip()


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
    return with_resource_metadata({
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
    }, generation_context={
        "requirements": req.requirements,
        "learning_purpose": req.learning_purpose,
        "path_step_key": req.path_step_key,
    })


def _walk_path_steps(steps: list[dict]) -> list[dict]:
    out: list[dict] = []
    for step in steps:
        out.append(step)
        out.extend(_walk_path_steps(list(step.get("substeps") or [])))
    return out


def _active_path_step(path: dict | None) -> dict:
    steps = _walk_path_steps(list((path or {}).get("steps") or []))
    return (
        next((step for step in steps if step.get("status") == "in_progress"), None)
        or next((step for step in steps if step.get("status") == "pending"), None)
        or (steps[0] if steps else {})
    )


async def _attach_resources_to_path(user_id: str, resources: list[dict]) -> list[dict]:
    path = await get_path(user_id)
    if not path or not path.get("steps") or not resources:
        return resources
    steps = _walk_path_steps(list(path.get("steps") or []))
    changed = False
    for resource in resources:
        if resource.get("status") == "draft":
            resource_id = resource.get("id")
            for step in steps:
                ids = list(step.get("resource_ids") or [])
                if resource_id in ids:
                    step["resource_ids"] = [rid for rid in ids if rid != resource_id]
                    changed = True
            continue
        metadata = dict(resource.get("metadata") or {})
        step_key = str(metadata.get("path_step_key") or "")
        target = next(
            (step for step in steps if str(step.get("id") or step.get("order") or "") == step_key),
            None,
        )
        if target is None:
            needles = [
                *[str(x) for x in metadata.get("knowledge_points") or []],
                str(resource.get("topic") or ""),
            ]
            ranked = [
                (
                    sum(
                        bool(
                            needle
                            and (
                                needle in f"{step.get('title', '')} {step.get('objective', '')}"
                                or str(step.get("title") or "") in needle
                            )
                        )
                        for needle in needles
                    ),
                    step,
                )
                for step in steps
            ]
            best_score, best_step = max(ranked, key=lambda row: row[0], default=(0, None))
            target = best_step if best_score > 0 else None
        if not target:
            metadata["path_attachment_warning"] = "未找到匹配的学习路径步骤"
            resource["metadata"] = metadata
            continue
        ids = list(target.get("resource_ids") or [])
        if resource.get("id") not in ids:
            ids.append(resource.get("id"))
            target["resource_ids"] = ids
            changed = True
        resolved_key = str(target.get("id") or target.get("order") or "")
        if resolved_key and metadata.get("path_step_key") != resolved_key:
            metadata["path_step_key"] = resolved_key
            resource["metadata"] = metadata
    if changed:
        await save_path(path)
    return resources


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


def _is_regeneration_artifact(text: str) -> bool:
    value = str(text or "").strip()
    if not value:
        return False
    markers = (
        "请原地重新生成",
        "用户选择的修改方向",
        "用户补充要求",
        "保持资源类型不变",
        "本次重生成要求",
    )
    return any(marker in value for marker in markers)


def _clean_regeneration_metadata(merged: dict, original: dict) -> dict:
    """重生成后移除写入 metadata / topic 的提示词痕迹，避免卡片展示脏标签。"""
    original_meta = original.get("metadata") if isinstance(original.get("metadata"), dict) else {}
    clean_topic = str(original.get("topic") or "").strip()
    if _is_regeneration_artifact(clean_topic):
        clean_topic = ""

    title = str(merged.get("title") or original.get("title") or "").strip()
    if not clean_topic and title:
        clean_topic = title.split("·")[0].split("-")[0].strip()[:80]

    merged["topic"] = clean_topic

    meta = dict(merged.get("metadata") or {}) if isinstance(merged.get("metadata"), dict) else {}
    points = [str(x).strip() for x in (meta.get("knowledge_points") or []) if str(x).strip()]
    points = [p for p in points if not _is_regeneration_artifact(p)]
    if not points:
        orig_points = [
            str(x).strip()
            for x in (original_meta.get("knowledge_points") or [])
            if str(x).strip() and not _is_regeneration_artifact(str(x))
        ]
        points = orig_points[:5]
    if not points and clean_topic:
        points = [clean_topic[:80]]

    meta["knowledge_points"] = points[:8]

    generated_context = dict(meta.get("generated_context") or {})
    ctx_topic = str(generated_context.get("topic") or "").strip()
    if _is_regeneration_artifact(ctx_topic):
        generated_context["topic"] = clean_topic or title[:80]
    target_points = [
        str(x).strip()
        for x in (generated_context.get("target_knowledge_points") or [])
        if str(x).strip() and not _is_regeneration_artifact(str(x))
    ]
    if target_points:
        generated_context["target_knowledge_points"] = target_points[:8]
    elif points:
        generated_context["target_knowledge_points"] = points[:8]
    meta["generated_context"] = generated_context

    merged["metadata"] = meta
    return merged


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
        requirements=req.requirements,
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

    from app.agents.nodes.reviewer_agent import review_resources

    merged = (await review_resources([merged]))[0]
    merged = _clean_regeneration_metadata(merged, original)
    merged = (await _attach_resources_to_path(req.user_id, [merged]))[0]
    await save_resources(req.user_id, [merged])
    await _update_library_resource_index(req.user_id, merged.get("library_id", ""), [merged])
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
        metadata=merged.get("metadata", {}),
        status=merged.get("status", "published"),
    )


async def _resolve_generation_context(req: GenerateResourcesRequest) -> dict:
    lib = None
    if req.generation_source != "web":
        lib = await get_or_create_library(
            req.user_id,
            library_id=req.library_id,
            new_library_name=req.new_library_name,
            requirements=req.requirements,
            source_mode="empty" if req.generation_source == "empty" else "upload",
            source_library_id=req.library_id,
        )
    if lib and req.requirements:
        synthesis = dict(lib.get("synthesis") or {})
        synthesis["requirements"] = req.requirements.strip()
        lib = {**lib, "synthesis": synthesis}
        await save_library(lib)
    if lib:
        lib = ensure_library_assets(lib)
        synthesis = dict(lib.get("synthesis") or {})
        knowledge_index = list(synthesis.get("knowledge_index") or [])
        if not knowledge_index and req.topic.strip():
            knowledge_index.append(
                {
                    "id": "kp_generated_1",
                    "name": req.topic.strip()[:120],
                    "chapter": "生成主题",
                    "prerequisites": [],
                    "next_points": [],
                    "difficulty": "intermediate",
                    "importance": "core",
                    "source_files": [],
                    "source": "generated_context",
                }
            )
            synthesis["knowledge_index"] = knowledge_index
            profile = dict(synthesis.get("library_profile") or {})
            profile["main_knowledge_points"] = [req.topic.strip()[:120]]
            profile["coverage"] = profile.get("coverage") or req.requirements.strip() or req.topic.strip()
            synthesis["library_profile"] = profile
            lib = {**lib, "synthesis": synthesis, "status": "ready"}
            await save_library(lib)
    library_id_for_ctx: str | None = None
    if req.generation_source == "web":
        library_id_for_ctx = None
    elif lib:
        library_id_for_ctx = lib["id"]
    elif req.library_id:
        check = await get_library(req.library_id, req.user_id)
        if check and check.get("status") == "ready":
            library_id_for_ctx = req.library_id

    gen_ctx = await build_generation_context(
        topic=req.topic,
        library_id=library_id_for_ctx,
        user_id=req.user_id,
        requirements=req.requirements,
    )
    path = await get_path(req.user_id)
    active_step = _active_path_step(path)
    profile = await get_profile(req.user_id) or {}
    realtime = await get_realtime_state(req.user_id) or {}
    gen_ctx.update(
        {
            "learning_purpose": req.learning_purpose or "",
            "attach_to_path": bool(req.attach_to_path and path and path.get("steps")),
            "path_attach_mode": req.path_attach_mode if req.attach_to_path else "none",
            "path_step_key": (
                str(req.path_step_key or "")
                if req.attach_to_path and req.path_attach_mode == "manual"
                else ""
            ),
            "stage_title": str(active_step.get("title") or ""),
            "stage_objective": str(active_step.get("objective") or ""),
            "target_knowledge_points": [
                value
                for value in [str(active_step.get("title") or ""), req.topic]
                if value
            ],
            "student_profile": profile,
            "realtime_state": realtime,
        }
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
                req.resource_type_counts,
                req.resource_types,
                topic=req.topic,
                requirements=req.requirements,
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
        from app.agents.nodes.reviewer_agent import review_resources

        reviewed = await review_resources(
            new_items,
            existing_resources=list(base.get("resources") or []),
        )
        if req.attach_to_path:
            reviewed = await _attach_resources_to_path(req.user_id, reviewed)
        await save_resources(req.user_id, reviewed)
        await _update_library_resource_index(req.user_id, gen_ctx.get("library_id", ""), reviewed)

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

    type_counts = normalize_resource_type_counts(
        req.resource_type_counts,
        req.resource_types,
        topic=req.topic,
        requirements=req.requirements,
    )
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

    yield _resource_progress_event("formula_normalize", stage_index, stage_total)
    stage_index += 1
    yield _resource_progress_event("quiz_consistency", stage_index, stage_total)
    stage_index += 1
    yield _resource_progress_event("reviewer", stage_index, stage_total)
    stage_index += 1
    from app.agents.nodes.reviewer_agent import review_resources

    all_res = current.get("resources") or []
    new_items = [r for r in all_res if r.get("id") and r.get("id") not in prior_ids]
    try:
        reviewed = await review_resources(
            new_items,
            existing_resources=[
                row
                for row in list(base.get("resources") or [])
                if row.get("id") in prior_ids
            ],
        )
    except Exception as exc:
        logger.warning("resource review failed topic=%s: %s", req.topic, exc)
        reviewed = new_items
    rewritten_count = sum(
        bool((row.get("metadata") or {}).get("review_attempts"))
        for row in reviewed
    )
    yield _resource_progress_event(
        "rewrite",
        stage_index,
        stage_total,
        {"rewritten_count": rewritten_count},
    )
    stage_index += 1
    if reviewed:
        yield _resource_progress_event("saving", stage_index, stage_total)
        stage_index += 1
        await save_resources(req.user_id, reviewed)
        await _update_library_resource_index(req.user_id, gen_ctx.get("library_id", ""), reviewed)
        yield _resource_progress_event("path_sync", stage_index, stage_total)
        stage_index += 1
        if req.attach_to_path:
            reviewed = await _attach_resources_to_path(req.user_id, reviewed)
            await save_resources(req.user_id, reviewed)
            await _update_library_resource_index(req.user_id, gen_ctx.get("library_id", ""), reviewed)
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
                "library_id": gen_ctx.get("library_id", ""),
                "library_name": gen_ctx.get("library_name", ""),
                "published_count": sum(row.get("status") != "draft" for row in reviewed),
                "draft_count": sum(row.get("status") == "draft" for row in reviewed),
                "rewritten_count": rewritten_count,
                "path_attached_count": sum(bool((row.get("metadata") or {}).get("path_step_key")) for row in reviewed),
                "path_unmatched_count": sum(bool((row.get("metadata") or {}).get("path_attachment_warning")) for row in reviewed),
                "classroom_ready_count": sum(bool((row.get("metadata") or {}).get("classroom_ready")) for row in reviewed),
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
    raw = [with_resource_metadata(row) for row in raw]
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
            metadata=r.get("metadata", {}),
            status=r.get("status", "published"),
        )
        for r in raw
    ]
