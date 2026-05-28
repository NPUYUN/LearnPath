"""聊天附件上传与读取。"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import ensure_same_user, get_current_user_id
from app.core.config import ROOT_DIR
from app.models.schemas import ChatAttachmentMeta
from app.services.file_extract_service import extract_text_from_bytes, supported_extensions

router = APIRouter(prefix="/chat", tags=["chat-attachments"])

_UPLOAD_ROOT = ROOT_DIR / "storage" / "chat_uploads"
_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
_MAX_FILES = 8
_MAX_BYTES = 12 * 1024 * 1024


def _user_dir(user_id: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in user_id)[:64]
    path = _UPLOAD_ROOT / safe
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.post("/attachments", response_model=list[ChatAttachmentMeta])
async def upload_chat_attachments(
    user_id: str = Form("demo"),
    files: list[UploadFile] = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    if not files:
        raise HTTPException(400, "请选择至少一个文件")
    if len(files) > _MAX_FILES:
        raise HTTPException(400, f"最多上传 {_MAX_FILES} 个文件")

    allowed = {e.lower() for e in supported_extensions()} | _IMAGE_EXT
    out: list[ChatAttachmentMeta] = []
    user_path = _user_dir(user_id)

    for f in files:
        data = await f.read()
        if not data:
            continue
        if len(data) > _MAX_BYTES:
            raise HTTPException(400, f"文件 {f.filename} 超过 12MB 限制")

        name = f.filename or "unnamed"
        ext = Path(name).suffix.lower()
        if ext not in allowed:
            raise HTTPException(400, f"不支持的文件类型：{ext or name}")

        file_id = str(uuid.uuid4()).replace("-", "")[:16]
        stored_name = f"{file_id}{ext}"
        dest = user_path / stored_name
        dest.write_bytes(data)

        kind: str = "image" if ext in _IMAGE_EXT else "file"
        url = f"/api/chat/attachments/{user_id}/{stored_name}"
        extracted = ""
        if kind == "file":
            try:
                extracted = extract_text_from_bytes(name, data)[:8000]
            except Exception:
                extracted = ""

        out.append(
            ChatAttachmentMeta(
                id=file_id,
                name=name,
                kind=kind,  # type: ignore[arg-type]
                mime_type=f.content_type or "application/octet-stream",
                url=url,
                size=len(data),
                text_preview=extracted[:2000] if extracted else "",
            )
        )

    if not out:
        raise HTTPException(400, "没有可用的文件")
    return out


@router.get("/attachments/{user_id}/{filename}")
async def get_chat_attachment(
    user_id: str,
    filename: str,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "非法路径")
    path = _user_dir(user_id) / filename
    if not path.is_file():
        raise HTTPException(404, "文件不存在")
    return FileResponse(path)
