from fastapi import APIRouter, Depends

from app.api.deps import assert_user_access
from app.db.repository import get_preferences, set_preferences
from app.models.schemas import UserPreferences, UserPreferencesUpdate

router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get("/{user_id}", response_model=UserPreferences)
async def read_preferences(user_id: str = Depends(assert_user_access)):
    data = await get_preferences(user_id)
    return UserPreferences(**data)


@router.patch("/{user_id}", response_model=UserPreferences)
async def patch_preferences(
    body: UserPreferencesUpdate,
    user_id: str = Depends(assert_user_access),
):
    patch = body.model_dump(exclude_unset=True)
    data = await set_preferences(user_id, patch)
    return UserPreferences(**data)
