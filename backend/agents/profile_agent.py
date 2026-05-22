"""
学习画像构建智能体（ProfileAgent）

职责：
- 通过多轮对话收集学生信息（专业、目标、基础等）
- 自动抽取并更新学生画像（≥6个维度）
- 支持随学随新（每次交互后更新画像）

TODO（开发者任务）：
1. 完善 PROFILE_EXTRACTION_PROMPT，提高信息抽取准确率
2. 实现画像的增量更新逻辑（不覆盖已有信息）
3. 添加画像完整度检查（判断哪些维度尚未收集）
4. 实现动态追问逻辑（针对未填写的维度主动追问）
"""
import json
from backend.agents.base_agent import BaseAgent
from backend.models.state import AgentState, StudentProfile


PROFILE_BUILDER_SYSTEM_PROMPT = """你是一个专业的教育助手，正在帮助学生构建个人学习画像。
请通过友好、自然的对话收集以下信息（每次只问1-2个问题，不要一次问太多）：

需要收集的维度（至少6个）：
1. 知识基础（当前对该领域的了解程度，0-10分）
2. 认知风格（视觉型/听觉型/阅读型/动手型）
3. 学习目标（短期和长期目标）
4. 易错点/薄弱知识点
5. 每日可用学习时间
6. 兴趣方向（在该领域中最感兴趣的方向）

对话风格：亲切、鼓励、专业。"""

PROFILE_EXTRACTION_PROMPT = """基于以下对话历史，提取学生的学习画像信息。
如果某个维度没有足够信息，设为 null。

返回 JSON 格式：
{
    "knowledge_level": {"score": null或0-10的数字, "weak_points": []},
    "cognitive_style": null或"visual"/"auditory"/"reading"/"kinesthetic",
    "learning_goal": null或"目标描述",
    "error_prone_topics": [],
    "available_time_per_day": null或小时数,
    "interest_direction": [],
    "profile_completeness": 0-100的完整度百分比
}

对话历史：
{conversation}"""


class ProfileAgent(BaseAgent):
    """
    学习画像构建智能体
    
    工作流程：
    1. 检查当前画像完整度
    2. 针对未收集的维度生成引导性问题
    3. 从用户回答中抽取画像信息
    4. 更新 state["student_profile"]
    """

    name = "profile_agent"
    description = "通过对话构建和更新学生学习画像（6+维度）"

    def run(self, state: AgentState) -> AgentState:
        """
        TODO: 实现完整的画像构建逻辑
        当前为框架占位，需要开发者实现以下步骤：
        
        步骤1：检查现有画像完整度
        步骤2：生成针对性问题（引导用户填写缺失维度）
        步骤3：调用 LLM 提取用户回复中的画像信息
        步骤4：合并更新画像
        步骤5：判断画像是否足够完整（可进入资源生成阶段）
        """
        messages = state.get("messages", [])
        current_profile = state.get("student_profile")
        turn_count = state.get("profile_build_turns", 0)

        # 格式化对话历史用于信息抽取
        conversation_text = "\n".join([
            f"{msg['role']}: {msg['content']}"
            for msg in messages[-10:]  # 取最近10条
        ])

        # TODO: 步骤1 - 调用 LLM 进行信息抽取
        # extraction_messages = [
        #     {"role": "user", "content": PROFILE_EXTRACTION_PROMPT.format(
        #         conversation=conversation_text
        #     )}
        # ]
        # extracted = await self._call_llm(extraction_messages)
        # new_profile_data = json.loads(extracted)

        # TODO: 步骤2 - 合并更新画像
        # updated_profile = self._merge_profile(current_profile, new_profile_data)

        # TODO: 步骤3 - 生成下一轮引导性问题
        # guide_messages = [
        #     {"role": "system", "content": PROFILE_BUILDER_SYSTEM_PROMPT},
        #     *messages,
        # ]
        # next_question = await self._call_llm(guide_messages)

        # 占位返回
        return {
            **state,
            "profile_build_turns": turn_count + 1,
            # "student_profile": updated_profile,
            "next_agent": None,  # 继续对话
        }

    def _merge_profile(
        self,
        existing: StudentProfile | None,
        new_data: dict,
    ) -> StudentProfile:
        """
        合并现有画像和新提取的信息
        已有信息不被覆盖（除非新信息更准确）
        
        TODO: 实现智能合并逻辑
        """
        if not existing:
            return new_data
        merged = dict(existing)
        for key, value in new_data.items():
            if value is not None and value != [] and value != "":
                merged[key] = value
        return merged

    def _check_completeness(self, profile: StudentProfile | None) -> float:
        """
        检查画像完整度（0-100）
        
        TODO: 根据各维度权重计算完整度
        """
        if not profile:
            return 0.0
        required_fields = [
            "knowledge_level", "cognitive_style", "learning_goal",
            "error_prone_topics", "available_time_per_day", "interest_direction"
        ]
        filled = sum(1 for f in required_fields if profile.get(f))
        return (filled / len(required_fields)) * 100
