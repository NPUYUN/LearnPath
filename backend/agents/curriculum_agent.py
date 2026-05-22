"""
课程规划智能体（CurriculumAgent）

职责：
- 结合学生画像和知识库，生成个性化学习路径
- 分阶段规划学习内容（至少3阶段）
- 动态调整路径（根据学习进度）

TODO（开发者任务）：
1. 实现基于学生画像的路径生成提示词
2. 调用 LLM 生成结构化学习路径 JSON
3. 实现路径的动态调整逻辑
4. 添加路径进度跟踪
"""
from backend.agents.base_agent import BaseAgent
from backend.models.state import AgentState


CURRICULUM_SYSTEM_PROMPT = """你是一位经验丰富的大学教授和学习规划师。
请根据学生的个人学习画像，为其制定一个科学、个性化的学习路径。

要求：
- 分为至少3个阶段（基础→进阶→应用）
- 每个阶段包含：目标、主要知识点、推荐资源类型、预估时长
- 路径需与学生的可用时间匹配
- 针对薄弱知识点安排强化练习

返回 JSON 格式：
{
    "stages": [
        {
            "stage_id": "stage_1",
            "stage_name": "阶段名称",
            "objectives": ["目标1", "目标2"],
            "topics": ["知识点1", "知识点2"],
            "resource_types": ["document", "video", "quiz"],
            "estimated_hours": 总时长,
            "is_completed": false
        }
    ]
}"""


class CurriculumAgent(BaseAgent):
    """
    个性化学习路径规划智能体
    
    TODO:
    1. 实现 LLM 调用生成结构化路径
    2. 实现路径进度追踪
    3. 实现路径动态调整（根据 EvaluatorAgent 反馈）
    """

    name = "curriculum_agent"
    description = "基于学生画像规划个性化学习路径"

    def run(self, state: AgentState) -> AgentState:
        """
        TODO: 实现学习路径生成
        
        步骤：
        1. 读取学生画像
        2. 检索知识库了解课程结构（RAG）
        3. 调用 LLM 生成路径 JSON
        4. 解析并存入 state["learning_path"]
        """
        profile = state.get("student_profile")
        topic = state.get("current_topic", "人工智能基础")

        # TODO: 实现路径生成
        # profile_desc = self._build_system_prompt(state)
        # rag_context = self._retrieve_context(f"{topic} 课程大纲")
        # messages = [
        #     {"role": "system", "content": CURRICULUM_SYSTEM_PROMPT + profile_desc},
        #     {"role": "user", "content": f"请为「{topic}」课程规划学习路径。课程结构参考：\n{rag_context}"},
        # ]
        # path_json = await self._call_llm(messages)
        # learning_path = json.loads(path_json)["stages"]

        # 占位示例
        placeholder_path = [
            {
                "stage_id": "stage_1",
                "stage_name": "基础入门",
                "objectives": [f"理解{topic}的基本概念"],
                "topics": ["TODO: 调用 Spark API 生成具体知识点"],
                "resource_types": ["document", "video"],
                "estimated_hours": 10.0,
                "is_completed": False,
            },
            {
                "stage_id": "stage_2",
                "stage_name": "核心进阶",
                "objectives": [f"掌握{topic}的核心算法"],
                "topics": ["TODO: 生成进阶知识点"],
                "resource_types": ["document", "quiz", "code"],
                "estimated_hours": 20.0,
                "is_completed": False,
            },
            {
                "stage_id": "stage_3",
                "stage_name": "实践应用",
                "objectives": [f"能独立完成{topic}相关项目"],
                "topics": ["TODO: 生成实战项目知识点"],
                "resource_types": ["code", "quiz"],
                "estimated_hours": 15.0,
                "is_completed": False,
            },
        ]

        return {**state, "learning_path": placeholder_path}
