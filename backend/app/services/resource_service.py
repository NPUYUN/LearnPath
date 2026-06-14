import json
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


def _extract_new_resources(result: dict, prior_ids: set[str]) -> list[dict]:
    explicit = result.get("new_resources")
    if explicit is not None:
        return list(explicit)
    return [
        r
        for r in (result.get("resources") or [])
        if r.get("id") and r.get("id") not in prior_ids
    ]


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
    base = await build_graph_state(
        req.user_id,
        {
            "intent": "generate",
            "topic": req.topic,
            "resource_types": req.resource_types,
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
    yield {
        "event": "progress",
        "data": json.dumps(
            {"stage": "context", "mode": gen_ctx.get("mode"), "library": gen_ctx.get("library_name", "")},
            ensure_ascii=False,
        ),
    }

    base = await build_graph_state(
        req.user_id,
        {
            "intent": "generate",
            "topic": req.topic,
            "resource_types": req.resource_types,
            "library_id": gen_ctx.get("library_id", ""),
            "generation_context": gen_ctx,
            "deep_thinking": req.deep_thinking,
            "messages": [{"role": "user", "content": f"请生成关于{req.topic}的学习资源"}],
        },
    )
    prior_ids = {r.get("id") for r in base.get("resources") or [] if r.get("id")}
    types = req.resource_types
    current: AgentState = dict(base)  # type: ignore
    current["resources"] = list(base.get("resources") or [])
    current["generation_context"] = gen_ctx

    if gen_ctx.get("mode") == "web":
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "web_research"}, ensure_ascii=False),
        }

    if req.deep_thinking:
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "deep_thinking"}, ensure_ascii=False),
        }
    else:
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "fast_resource"}, ensure_ascii=False),
        }

    for rt in types:
        yield {"event": "progress", "data": json.dumps({"stage": rt}, ensure_ascii=False)}
        node_fn = RESOURCE_NODE_MAP.get(rt)
        if node_fn:
            result = await node_fn(current)
            current["resources"] = result.get("resources", current.get("resources", []))

    yield {"event": "progress", "data": json.dumps({"stage": "reviewer"}, ensure_ascii=False)}
    from app.agents.nodes.reviewer_agent import review_resources

    all_res = current.get("resources") or []
    new_items = [r for r in all_res if r.get("id") and r.get("id") not in prior_ids]
    reviewed = await review_resources(new_items)
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
            {"count": len(new_items), "total": len(full), "mode": gen_ctx.get("mode")},
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
