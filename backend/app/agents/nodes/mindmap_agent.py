from app.agents.nodes._resource_base import _build_resource
from app.agents.state import AgentState


async def mindmap_node(state: AgentState) -> dict:
    topic = state.get("topic") or "机器学习导论"
    resource = await _build_resource(
        state,
        resource_type="mindmap",
        title=f"{topic} 思维导图",
        content_template=(
            "```mermaid\n"
            "mindmap\n"
            "  root(({topic}))\n"
            "    监督学习\n"
            "      回归\n"
            "      分类\n"
            "    无监督学习\n"
            "      聚类\n"
            "    模型评估\n"
            "```\n\n"
            "知识库上下文：{context}"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
