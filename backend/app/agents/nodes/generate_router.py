from app.agents.state import AgentState
from app.agents.nodes.doc_agent import doc_node
from app.agents.nodes.mindmap_agent import mindmap_node
from app.agents.nodes.quiz_agent import quiz_node
from app.agents.nodes.reading_agent import reading_node
from app.agents.nodes.media_agent import media_node
from app.agents.nodes.code_agent import code_node

RESOURCE_NODE_MAP = {
    "doc": doc_node,
    "mindmap": mindmap_node,
    "quiz": quiz_node,
    "reading": reading_node,
    "media": media_node,
    "code": code_node,
}


async def generate_router_node(state: AgentState) -> dict:
    """按 resource_types 依次调用各资源 Agent。"""
    types = state.get("resource_types") or ["doc", "mindmap", "quiz", "reading", "code"]
    merged: dict = {"resources": list(state.get("resources") or [])}
    current = dict(state)
    current["resources"] = merged["resources"]

    for rt in types:
        node_fn = RESOURCE_NODE_MAP.get(rt)
        if node_fn:
            result = await node_fn(current)
            current["resources"] = result.get("resources", current["resources"])
            merged["resources"] = current["resources"]

    merged["reply"] = f"已生成 {len(merged['resources'])} 项学习资源。"
    return merged


def resource_nodes():
    return list(RESOURCE_NODE_MAP.values())
