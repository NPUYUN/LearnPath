"""多模态生成文件落盘（配图 / 讲解视频）。"""

from __future__ import annotations

import uuid
from pathlib import Path

from app.core.config import ROOT_DIR

_MEDIA_ROOT = ROOT_DIR / "storage" / "media_generated"
_VIDEO_ROOT = _MEDIA_ROOT / "videos"


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_generated_image(data: bytes, *, ext: str = ".jpg") -> str:
    """保存生成图片，返回 API 相对路径。"""
    dest_dir = _ensure_dir(_MEDIA_ROOT)
    file_id = uuid.uuid4().hex[:16]
    dest = dest_dir / f"{file_id}{ext}"
    dest.write_bytes(data)
    return f"/api/media/images/{file_id}{ext}"


def save_generated_video(data: bytes, *, ext: str = ".mp4") -> str:
    """保存生成视频，返回 API 相对路径。"""
    dest_dir = _ensure_dir(_VIDEO_ROOT)
    file_id = uuid.uuid4().hex[:16]
    dest = dest_dir / f"{file_id}{ext}"
    dest.write_bytes(data)
    return f"/api/media/videos/{file_id}{ext}"


def media_image_path(filename: str) -> Path:
    return _MEDIA_ROOT / filename


def media_video_path(filename: str) -> Path:
    return _VIDEO_ROOT / filename
