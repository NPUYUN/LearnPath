import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.deps import ensure_same_user, get_current_user_id
from app.db.repository import delete_library, get_library, list_resources, save_library
from app.models.schemas import (
    CreateLibraryRequest,
    LibraryDetail,
    LibraryFileInfo,
    LibraryFilePreview,
    ResourceLibrarySummary,
    UploadLibraryResponse,
)
from app.services.file_extract_service import supported_extensions
from app.services.library_ingest_service import process_uploaded_files
from app.services.library_service import (
    create_user_library,
    ensure_library_assets,
    list_all_libraries,
    list_library_files_resolved,
    get_library_file_preview,
)

router = APIRouter(prefix="/libraries", tags=["libraries"])


@router.get("/supported-formats")
async def supported_formats():
    exts = supported_extensions()
    return {
        "extensions": exts,
        "hint": "支持 PDF、PPT/PPTX、Word、Excel、Markdown 及常见代码/文本格式",
    }


@router.get("", response_model=list[ResourceLibrarySummary])
async def list_libs(user_id: str = "demo", current_user_id: str = Depends(get_current_user_id)):
    ensure_same_user(user_id, current_user_id)
    return await list_all_libraries(user_id)


@router.post("", response_model=ResourceLibrarySummary)
async def create_lib(req: CreateLibraryRequest, current_user_id: str = Depends(get_current_user_id)):
    ensure_same_user(req.user_id, current_user_id)
    lib = await create_user_library(
        req.user_id,
        req.name,
        req.description,
        requirements=req.requirements,
        source_mode=req.source_mode,
        source_library_id=req.source_library_id,
    )
    return ResourceLibrarySummary(
        id=lib["id"],
        name=lib["name"],
        description=lib.get("description", ""),
        source_type="upload",
        status=lib.get("status", "empty"),
        file_count=0,
        chunk_count=0,
    )


@router.get("/{library_id}", response_model=LibraryDetail)
async def get_lib_detail(
    library_id: str,
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    lib = await get_library(library_id, user_id)
    if not lib:
        raise HTTPException(404, "资料库不存在")
    lib = ensure_library_assets(lib)
    synthesis = dict(lib.get("synthesis") or {})
    if not synthesis.get("resource_manifest"):
        related = []
        for resource in await list_resources(user_id):
            metadata = resource.get("metadata") if isinstance(resource.get("metadata"), dict) else {}
            source_library_id = str(resource.get("library_id") or metadata.get("source_library_id") or "")
            if source_library_id != library_id:
                continue
            related.append(
                {
                    "id": resource.get("id", ""),
                    "title": resource.get("title", ""),
                    "type": resource.get("type", "doc"),
                    "knowledge_points": list(metadata.get("knowledge_points") or []),
                    "learning_purpose": metadata.get("learning_purpose", "explain"),
                    "difficulty": metadata.get("difficulty", "basic"),
                    "quality_score": metadata.get("quality_score", 0),
                    "status": resource.get("status", "published"),
                }
            )
        if related:
            synthesis["resource_manifest"] = related[-300:]
            lib = {**lib, "synthesis": synthesis}
    await save_library(lib)
    files = await list_library_files_resolved(lib)
    resolved_count = len(files)
    return LibraryDetail(
        id=lib["id"],
        name=lib["name"],
        description=lib.get("description", ""),
        source_type=lib.get("source_type", "upload"),
        status=lib.get("status", "empty"),
        file_count=resolved_count if resolved_count else lib.get("file_count", 0),
        chunk_count=lib.get("chunk_count", 0),
        course=lib.get("course", ""),
        created_at=lib.get("created_at", ""),
        updated_at=lib.get("updated_at", ""),
        files=[
            LibraryFileInfo(
                id=f["id"],
                filename=f["filename"],
                mime_type=f.get("mime_type", ""),
                size=f.get("size", 0),
                status=f.get("status", "pending"),
            )
            for f in files
        ],
        synthesis=lib.get("synthesis") or {},
    )


@router.delete("/{library_id}")
async def remove_lib(
    library_id: str,
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    ok = await delete_library(library_id, user_id)
    if not ok:
        raise HTTPException(404, "无法删除该资料库")
    return {"ok": True}


@router.get("/{library_id}/file-preview", response_model=LibraryFilePreview)
async def preview_library_file(
    library_id: str,
    file_id: str,
    user_id: str = "demo",
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    lib = await get_library(library_id, user_id)
    if not lib:
        raise HTTPException(404, "资料库不存在")
    try:
        preview = await get_library_file_preview(lib, file_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not preview:
        raise HTTPException(404, "文件不存在或不可预览")
    return preview


@router.post("/{library_id}/upload", response_model=UploadLibraryResponse)
async def upload_files(
    library_id: str,
    user_id: str = Form("demo"),
    requirements: str = Form(""),
    files: list[UploadFile] = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    if not files:
        raise HTTPException(400, "请至少上传一个文件")

    pairs: list[tuple[str, bytes]] = []
    for f in files:
        data = await f.read()
        if not data:
            continue
        pairs.append((f.filename or "unnamed.txt", data))

    if not pairs:
        raise HTTPException(400, "文件内容为空")

    try:
        result = await process_uploaded_files(user_id, library_id, pairs, requirements=requirements)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    lib = result.get("library")
    summary = None
    if lib:
        summary = ResourceLibrarySummary(
            id=lib["id"],
            name=lib["name"],
            description=lib.get("description", ""),
            source_type=lib.get("source_type", "upload"),
            status=lib.get("status", "ready"),
            file_count=lib.get("file_count", 0),
            chunk_count=lib.get("chunk_count", 0),
        )

    return UploadLibraryResponse(
        library_id=result["library_id"],
        ingested_chunks=result.get("ingested_chunks", 0),
        file_count=result.get("file_count", 0),
        errors=result.get("errors", []),
        library=summary,
    )
