from app.agents.nodes._resource_base import _build_resource, resolve_resource_title
from app.agents.state import AgentState


async def doc_node(state: AgentState) -> dict:
    topic = state.get("topic") or "学习主题"
    default_title = f"「{topic}」阶段讲解"
    resource = await _build_resource(
        state,
        resource_type="doc",
        title=resolve_resource_title(state, "doc", default_title),
        content_template=(
            "# {topic} 讲解\n\n"
            "## 学习目标\n"
            "掌握本主题的核心概念、典型应用与常见误区。\n\n"
            "## 核心内容\n{context}\n\n"
            "## 小结\n"
            "结合本阶段练习巩固理解，必要时回到资料库原文核对术语。"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
