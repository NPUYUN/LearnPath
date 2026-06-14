from app.agents.nodes._resource_base import _build_resource, resolve_resource_title
from app.agents.state import AgentState


async def reading_node(state: AgentState) -> dict:
    topic = state.get("topic") or "学习主题"
    default_title = f"「{topic}」拓展阅读"
    resource = await _build_resource(
        state,
        resource_type="reading",
        title=resolve_resource_title(state, "reading", default_title),
        content_template=(
            "## 拓展阅读：{topic}\n\n"
            "请根据以下上下文推荐 3–5 条与本阶段目标相关的学习材料"
            "（教材章节/官方文档/教程方向），并说明阅读建议：\n\n"
            "{context}\n"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
