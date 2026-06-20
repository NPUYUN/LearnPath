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
            "# {topic} 代码实操\n\n"
            "## 资源导航\n- 对应知识点：{topic}\n- 学习用途：项目实践\n\n"
            "## 资源摘要\n当前模型生成未完成。本草稿仅保留知识依据，等待补充与主题直接相关的完整可运行代码、中文注释、运行环境、样例输入输出、核心逻辑与常见错误后再发布。\n\n"
            "## 待重写依据\n{context}\n"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
