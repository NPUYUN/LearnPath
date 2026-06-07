"""辅导节点：面向概念解释与答疑的独立 Agent。"""

from app.agents.state import AgentState
from app.agents.nodes.tutor_llm import run_tutor_llm
from app.core.guardrails import filter_sensitive


async def tutor_node(state: AgentState) -> dict:
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

    reply = await run_tutor_llm(
        question,
        topic,
        user_id=user_id,
        profile=profile,
        resources=resources,
        deep_thinking=deep,
    )
    return {"intent": "tutor", "reply": filter_sensitive(reply)}
