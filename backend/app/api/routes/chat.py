import json

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.api.deps import get_current_user_id
from app.models.schemas import AttachmentContextRequest, ChatRequest, ChatResponse
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
    return await run_chat(
        req.user_id,
        req.message,
        deep_thinking=req.deep_thinking,
        web_search=req.web_search,
        attachment_context=req.attachment_context,
        attachments=[a.model_dump() for a in req.attachments] if req.attachments else None,
    )


@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    _check_user(req.user_id, current_user_id)

    def _encode_sse_data(event: str, data: object) -> str:
        # token/done 用 JSON 编码，避免 SSE 传输时丢失换行导致 Markdown 表格错乱
        if event in ("token", "done") and isinstance(data, str):
            return json.dumps(data, ensure_ascii=False)
        if isinstance(data, str):
            return data
        return json.dumps(data, ensure_ascii=False, default=str)

    async def event_generator():
        async for item in stream_chat(
            req.user_id,
            req.message,
            chunk_size=req.chunk_size,
            deep_thinking=req.deep_thinking,
            web_search=req.web_search,
            attachment_context=req.attachment_context,
            attachments=[a.model_dump() for a in req.attachments] if req.attachments else None,
        ):
            yield {
                "event": item["event"],
                "data": _encode_sse_data(item["event"], item["data"]),
            }

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
