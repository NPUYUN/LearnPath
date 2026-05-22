from typing import AsyncIterator

from app.agents.graph import build_graph
from app.agents.supervisor import classify_intent
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
    """SSE 事件：token / profile / done
    直接流式切块输出已有回复，避免二次 LLM 调用造成超时和 network error。
    """
    try:
        result = await run_chat(user_id, message)
    except Exception as exc:
        yield {"event": "error", "data": str(exc)}
        return
    reply = result.reply
    chunk_size = 8
    for i in range(0, len(reply), chunk_size):
        yield {"event": "token", "data": reply[i : i + chunk_size]}
    if result.profile:
        yield {"event": "profile", "data": result.profile.model_dump_json()}
    yield {"event": "done", "data": reply}


def _extract_topic(message: str) -> str:
    for kw in ["线性回归", "逻辑回归", "梯度下降", "过拟合", "机器学习"]:
        if kw in message:
            return kw
    return "机器学习导论"
