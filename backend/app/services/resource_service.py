from app.agents.graph import build_graph
from app.db.repository import list_resources, save_resources
from app.models.schemas import GenerateResourcesRequest, LearningResource


async def generate_resources(req: GenerateResourcesRequest) -> list[LearningResource]:
    graph = build_graph()
    result = await graph.ainvoke(
        {
            "user_id": req.user_id,
            "intent": "generate",
            "topic": req.topic,
            "resource_types": req.resource_types,
            "messages": [{"role": "user", "content": f"请生成关于{req.topic}的学习资源"}],
        }
    )
    raw = result.get("resources") or []
    await save_resources(req.user_id, raw)
    return [
        LearningResource(
            id=r["id"],
            type=r["type"],
            title=r["title"],
            content=r["content"],
            sources=r.get("sources", []),
            topic=r.get("topic", req.topic),
        )
        for r in raw
    ]


async def get_user_resources(user_id: str) -> list[LearningResource]:
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
        )
        for r in raw
    ]
