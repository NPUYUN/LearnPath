from app.agents.nodes._resource_base import _build_resource, resolve_resource_title
from app.agents.state import AgentState


async def mindmap_node(state: AgentState) -> dict:
    topic = state.get("topic") or "学习主题"
    default_title = f"「{topic}」知识导图"
    resource = await _build_resource(
        state,
        resource_type="mindmap",
        title=resolve_resource_title(state, "mindmap", default_title),
        content_template=(
            "请为「{topic}」生成 Mermaid mindmap，节点须来自以下学习上下文，"
            "勿套用通用机器学习模板：\n\n"
            "{context}\n"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
