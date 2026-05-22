from fastapi import APIRouter, HTTPException

from app.db.repository import get_profile
from app.models.schemas import StudentProfile

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/{user_id}", response_model=StudentProfile)
async def read_profile(user_id: str):
    data = await get_profile(user_id)
    if not data:
        raise HTTPException(404, "画像不存在，请先进行对话构建")
    return StudentProfile(**{k: v for k, v in data.items() if k in StudentProfile.model_fields})
