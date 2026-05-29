from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.db.repository import (
    create_chat_conversation,
    delete_chat_conversation,
    get_chat_conversation,
    list_chat_conversations,
    list_chat_messages,
)
from app.models.schemas import (
    ChatConversationSummary,
    ChatMessageItem,
    CreateChatConversationRequest,
)

router = APIRouter(prefix="/chat", tags=["chat-conversations"])


@router.get("/conversations/{user_id}", response_model=list[ChatConversationSummary])
async def get_conversations(user_id: str = Depends(assert_user_access)):
    rows = await list_chat_conversations(user_id)
    return [ChatConversationSummary(**r) for r in rows]


@router.post("/conversations", response_model=ChatConversationSummary)
async def post_conversation(
    body: CreateChatConversationRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(body.user_id, current_user_id)
    row = await create_chat_conversation(body.user_id, body.title)
    return ChatConversationSummary(**row)


@router.get("/conversations/{user_id}/{conversation_id}", response_model=list[ChatMessageItem])
async def get_conversation_messages(
    user_id: str,
    conversation_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    conv = await get_chat_conversation(conversation_id, user_id)
    if not conv:
        raise HTTPException(404, "对话不存在")
    rows = list_chat_messages(user_id, conversation_id=conversation_id)
    return [ChatMessageItem(**r) for r in rows]


@router.delete("/conversations/{user_id}/{conversation_id}")
async def remove_conversation(
    user_id: str,
    conversation_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    ok = await delete_chat_conversation(conversation_id, user_id)
    if not ok:
        raise HTTPException(404, "对话不存在")
    return {"ok": True}
