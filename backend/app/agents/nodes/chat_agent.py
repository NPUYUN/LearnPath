"""智能对话节点：资源库检索 → 润色/直答 → 多模态输出 → 画像增量。"""

from app.agents.state import AgentState
from app.core.guardrails import filter_sensitive
from app.services.chat_intelligence_service import run_intelligent_chat


async def chat_node(state: AgentState) -> dict:
    messages = state.get("messages") or []
    user_id = state.get("user_id", "demo")
    topic = state.get("topic") or "综合学习"
    deep = bool(state.get("deep_thinking"))
    profile = state.get("profile")
    resources = state.get("resources") or []

    question = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            question = m.get("content", "")
            break

    result = await run_intelligent_chat(
        user_id,
        question,
        topic,
        profile=profile,
        resources=resources,
        deep_thinking=deep,
        update_profile=True,
    )

    out: dict = {
        "reply": filter_sensitive(result.get("reply") or ""),
        "question_type": result.get("question_type", "general"),
        "retrieval_mode": result.get("retrieval_mode", "direct"),
    }
    if result.get("profile"):
        out["profile"] = result["profile"]
    return out
