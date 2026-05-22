from app.agents.nodes._resource_base import _build_resource
from app.agents.state import AgentState


async def doc_node(state: AgentState) -> dict:
    resource = await _build_resource(
        state,
        resource_type="doc",
        title="个性化讲解文档",
        content_template=(
            "# {topic} 讲解\n\n"
            "## 学习目标\n掌握 {topic} 的核心概念与典型应用。\n\n"
            "## 正文\n基于课程知识库摘要：\n{context}\n\n"
            "## 小结\n请结合练习巩固理解。"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
