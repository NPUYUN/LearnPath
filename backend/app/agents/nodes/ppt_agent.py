from app.agents.nodes._resource_base import _build_resource
from app.agents.state import AgentState


async def ppt_node(state: AgentState) -> dict:
    topic = state.get("topic") or "机器学习导论"
    resource = await _build_resource(
        state,
        resource_type="ppt",
        title=f"{topic} 课件提纲",
        content_template=(
            "# {topic} — 课件提纲\n\n"
            "## 封面\n- 课程：机器学习导论\n- 主题：{topic}\n\n"
            "## 目录\n1. 学习目标\n2. 核心概念\n3. 例题与练习\n4. 小结\n\n"
            "## 第 1 节 学习目标\n- 理解 {topic} 的定义与应用场景\n\n"
            "## 第 2 节 核心概念\n（结合知识库）\n{context}\n\n"
            "## 第 3 节 小结\n- 回顾要点\n- 课后练习建议\n"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
