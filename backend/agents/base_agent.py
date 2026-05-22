"""
智能体基类
所有具体智能体继承此类

TODO（开发者任务）：
- 各子类需实现 run() 方法
- 可根据需要重写 _build_system_prompt()
"""
from abc import ABC, abstractmethod
from typing import Optional
from backend.models.state import AgentState
from backend.core.llm import spark_llm
from backend.core.rag import rag_pipeline


class BaseAgent(ABC):
    """
    智能体基类
    提供 LLM 调用、RAG 检索等公共能力
    """

    # 子类需定义智能体名称
    name: str = "base_agent"
    # 子类需定义智能体角色描述（用于 Orchestrator 路由）
    description: str = ""

    def __init__(self):
        self.llm = spark_llm
        self.rag = rag_pipeline

    @abstractmethod
    def run(self, state: AgentState) -> AgentState:
        """
        执行智能体逻辑，返回更新后的状态
        
        Args:
            state: 当前全局状态
        
        Returns:
            AgentState: 更新后的状态（仅修改需要更新的字段）
        """
        pass

    def _build_system_prompt(self, state: AgentState) -> str:
        """
        构建包含学生画像和上下文的系统提示词
        子类可重写以自定义系统提示
        """
        profile = state.get("student_profile")
        profile_desc = ""
        if profile:
            profile_desc = f"""
当前学生信息：
- 知识水平：{profile.get('knowledge_level', {}).get('score', '未知')}/10
- 认知风格：{profile.get('cognitive_style', '未知')}
- 学习目标：{profile.get('learning_goal', '未知')}
- 易错点：{', '.join(profile.get('error_prone_topics', []))}
- 每日学习时间：{profile.get('available_time_per_day', '未知')}小时
"""
        return profile_desc

    async def _call_llm_stream(self, messages: list):
        """流式调用 LLM（异步生成器）"""
        async for chunk in self.llm.achat(messages):
            yield chunk

    async def _call_llm(self, messages: list) -> str:
        """非流式调用 LLM"""
        return await self.llm.chat(messages)

    def _retrieve_context(self, query: str, chapter: Optional[int] = None) -> str:
        """RAG 检索知识上下文"""
        filter_meta = {"chapter": chapter} if chapter else None
        return self.rag.retrieve(query, filter_metadata=filter_meta)
