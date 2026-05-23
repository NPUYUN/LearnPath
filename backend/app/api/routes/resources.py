import json

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.db.repository import get_resource, record_event
from app.models.schemas import GenerateResourcesRequest, LearningResource, ResourceRecommendation
from app.services.recommendation_service import get_recommendations
from app.services.resource_service import generate_resources, get_user_resources, stream_generate_resources

router = APIRouter(prefix="/resources", tags=["resources"])


@router.post("/generate", response_model=list[LearningResource])
async def generate(
    req: GenerateResourcesRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    return await generate_resources(req)


@router.post("/generate/stream")
async def generate_stream(
    req: GenerateResourcesRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)

    async def event_generator():
        async for item in stream_generate_resources(req):
            yield {
                "event": item["event"],
                "data": item["data"] if isinstance(item["data"], str) else json.dumps(item["data"], ensure_ascii=False),
            }

    return EventSourceResponse(event_generator())


@router.get("", response_model=list[LearningResource])
async def list_all(
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    return await get_user_resources(user_id)


@router.get("/recommendations", response_model=list[ResourceRecommendation])
async def recommendations(
    user_id: str = "demo",
    limit: int = 5,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    return await get_recommendations(user_id, limit=min(limit, 10))


@router.post("/{resource_id}/view")
async def resource_view(
    resource_id: str,
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    if not await get_resource(user_id, resource_id):
        raise HTTPException(404, "资源不存在")
    await record_event(user_id, "resource_view", resource_id=resource_id)
    return {"ok": True}


@router.post("/{resource_id}/complete")
async def resource_complete(
    resource_id: str,
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    if not await get_resource(user_id, resource_id):
        raise HTTPException(404, "资源不存在")
    await record_event(user_id, "resource_complete", resource_id=resource_id)
    return {"ok": True}
