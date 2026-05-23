from app.agents.nodes._resource_base import _build_resource
from app.agents.state import AgentState


async def project_node(state: AgentState) -> dict:
    topic = state.get("topic") or "机器学习导论"
    resource = await _build_resource(
        state,
        resource_type="project",
        title=f"{topic} 实践项目任务书",
        content_template=(
            "# {topic} 实践项目任务书\n\n"
            "## 项目概述\n完成一个与 {topic} 相关的小型机器学习实验。\n\n"
            "## 里程碑\n"
            "1. **第 1 周**：文献与数据准备\n"
            "2. **第 2 周**：基线模型实现\n"
            "3. **第 3 周**：调参与报告撰写\n\n"
            "## 交付物\n- 代码仓库（含 README）\n- 实验报告（PDF/Markdown）\n- 5 分钟答辩 PPT\n\n"
            "## 评分 Rubric\n| 维度 | 权重 |\n|------|------|\n| 正确性 | 40% |\n"
            "| 分析深度 | 30% |\n| 文档规范 | 20% |\n| 创新性 | 10% |\n\n"
            "## 参考知识库\n{context}\n"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
