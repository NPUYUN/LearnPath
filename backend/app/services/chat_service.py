from typing import AsyncIterator

from app.agents.graph import build_graph
from app.agents.supervisor import classify_intent
from app.core.llm import get_llm_client
from app.db.repository import get_profile, save_resources
from app.models.schemas import ChatResponse, StudentProfile


async def run_chat(user_id: str, message: str) -> ChatResponse:
    graph = build_graph()
    intent = classify_intent(message)
    result = await graph.ainvoke(
        {
            "user_id": user_id,
            "messages": [{"role": "user", "content": message}],
            "intent": intent,
            "topic": _extract_topic(message),
        }
    )
    if result.get("resources"):
        await save_resources(user_id, result["resources"])
    profile = result.get("profile")
    if profile:
        profile_obj = StudentProfile(**{k: v for k, v in profile.items() if k != "updated_at" or True})
    else:
        existing = await get_profile(user_id)
        profile_obj = StudentProfile(**existing) if existing else None
    return ChatResponse(
        reply=result.get("reply", "处理完成"),
        profile=profile_obj,
        intent=result.get("intent", "chat"),
    )


async def stream_chat(user_id: str, message: str) -> AsyncIterator[dict]:
    """SSE 事件：token / profile / done"""
    result = await run_chat(user_id, message)
    llm = get_llm_client()
    async for token in llm.stream_chat(
        [{"role": "user", "content": message}]
    ):
        yield {"event": "token", "data": token}
    if result.profile:
        yield {"event": "profile", "data": result.profile.model_dump_json()}
    yield {"event": "done", "data": result.reply}


def _extract_topic(message: str) -> str:
    for kw in ["线性回归", "逻辑回归", "梯度下降", "过拟合", "机器学习"]:
        if kw in message:
            return kw
    return "机器学习导论"
