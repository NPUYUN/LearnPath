"""Supervisor：根据用户消息分类意图并路由到对应 Agent 节点。"""

from app.agents.state import AgentState

CHAT_META_KEYWORDS = [
    "你是谁",
    "你叫什么",
    "你能做什么",
    "你有什么功能",
    "你能怎么帮",
    "你可以怎么帮",
    "怎么帮我",
    "能帮我",
    "介绍一下你自己",
    "学径是什么",
    "learnpath",
]
GENERATE_KEYWORDS = ["生成", "出题", "思维导图", "文档", "练习", "资源", "案例"]
PATH_KEYWORDS = ["路径", "计划", "下一步", "学什么", "规划"]
TUTOR_KEYWORDS = [
    "为什么",
    "不懂",
    "解释",
    "辅导",
    "答疑",
    "?",
    "？",
    "吗",
    "怎么理解",
    "如何理解",
    "是什么",
    "区别",
    "原理",
]
PROFILE_KEYWORDS = [
    "更新画像",
    "同步画像",
    "刷新画像",
]
EVAL_KEYWORDS = ["评估", "测验结果", "掌握度", "成绩"]
CODE_KEYWORDS = ["代码", "编程", "python", "实现", "报错"]
MEDIA_KEYWORDS = ["视频", "分镜", "演示"]


def classify_intent(message: str) -> str:
    text = message.strip()
    if any(k.lower() in text.lower() for k in CHAT_META_KEYWORDS):
        return "chat"
    if any(k in text for k in EVAL_KEYWORDS):
        return "eval"
    if any(k in text for k in GENERATE_KEYWORDS):
        return "generate"
    if any(k in text for k in PATH_KEYWORDS):
        return "path"
    # 仅「更新/同步画像」走专用节点；其余问答（含构建画像、自我介绍）统一走 chat
    if any(k in text for k in PROFILE_KEYWORDS):
        return "profile"
    if any(k in text for k in TUTOR_KEYWORDS):
        return "tutor"
    # 代码、视频、练习等保留在智能对话管线，便于多模态/附件上下文处理
    if any(k in text for k in CODE_KEYWORDS + MEDIA_KEYWORDS):
        return "chat"
    if any(k in text for k in ["练习", "做题", "计算", "求解"]):
        return "chat"
    return "chat"


async def supervisor_node(state: AgentState) -> dict:
    messages = state.get("messages") or []
    last_user = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            last_user = m.get("content", "")
            break
    intent = state.get("intent") or classify_intent(last_user)
    return {"intent": intent}
