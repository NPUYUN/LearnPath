from app.agents.nodes._resource_base import _build_resource, resolve_resource_title
from app.agents.state import AgentState


async def code_node(state: AgentState) -> dict:
    topic = state.get("topic") or "学习主题"
    default_title = f"「{topic}」代码实操"
    resource = await _build_resource(
        state,
        resource_type="code",
        title=resolve_resource_title(state, "code", default_title),
        content_template=(
            "## 实操：{topic}\n\n"
            "请根据以下学习上下文编写完整可运行的代码案例（Python 优先），"
            "须紧扣本阶段目标，勿套用无关的线性回归模板：\n\n"
            "{context}\n"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
