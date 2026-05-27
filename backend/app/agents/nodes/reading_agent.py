from app.agents.nodes._resource_base import _build_resource
from app.agents.state import AgentState


async def reading_node(state: AgentState) -> dict:
    resource = await _build_resource(
        state,
        resource_type="reading",
        title="拓展阅读",
        content_template=(
            "## 拓展阅读：{topic}\n\n"
            "1. 《机器学习》周志华 — 对应章节精读\n"
            "2. scikit-learn 官方文档 — 实践 API\n"
            "3. 课程知识库摘录：{context}\n"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
