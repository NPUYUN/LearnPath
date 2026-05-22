from app.agents.state import AgentState
from app.core.guardrails import attach_sources, filter_sensitive
from app.core.llm import get_llm_client
from app.rag.retriever import retrieve


async def tutor_node(state: AgentState) -> dict:
    messages = state.get("messages") or []
    question = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            question = m.get("content", "")
            break
    chunks = await retrieve(question or "机器学习", k=3)
    context = "\n".join(c["text"] for c in chunks)
    llm = get_llm_client()
    answer = await llm.chat(
        [
            {"role": "system", "content": "你是学径辅导老师，基于知识库回答，不确定请说明。"},
            {"role": "user", "content": f"问题：{question}\n\n知识库：{context}"},
        ]
    )
    answer = attach_sources(filter_sensitive(answer), chunks)
    return {"reply": answer, "rag_context": context}
