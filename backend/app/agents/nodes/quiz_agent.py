from app.agents.nodes._resource_base import _build_resource, resolve_resource_title
from app.agents.state import AgentState


async def quiz_node(state: AgentState) -> dict:
    topic = state.get("topic") or "学习主题"
    default_title = f"「{topic}」巩固测验"
    resource = await _build_resource(
        state,
        resource_type="quiz",
        title=resolve_resource_title(state, "quiz", default_title),
        content_template=(
            "# {topic} 巩固测验\n\n"
            "请根据以下学习上下文设计至少 3 道单选题（JSON 格式），"
            "题目须紧扣本阶段目标，禁止使用无关的通用机器学习套题：\n\n"
            "{context}\n"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
