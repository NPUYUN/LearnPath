"""Supervisor：根据用户消息分类意图并路由到对应 Agent 节点。"""

from app.agents.state import AgentState

GENERATE_KEYWORDS = ["生成", "出题", "思维导图", "文档", "练习", "资源", "案例"]
PATH_KEYWORDS = ["路径", "计划", "下一步", "学什么", "规划"]
TUTOR_KEYWORDS = ["为什么", "不懂", "解释", "辅导", "答疑", "?", "？", "吗", "怎么理解"]
EVAL_KEYWORDS = ["评估", "测验结果", "掌握度", "成绩"]


def classify_intent(message: str) -> str:
    text = message.strip()
    if any(k in text for k in EVAL_KEYWORDS):
        return "eval"
    if any(k in text for k in TUTOR_KEYWORDS):
        return "tutor"
    if any(k in text for k in PATH_KEYWORDS):
        return "path"
    if any(k in text for k in GENERATE_KEYWORDS):
        return "generate"
    if any(k in text for k in ["画像", "我是", "专业", "基础", "目标", "风格"]):
        return "profile"
    return "profile"  # 默认走画像对话


async def supervisor_node(state: AgentState) -> dict:
    messages = state.get("messages") or []
    last_user = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            last_user = m.get("content", "")
            break
    intent = state.get("intent") or classify_intent(last_user)
    return {"intent": intent}
