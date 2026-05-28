from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.db.repository import get_profile
from app.models.schemas import ProfileRefreshResponse, StudentProfile
from app.services.profile_refresh_service import (
    _gather_learning_signals,
    refresh_profile_from_activity,
)

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/{user_id}", response_model=StudentProfile)
async def read_profile(user_id: str = Depends(assert_user_access)):
    data = await get_profile(user_id)
    if not data:
        raise HTTPException(404, "画像不存在，请先进行对话构建")
    return StudentProfile(**{k: v for k, v in data.items() if k in StudentProfile.model_fields})


@router.get("/{user_id}/signals")
async def profile_signals(user_id: str = Depends(assert_user_access)):
    signals = await _gather_learning_signals(user_id)
    return {
        "chat_turns": signals["chat_turn_count"],
        "resource_views": signals["resource_view_count"],
        "resources_owned": signals["owned_resource_count"],
        "topics": signals["topics"],
    }


@router.post("/{user_id}/refresh", response_model=ProfileRefreshResponse)
async def refresh_profile(
    user_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    result = await refresh_profile_from_activity(user_id)
    prof = result["profile"]
    return ProfileRefreshResponse(
        profile=StudentProfile(**{k: v for k, v in prof.items() if k in StudentProfile.model_fields}),
        message=result.get("message", "画像已更新"),
        sources=result.get("sources") or {},
    )
