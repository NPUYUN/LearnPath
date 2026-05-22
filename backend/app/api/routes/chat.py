import json

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.models.schemas import ChatRequest, ChatResponse
from app.services.chat_service import run_chat, stream_chat

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    return await run_chat(req.user_id, req.message)


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    async def event_generator():
        async for item in stream_chat(req.user_id, req.message):
            yield {
                "event": item["event"],
                "data": item["data"] if isinstance(item["data"], str) else json.dumps(item["data"], ensure_ascii=False),
            }

    return EventSourceResponse(event_generator())
