from app.agents.nodes._resource_base import _build_resource
from app.agents.state import AgentState
from app.services.multimodal_enrich_service import enrich_media_content_async


async def media_node(state: AgentState) -> dict:
    topic = state.get("topic") or "机器学习导论"
    resource = await _build_resource(
        state,
        resource_type="media",
        title=f"{topic} · 多模态讲解分镜",
        content_template=(
            f"## 短视频分镜脚本：{topic}\n\n"
            "### 学习目标\n"
            f"- 建立对「{topic}」的直觉与公式联系\n"
            "- 通过分镜画面理解推导与应用场景\n\n"
            "| 镜号 | 画面 | 旁白 | 屏幕文字 | 时长 |\n"
            "|------|------|------|----------|------|\n"
            f"| 1 | 渐变标题卡 + 主题关键词 | 今天学习{topic}的核心思想 | {topic} | 12s |\n"
            "| 2 | 公式/图示动画：概念关系网 | 从定义到直觉，一步讲清 | 关键公式 | 28s |\n"
            "| 3 | 对比演示：正确 vs 易错做法 | 通过例题 walkthrough 巩固 | 步骤 1→2→3 | 25s |\n"
            "| 4 | 小结卡片 + 练习入口 | 回顾要点并布置 3 道自测 | 今日要点 | 15s |\n\n"
            "知识库：{context}"
        ),
    )
    resource["content"] = await enrich_media_content_async(resource.get("content", ""), topic)
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
