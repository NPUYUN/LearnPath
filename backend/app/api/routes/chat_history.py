from fastapi import APIRouter, Depends, Query

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.db.repository import (
    append_chat_message,
    clear_chat_messages,
    delete_assistant_for_user_message,
    delete_chat_turn,
    list_chat_messages,
)
from app.models.schemas import ChatHistoryAppend, ChatMessageItem

router = APIRouter(prefix="/chat", tags=["chat-history"])


@router.get("/history/{user_id}", response_model=list[ChatMessageItem])
async def get_history(
    user_id: str = Depends(assert_user_access),
    conversation_id: str | None = Query(None),
):
    rows = list_chat_messages(user_id, conversation_id=conversation_id or None)
    return [ChatMessageItem(**r) for r in rows]


@router.post("/history", response_model=ChatMessageItem)
async def post_history(
    body: ChatHistoryAppend,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(body.user_id, current_user_id)
    row = await append_chat_message(
        body.user_id,
        body.role,
        body.content,
        body.resources,
        conversation_id=body.conversation_id,
        turn_id=body.turn_id or None,
        attachments=[a.model_dump() for a in body.attachments],
    )
    return ChatMessageItem(**row)


@router.delete("/history/{user_id}/turn/{message_id}")
async def remove_turn(
    user_id: str,
    message_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    ok = await delete_chat_turn(user_id, message_id)
    if not ok:
        from fastapi import HTTPException

        raise HTTPException(404, "对话不存在或无法删除")
    return {"ok": True}


@router.delete("/history/{user_id}/turn/{message_id}/assistant")
async def remove_assistant_reply(
    user_id: str,
    message_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    ok = await delete_assistant_for_user_message(user_id, message_id)
    if not ok:
        from fastapi import HTTPException

        raise HTTPException(404, "未找到可删除的助手回复")
    return {"ok": True}


@router.delete("/history/{user_id}")
async def clear_history(
    user_id: str,
    conversation_id: str | None = Query(None),
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    count = await clear_chat_messages(user_id, conversation_id=conversation_id or None)
    return {"ok": True, "deleted": count}
