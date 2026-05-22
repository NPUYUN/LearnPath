from app.agents.nodes._resource_base import _build_resource
from app.agents.state import AgentState


async def media_node(state: AgentState) -> dict:
    resource = await _build_resource(
        state,
        resource_type="media",
        title="多模态讲解分镜",
        content_template=(
            "## 短视频分镜脚本：{topic}\n\n"
            "| 镜号 | 画面 | 旁白 |\n|------|------|------|\n"
            "| 1 | 概念标题卡 | 今天学习{topic} |\n"
            "| 2 | 动画：数据点与拟合线 | 理解模型如何拟合数据 |\n"
            "| 3 | 练习题入口 | 完成 3 道巩固题 |\n\n"
            "知识库：{context}"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
