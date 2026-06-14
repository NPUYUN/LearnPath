import json

import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sse_starlette.sse import EventSourceResponse

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.db.repository import delete_resource, delete_unstarred_resources, get_resource, record_event
from app.models.schemas import (
    GenerateResourcesRequest,
    LearningPath,
    LearningResource,
    PathResourceRegenMeta,
    PathResourceRegenRequest,
    PathResourceRegenResponse,
    PathResourceRegenStageMeta,
    ResourceRegenerateRequest,
    ResourceRecommendation,
)
from app.services.path_resource_regen_service import regen_path_resources
from app.services.recommendation_service import get_recommendations
from app.services.resource_service import (
    generate_resources,
    get_user_resources,
    regenerate_resource,
    stream_generate_resources,
)

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


@router.post("/regen-for-path", response_model=PathResourceRegenResponse)
async def regen_resources_for_path(
    req: PathResourceRegenRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    """第五步：按路径各阶段强制重新生成高质量配套资源。"""
    ensure_same_user(req.user_id, current_user_id)
    uid = req.user_id
    library_id = req.library_id
    try:
        result = await regen_path_resources(uid, library_id=library_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"配套资源生成失败：{exc}") from exc

    path = result["path"]
    meta = result.get("meta") or {}
    raw_resources = result.get("resources") or []
    resources = [
        LearningResource(
            id=r.get("id", ""),
            type=r.get("type", "doc"),
            title=r.get("title", ""),
            content=r.get("content", ""),
            sources=r.get("sources", []),
            topic=r.get("topic", ""),
            generation_mode=r.get("generation_mode", ""),
            library_id=r.get("library_id", ""),
            library_name=r.get("library_name", ""),
        )
        for r in raw_resources
        if r.get("id")
    ]
    stage_rows = meta.get("stages") or []
    return PathResourceRegenResponse(
        path=LearningPath(**path),
        resources=resources,
        meta=PathResourceRegenMeta(
            generated_count=int(meta.get("generated_count") or 0),
            stages_processed=int(meta.get("stages_processed") or 0),
            type_breakdown=dict(meta.get("type_breakdown") or {}),
            stages=[PathResourceRegenStageMeta(**s) for s in stage_rows],
            quality_checked=bool(meta.get("quality_checked", True)),
            generation_mode=str(meta.get("generation_mode") or "web"),
            library_name=str(meta.get("library_name") or ""),
            library_id=str(meta.get("library_id") or ""),
            fallback_count=int(meta.get("fallback_count") or 0),
            fallback_warnings=list(meta.get("fallback_warnings") or []),
            forced_regen=bool(meta.get("forced_regen", True)),
        ),
    )


@router.post("/clear-unstarred")
async def clear_unstarred_resources(
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    return await delete_unstarred_resources(user_id)


@router.get("/recommendations", response_model=list[ResourceRecommendation])
async def recommendations(
    user_id: str = "demo",
    limit: int = 5,
    refresh: bool = False,
    offset: int = 0,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    return await get_recommendations(
        user_id,
        limit=min(limit, 10),
        refresh=refresh,
        offset=offset,
    )


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


def _safe_download_filename(title: str) -> str:
    base = re.sub(r'[\\/:*?"<>|]', "_", (title or "学习资源").strip())[:80]
    return f"{base or '学习资源'}.md"


def _content_disposition_attachment(filename: str) -> str:
    """Build RFC 5987 attachment header; ASCII fallback avoids latin-1 header errors."""
    encoded = quote(filename, safe="")
    stem, dot, ext = filename.rpartition(".")
    ascii_stem = re.sub(r"[^\x20-\x7E]", "_", stem).strip("._")
    ascii_ext = re.sub(r"[^\x20-\x7E]", "", ext).strip("._") or "md"
    ascii_name = (
        f"{ascii_stem}.{ascii_ext}"
        if ascii_stem
        else f"learnpath-resource.{ascii_ext}"
    )
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


@router.get("/{resource_id}/download")
async def download_resource(
    resource_id: str,
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
):
    """下载资源 Markdown 到浏览器默认「下载」文件夹。"""
    ensure_same_user(user_id, current_user_id)
    row = await get_resource(user_id, resource_id)
    if not row:
        raise HTTPException(404, "资源不存在")

    title = str(row.get("title") or "学习资源")
    topic = str(row.get("topic") or "—")
    content = str(row.get("content") or "").strip()
    body = f"# {title}\n\n> 主题：{topic}\n\n{content}"
    filename = _safe_download_filename(title)

    return Response(
        content=("\ufeff" + body).encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": _content_disposition_attachment(filename)},
    )


@router.get("/{resource_id}", response_model=LearningResource)
async def get_one(
    resource_id: str,
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    row = await get_resource(user_id, resource_id)
    if not row:
        raise HTTPException(404, "资源不存在")
    return LearningResource(
        id=row.get("id", resource_id),
        type=row.get("type", "doc"),
        title=row.get("title", ""),
        content=row.get("content", ""),
        sources=row.get("sources", []),
        topic=row.get("topic", ""),
        generation_mode=row.get("generation_mode", ""),
        library_id=row.get("library_id", ""),
        library_name=row.get("library_name", ""),
    )


@router.post("/{resource_id}/regenerate", response_model=LearningResource)
async def regenerate_one(
    resource_id: str,
    req: ResourceRegenerateRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    try:
        return await regenerate_resource(resource_id, req)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.delete("/{resource_id}")
async def remove_one(
    resource_id: str,
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    ok = await delete_resource(user_id, resource_id)
    if not ok:
        raise HTTPException(404, "资源不存在")
    return {"ok": True}
