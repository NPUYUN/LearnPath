from fastapi import APIRouter

from app.core.llm import llm_runtime_status

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {"status": "ok", "service": "learnpath-api", "llm": llm_runtime_status()}
