from app.agents.nodes._resource_base import _build_resource
from app.agents.state import AgentState


async def design_node(state: AgentState) -> dict:
    topic = state.get("topic") or "机器学习导论"
    resource = await _build_resource(
        state,
        resource_type="design",
        title=f"{topic} 资源设计方案",
        content_template=(
            "# {topic} 个性化资源设计方案\n\n"
            "## 1. 教学目标\n- 知识目标、能力目标、素养目标\n\n"
            "## 2. 学习者分析\n- 结合画像与薄弱点设计差异化资源\n\n"
            "## 3. 资源结构\n| 模态 | 用途 | 建议时长 |\n|------|------|----------|\n"
            "| 讲解文档 | 概念导入 | 30min |\n| 思维导图 | 结构梳理 | 15min |\n"
            "| 题库 | 巩固检测 | 20min |\n\n"
            "## 4. 评估方式\n- 形成性：随堂测验\n- 总结性：项目报告\n\n"
            "## 5. 知识库依据\n{context}\n"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
