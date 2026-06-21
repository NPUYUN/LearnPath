from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.models.schemas import MasteryFeedbackRequest, MasteryFeedbackResponse, MasteryRecord
from app.services.mastery_service import list_mastery_records, submit_mastery_feedback

router = APIRouter(prefix="/mastery", tags=["mastery"])


@router.post("/feedback", response_model=MasteryFeedbackResponse)
async def mastery_feedback(
    body: MasteryFeedbackRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(body.user_id, current_user_id)
    try:
        result = await submit_mastery_feedback(
            body.user_id,
            body.mastery_level,
            resource_id=body.resource_id,
            step_key=body.step_key,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return MasteryFeedbackResponse(**result)


@router.get("/{user_id}/records")
async def read_mastery_records(user_id: str = Depends(assert_user_access)):
    records = await list_mastery_records(user_id)
    return {"user_id": user_id, "records": records}
