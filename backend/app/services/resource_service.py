import json
from collections.abc import AsyncIterator

from app.agents.graph import build_graph
from app.agents.nodes.generate_router import RESOURCE_NODE_MAP
from app.agents.state import AgentState
from app.db.repository import save_resources
from app.models.schemas import GenerateResourcesRequest, LearningResource
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
