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
            "## 资源导航\n- 对应知识点：{topic}\n- 学习用途：练习诊断\n\n"
            "## 资源摘要\n当前模型生成未完成。本草稿保留相关学习上下文，等待按 3 道基础题、3 道应用题和 2 道易错辨析题重写；正式发布前，每题还必须补齐答案、详解和错误选项诊断。\n\n"
            "## 待重写依据\n{context}\n"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
