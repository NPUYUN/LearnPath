from fastapi import APIRouter

from app.models.schemas import GenerateResourcesRequest, LearningResource
from app.services.resource_service import generate_resources, get_user_resources

router = APIRouter(prefix="/resources", tags=["resources"])


@router.post("/generate", response_model=list[LearningResource])
async def generate(req: GenerateResourcesRequest):
    return await generate_resources(req)


@router.get("", response_model=list[LearningResource])
async def list_all(user_id: str = "demo"):
    return await get_user_resources(user_id)
