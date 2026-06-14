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
            "## 学习目标\n结合本阶段目标，掌握 {topic} 的核心概念与典型应用。\n\n"
            "## 正文\n请依据以下学习上下文展开（勿使用通用机器学习套话）：\n{context}\n\n"
            "## 小结\n请结合本阶段练习巩固理解。"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
