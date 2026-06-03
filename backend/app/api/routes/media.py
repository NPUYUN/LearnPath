"""多模态生成资源（配图 / 讲解视频）读取。"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.services.image_generation_service import ai_image_generation_status
from app.services.media_storage import media_image_path, media_video_path
from app.services.qwen_video_service import qwen_video_status
from app.services.qwen_vision_service import qwen_vision_status

router = APIRouter(prefix="/media", tags=["media"])

_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
_VIDEO_EXT = {".mp4", ".webm"}


@router.get("/status")
async def media_generation_status():
    """多模态生成能力状态（千问万相配图 / 图生视频）。"""
    settings = get_settings()
    img = ai_image_generation_status()
    video = qwen_video_status()
    vision = qwen_vision_status()
    return {
        **img,
        "kimi_prompt_craft": settings.has_kimi and not settings.llm_mock,
        "vision": {
            **vision,
            "note": (
                "已接入千问-VL；聊天上传图片与发送消息时自动理解"
                if vision.get("available")
                else "未配置 QWEN_API_KEY"
            ),
        },
        "video_generation": {
            **video,
            "note": (
                "已接入 DashScope video-synthesis；资源生成时优先图生视频，"
                "失败时回退文生视频或幻灯片预览"
                if video.get("available")
                else "未配置 QWEN_API_KEY 或已关闭 QWEN_VIDEO_ENABLED"
            ),
        },
    }


@router.get("/images/{filename}")
async def get_generated_image(filename: str):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "非法路径")
    ext = Path(filename).suffix.lower()
    if ext not in _IMAGE_EXT:
        raise HTTPException(400, "不支持的文件类型")
    path = media_image_path(filename)
    if not path.is_file():
        raise HTTPException(404, "图片不存在")
    media = "image/jpeg" if ext in {".jpg", ".jpeg"} else f"image/{ext.lstrip('.')}"
    return FileResponse(path, media_type=media)


@router.get("/videos/{filename}")
async def get_generated_video(filename: str):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "非法路径")
    ext = Path(filename).suffix.lower()
    if ext not in _VIDEO_EXT:
        raise HTTPException(400, "不支持的视频类型")
    path = media_video_path(filename)
    if not path.is_file():
        raise HTTPException(404, "视频不存在")
    media = "video/webm" if ext == ".webm" else "video/mp4"
    return FileResponse(path, media_type=media)
