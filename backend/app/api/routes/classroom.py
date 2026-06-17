import uuid
from io import BytesIO
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.api.deps import ensure_same_user, get_current_user_id
from app.db.classroom_library_repository import (
    attach_regenerated_job,
    delete_classroom_library_item,
    get_classroom_library_item,
    get_library_request,
    list_classroom_library,
    set_classroom_library_favorite,
)
from app.models.schemas import (
    ClassroomGenerateRequest,
    ClassroomGenerationJob,
    ClassroomInteractionRequest,
    ClassroomInteractionResponse,
    ClassroomLibraryFavoriteUpdate,
    ClassroomLibraryItem,
    ClassroomLibraryListResponse,
    ClassroomParsedMaterial,
    ClassroomParseMaterialsResponse,
    ClassroomPptxExportRequest,
    ClassroomQuizRequest,
    ClassroomQuizResponse,
    ClassroomSessionResponse,
)
from app.services.file_extract_service import extract_text_from_bytes, guess_mime
from app.services.classroom_pptx_service import build_classroom_pptx
from app.services.classroom_job_service import (
    create_classroom_generation_job,
    delete_classroom_generation_job,
    get_classroom_generation_job,
    restart_classroom_generation_job,
)
from app.services.classroom_service import generate_classroom_interaction, generate_classroom_quiz, generate_classroom_session

router = APIRouter(prefix="/classroom", tags=["classroom"])


@router.post("/session", response_model=ClassroomSessionResponse)
async def create_classroom_session(
    req: ClassroomGenerateRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    return await generate_classroom_session(req)


@router.post("/session/export-pptx")
async def export_classroom_session_pptx(
    req: ClassroomPptxExportRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    data = build_classroom_pptx(req.session)
    safe_title = "".join(ch for ch in (req.session.title or "AI课堂") if ch not in '\\/:*?"<>|').strip()
    filename = f"{safe_title or 'AI课堂'}.pptx"
    encoded_filename = quote(filename)
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )


@router.post("/session/jobs", response_model=ClassroomGenerationJob)
async def create_classroom_session_job(
    req: ClassroomGenerateRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    return create_classroom_generation_job(req)


@router.post("/quiz", response_model=ClassroomQuizResponse)
async def create_classroom_quiz(
    req: ClassroomQuizRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    return await generate_classroom_quiz(req)


@router.post("/interaction", response_model=ClassroomInteractionResponse)
async def create_classroom_interaction(
    req: ClassroomInteractionRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    return await generate_classroom_interaction(req)


@router.get("/session/jobs/{job_id}", response_model=ClassroomGenerationJob)
async def get_classroom_session_job(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    job = get_classroom_generation_job(job_id)
    if not job:
        raise HTTPException(404, "课堂生成任务不存在")
    ensure_same_user(job.user_id, current_user_id)
    return job


@router.get("/library", response_model=ClassroomLibraryListResponse)
async def list_classroom_library_route(
    current_user_id: str = Depends(get_current_user_id),
):
    items = list_classroom_library(current_user_id)
    return ClassroomLibraryListResponse(items=items)


@router.get("/library/{item_id}", response_model=ClassroomLibraryItem)
async def get_classroom_library_route(
    item_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    item = get_classroom_library_item(item_id, current_user_id)
    if not item:
        raise HTTPException(404, "课堂记录不存在")
    return item


@router.delete("/library/{item_id}")
async def delete_classroom_library_route(
    item_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    item = get_classroom_library_item(item_id, current_user_id)
    if not item:
        raise HTTPException(404, "课堂记录不存在")
    delete_classroom_generation_job(item.job_id)
    if not delete_classroom_library_item(item_id, current_user_id):
        raise HTTPException(404, "课堂记录不存在")
    return {"ok": True}


@router.patch("/library/{item_id}", response_model=ClassroomLibraryItem)
async def patch_classroom_library_route(
    item_id: str,
    body: ClassroomLibraryFavoriteUpdate,
    current_user_id: str = Depends(get_current_user_id),
):
    item = set_classroom_library_favorite(item_id, current_user_id, body.is_favorite)
    if not item:
        raise HTTPException(404, "课堂记录不存在")
    return item


@router.post("/library/{item_id}/regenerate", response_model=ClassroomLibraryItem)
async def regenerate_classroom_library_route(
    item_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    req = get_library_request(item_id, current_user_id)
    if not req:
        raise HTTPException(404, "课堂记录不存在或缺少生成参数")
    ensure_same_user(req.user_id, current_user_id)
    existing = get_classroom_library_item(item_id, current_user_id)
    if not existing:
        raise HTTPException(404, "课堂记录不存在")
    delete_classroom_generation_job(existing.job_id)
    job = restart_classroom_generation_job(req)
    item = attach_regenerated_job(item_id, current_user_id, job)
    if not item:
        raise HTTPException(404, "课堂记录不存在")
    return item


@router.post("/materials/parse", response_model=ClassroomParseMaterialsResponse)
async def parse_classroom_materials(
    user_id: str = Form("demo"),
    files: list[UploadFile] = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    materials: list[ClassroomParsedMaterial] = []
    for file in files[:8]:
        name = file.filename or "unnamed.txt"
        data = await file.read()
        mime_type = file.content_type or guess_mime(name)
        if not data:
            materials.append(
                ClassroomParsedMaterial(
                    id=str(uuid.uuid4()),
                    title=name,
                    size=0,
                    mime_type=mime_type,
                    status="error",
                    error="文件内容为空",
                )
            )
            continue
        try:
            text = extract_text_from_bytes(name, data)
            excerpt = text.strip()[:8000]
            materials.append(
                ClassroomParsedMaterial(
                    id=str(uuid.uuid4()),
                    title=name,
                    size=len(data),
                    mime_type=mime_type,
                    content_excerpt=excerpt,
                    status="parsed" if excerpt else "recorded",
                    error="" if excerpt else "未提取到正文",
                )
            )
        except ValueError as exc:
            materials.append(
                ClassroomParsedMaterial(
                    id=str(uuid.uuid4()),
                    title=name,
                    size=len(data),
                    mime_type=mime_type,
                    status="error",
                    error=str(exc),
                )
            )
    return ClassroomParseMaterialsResponse(materials=materials)
