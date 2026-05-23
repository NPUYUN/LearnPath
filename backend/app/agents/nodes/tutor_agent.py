from app.agents.nodes.tutor_llm import run_tutor_llm
from app.agents.state import AgentState


async def tutor_node(state: AgentState) -> dict:
    messages = state.get("messages") or []
    topic = state.get("topic") or "机器学习导论"
    deep = bool(state.get("deep_thinking"))
    question = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            question = m.get("content", "")
            break
    answer = await run_tutor_llm(question, topic, deep_thinking=deep)
    return {"reply": answer}
