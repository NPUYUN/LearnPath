from fastapi import APIRouter, Depends

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.db.repository import append_chat_message, list_chat_messages
from app.models.schemas import ChatHistoryAppend, ChatMessageItem

router = APIRouter(prefix="/chat", tags=["chat-history"])


@router.get("/history/{user_id}", response_model=list[ChatMessageItem])
async def get_history(user_id: str = Depends(assert_user_access)):
    rows = list_chat_messages(user_id)
    return [ChatMessageItem(**r) for r in rows]


@router.post("/history", response_model=ChatMessageItem)
async def post_history(
    body: ChatHistoryAppend,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(body.user_id, current_user_id)
    row = await append_chat_message(
        body.user_id, body.role, body.content, body.resources
    )
    return ChatMessageItem(**row)
