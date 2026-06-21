from fastapi import APIRouter

from app.core.llm import llm_runtime_status

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "learnpath-api",
        "llm": llm_runtime_status(),
        "features": {"path_ai_v2": True, "review_cards": True},
    }
