"""复习卡专用路由（独立于 /resources，避免与 /{resource_id} 冲突或旧进程路由缓存问题）。"""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import ensure_same_user, get_current_user_id
from app.models.schemas import GenerateReviewCardRequest, LearningResource
from app.services.resource_metadata_service import with_resource_metadata
from app.services.review_card_service import generate_review_card, list_review_cards

router = APIRouter(prefix="/review-cards", tags=["review-cards"])


@router.get("", response_model=list[LearningResource])
async def list_cards(
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
) -> list[LearningResource]:
    ensure_same_user(user_id, current_user_id)
    rows = await list_review_cards(user_id)
    return [LearningResource(**with_resource_metadata(row)) for row in rows]


@router.post("/generate", response_model=LearningResource)
async def generate_card(
    req: GenerateReviewCardRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    try:
        row = await generate_review_card(req.user_id, req.topic)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return LearningResource(**with_resource_metadata(row))
