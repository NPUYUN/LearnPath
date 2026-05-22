from fastapi import APIRouter, HTTPException

from app.db.repository import get_user_account, update_user_account
from app.models.schemas import UserAccount, UserAccountUpdate

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/{user_id}", response_model=UserAccount)
async def read_account(user_id: str):
    data = await get_user_account(user_id)
    if not data:
        raise HTTPException(404, "用户不存在")
    return UserAccount(**data)


@router.patch("/{user_id}", response_model=UserAccount)
async def patch_account(user_id: str, body: UserAccountUpdate):
    data = await update_user_account(user_id, body.model_dump(exclude_unset=True))
    if not data:
        raise HTTPException(404, "用户不存在")
    return UserAccount(**data)
