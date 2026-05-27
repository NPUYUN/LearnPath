import json

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.api.deps import get_current_user_id
from app.models.schemas import ChatRequest, ChatResponse
from app.services.chat_service import run_chat, stream_chat

router = APIRouter(prefix="/chat", tags=["chat"])


def _check_user(req_user_id: str, current_user_id: str) -> None:
    if req_user_id != current_user_id:
        raise HTTPException(403, "无权访问该用户数据")


@router.post("", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    _check_user(req.user_id, current_user_id)
    return await run_chat(req.user_id, req.message, deep_thinking=req.deep_thinking)


@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    _check_user(req.user_id, current_user_id)

    async def event_generator():
        async for item in stream_chat(
            req.user_id,
            req.message,
            chunk_size=req.chunk_size,
            deep_thinking=req.deep_thinking,
        ):
            yield {
                "event": item["event"],
                "data": item["data"] if isinstance(item["data"], str) else json.dumps(item["data"], ensure_ascii=False),
            }

    return EventSourceResponse(event_generator())
