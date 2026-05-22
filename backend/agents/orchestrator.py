"""
协调智能体（Orchestrator）
负责：
1. 解析用户意图
2. 决定路由到哪个智能体
3. 汇总最终结果

TODO（开发者任务）：
1. 完善意图识别提示词，覆盖更多边缘情况
2. 添加多轮对话上下文理解
3. 实现"防幻觉"检查：对生成结果进行事实性验证
"""
import json
from backend.agents.base_agent import BaseAgent
from backend.models.state import AgentState


INTENT_RECOGNITION_PROMPT = """你是一个教育助手系统的协调者。
分析用户的最新消息，判断用户意图，从以下选项中选择最合适的一个：

1. build_profile — 用户想要构建或更新个人学习画像
2. generate_resources — 用户想要生成学习资源（文档/思维导图/题目/视频/代码）
3. plan_path — 用户想要制定或查看学习路径
4. tutor — 用户有具体问题需要解答/辅导
5. evaluate — 用户想要查看学习效果评估
6. general_chat — 一般性对话，不属于以上类别

仅返回 JSON，格式：
{"intent": "<意图>", "topic": "<学习主题，如无则为空字符串>", "reason": "<判断理由>"}"""


class OrchestratorAgent(BaseAgent):
    """
    主协调智能体
    
    职责：
    - 解析用户意图 → 设置 state["current_intent"] 和 state["next_agent"]
    - 协调各专业智能体的工作顺序
    - 整合多智能体输出为最终响应
    """

    name = "orchestrator"
    description = "主协调智能体，负责意图识别和任务分发"

    def run(self, state: AgentState) -> AgentState:
        """
        解析用户最新消息，识别意图并设置路由

        TODO:
        - 添加对话上下文感知（参考历史消息判断意图）
        - 对于 generate_resources 意图，提取具体需要生成的资源类型
        """
        messages = state.get("messages", [])
        if not messages:
            return {**state, "next_agent": "profile", "current_intent": "build_profile"}

        # 构建意图识别请求
        llm_messages = [
            {"role": "system", "content": INTENT_RECOGNITION_PROMPT},
            {"role": "user", "content": f"用户消息：{messages[-1].get('content', '')}"},
        ]

        # TODO: 这里需要改为 async 调用，当前为示意
        # response = await self._call_llm(llm_messages)
        # 占位示例（实际需要调用 LLM）
        response = '{"intent": "generate_resources", "topic": "", "reason": "用户请求生成资源"}'

        try:
            result = json.loads(response)
            intent = result.get("intent", "general_chat")
            topic = result.get("topic", "")
        except json.JSONDecodeError:
            intent = "general_chat"
            topic = ""

        # 意图 → 下一个智能体映射
        intent_to_agent = {
            "build_profile": "profile",
            "generate_resources": "resource_generator",
            "plan_path": "curriculum",
            "tutor": "tutor",
            "evaluate": "evaluator",
            "general_chat": "general_chat",
        }

        return {
            **state,
            "current_intent": intent,
            "current_topic": topic,
            "next_agent": intent_to_agent.get(intent, "general_chat"),
        }
