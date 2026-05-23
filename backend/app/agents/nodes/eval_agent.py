from app.agents.state import AgentState
from app.core.prompts import chat_reply_hint
from app.db.repository import get_last_quiz_attempt


async def eval_node(state: AgentState) -> dict:
    user_id = state.get("user_id", "demo")
    profile = state.get("profile") or {}
    deep = bool(state.get("deep_thinking"))
    last = await get_last_quiz_attempt(user_id)
    base = chat_reply_hint("eval", deep)
    if last:
        reply = (
            f"{base}\n\n"
            f"- 最近一次测验：**{last.get('score', 0)}/{last.get('total', 0)}**\n"
            f"- 当前基础：{profile.get('knowledge_level', '未评估')}\n"
            f"- 近期进度：{profile.get('recent_progress', '—')}"
        )
    else:
        reply = (
            f"{base}\n\n"
            f"- 当前基础：{profile.get('knowledge_level', '未评估')}\n"
            "- 尚未提交测验：请先在「资源库」生成题库并完成答题。"
        )
    return {"reply": reply}
