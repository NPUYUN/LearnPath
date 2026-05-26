import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.deps import ensure_same_user, get_current_user_id
from app.db.repository import delete_library, get_library, list_library_files
from app.models.schemas import (
    CreateLibraryRequest,
    LibraryDetail,
    LibraryFileInfo,
    ResourceLibrarySummary,
    UploadLibraryResponse,
)
from app.services.file_extract_service import supported_extensions
from app.services.library_ingest_service import process_uploaded_files
from app.services.library_service import create_user_library, list_all_libraries

router = APIRouter(prefix="/libraries", tags=["libraries"])


@router.get("/supported-formats")
async def supported_formats():
    return {"extensions": supported_extensions()}


@router.get("", response_model=list[ResourceLibrarySummary])
async def list_libs(user_id: str = "demo", current_user_id: str = Depends(get_current_user_id)):
    ensure_same_user(user_id, current_user_id)
    return await list_all_libraries(user_id)


@router.post("", response_model=ResourceLibrarySummary)
async def create_lib(req: CreateLibraryRequest, current_user_id: str = Depends(get_current_user_id)):
    ensure_same_user(req.user_id, current_user_id)
    lib = await create_user_library(req.user_id, req.name, req.description)
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
    files = await list_library_files(library_id)
    return LibraryDetail(
        id=lib["id"],
        name=lib["name"],
        description=lib.get("description", ""),
        source_type=lib.get("source_type", "upload"),
        status=lib.get("status", "empty"),
        file_count=lib.get("file_count", len(files)),
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


@router.post("/{library_id}/upload", response_model=UploadLibraryResponse)
async def upload_files(
    library_id: str,
    user_id: str = Form("demo"),
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
        result = await process_uploaded_files(user_id, library_id, pairs)
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
