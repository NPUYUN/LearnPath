"""阿里云百炼 · 通义万相图生视频 / 文生视频（video-synthesis）。"""

from __future__ import annotations

import asyncio
import base64
import logging
import mimetypes
import time
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.services.media_storage import save_generated_video

logger = logging.getLogger(__name__)

_VIDEO_SYNTHESIS = "/services/aigc/video-generation/video-synthesis"
_DEFAULT_MOTION = "镜头缓慢推进，画面元素轻微动效，教育讲解风格，平稳流畅"


def _base_url() -> str:
    settings = get_settings()
    return (settings.qwen_base_url or "https://dashscope.aliyuncs.com/api/v1").rstrip("/")


def _auth_headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "Authorization": f"Bearer {settings.qwen_api_key.strip()}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }


def image_bytes_to_data_url(data: bytes, *, ext: str = ".jpg") -> str:
    mime = mimetypes.types_map.get(ext.lower(), "image/jpeg")
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def image_file_to_data_url(path: Path) -> str | None:
    if not path.is_file():
        return None
    ext = path.suffix.lower() or ".jpg"
    mime = mimetypes.types_map.get(ext, "image/jpeg")
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


async def _poll_video_task(
    client: httpx.AsyncClient,
    task_id: str,
    *,
    timeout_sec: float = 300.0,
    interval_sec: float = 3.0,
) -> str | None:
    url = f"{_base_url()}/tasks/{task_id}"
    headers = {"Authorization": _auth_headers()["Authorization"]}
    deadline = time.monotonic() + timeout_sec

    while time.monotonic() < deadline:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("Qwen video poll failed: %s", exc)
            await asyncio.sleep(interval_sec)
            continue

        output = data.get("output") or {}
        status = (output.get("task_status") or "").upper()
        if status == "SUCCEEDED":
            video_url = output.get("video_url")
            if video_url:
                return str(video_url)
            for item in output.get("results") or []:
                if isinstance(item, dict) and item.get("url"):
                    return str(item["url"])
            logger.warning("Qwen video succeeded but no url: %s", data)
            return None
        if status in ("FAILED", "CANCELED", "UNKNOWN"):
            logger.warning(
                "Qwen video task %s: %s",
                status,
                output.get("message") or output.get("code"),
            )
            return None
        await asyncio.sleep(interval_sec)

    logger.warning("Qwen video task timeout: %s", task_id)
    return None


async def _submit_video_task(
    client: httpx.AsyncClient,
    *,
    model: str,
    input_body: dict,
    parameters: dict,
) -> str | None:
    body = {"model": model, "input": input_body, "parameters": parameters}
    try:
        resp = await client.post(
            f"{_base_url()}{_VIDEO_SYNTHESIS}",
            headers=_auth_headers(),
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        detail = ""
        if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
            try:
                detail = exc.response.text[:500]
            except Exception:
                pass
        logger.warning("Qwen video submit failed: %s %s", exc, detail)
        return None

    task_id = (data.get("output") or {}).get("task_id")
    if not task_id:
        logger.warning("Qwen video missing task_id: %s", data)
        return None
    return str(task_id)


async def _download_video(client: httpx.AsyncClient, url: str) -> bytes | None:
    try:
        resp = await client.get(url, follow_redirects=True, timeout=120.0)
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        logger.warning("Qwen video download failed: %s", exc)
        return None


async def generate_qwen_i2v(
    prompt: str,
    *,
    image_bytes: bytes | None = None,
    image_path: Path | None = None,
    image_ext: str = ".jpg",
) -> bytes | None:
    """图生视频：首帧 + 运动描述。"""
    settings = get_settings()
    if not settings.has_qwen_video:
        return None

    img_url: str | None = None
    if image_bytes:
        img_url = image_bytes_to_data_url(image_bytes, ext=image_ext)
    elif image_path:
        img_url = image_file_to_data_url(image_path)
    if not img_url:
        return None

    prompt = (prompt or _DEFAULT_MOTION).strip()[:800]
    params = {
        "resolution": settings.qwen_video_resolution,
        "duration": settings.qwen_video_duration,
        "prompt_extend": True,
        "watermark": False,
        "shot_type": "single",
    }
    if "flash" in settings.qwen_video_model:
        params["audio"] = False

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=300.0)) as client:
        task_id = await _submit_video_task(
            client,
            model=settings.qwen_video_model.strip(),
            input_body={"prompt": prompt, "img_url": img_url},
            parameters=params,
        )
        if not task_id:
            return None
        video_url = await _poll_video_task(
            client,
            task_id,
            timeout_sec=float(settings.qwen_video_timeout_sec),
        )
        if not video_url:
            return None
        return await _download_video(client, video_url)


async def generate_qwen_t2v(prompt: str) -> bytes | None:
    """文生视频（无首帧时的回退）。"""
    settings = get_settings()
    if not settings.has_qwen_video:
        return None

    prompt = (prompt or "").strip()[:800]
    if not prompt:
        return None

    model = settings.qwen_video_t2v_model.strip() or "wan2.6-t2v"
    params = {
        "size": settings.qwen_video_t2v_size,
        "duration": settings.qwen_video_duration,
        "prompt_extend": True,
        "shot_type": "single",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=300.0)) as client:
        task_id = await _submit_video_task(
            client,
            model=model,
            input_body={"prompt": prompt},
            parameters=params,
        )
        if not task_id:
            return None
        video_url = await _poll_video_task(
            client,
            task_id,
            timeout_sec=float(settings.qwen_video_timeout_sec),
        )
        if not video_url:
            return None
        return await _download_video(client, video_url)


async def generate_qwen_video_saved(
    topic: str,
    scene_description: str,
    *,
    image_bytes: bytes | None = None,
    image_path: Path | None = None,
) -> str | None:
    """生成讲解短视频并落盘，返回 /api/media/videos/..."""
    motion = (
        f"教育科普讲解镜头，主题「{topic}」：{scene_description}。"
        "画面轻微动态，镜头缓慢移动，清晰稳定，无抖动。"
    )
    data = await generate_qwen_i2v(
        motion,
        image_bytes=image_bytes,
        image_path=image_path,
    )
    if not data:
        data = await generate_qwen_t2v(
            f"教育科普动画，主题「{topic}」，{scene_description}，"
            "扁平插画风格，柔和色彩，镜头平稳，高校自学场景"
        )
    if not data:
        return None
    return save_generated_video(data)


def qwen_video_status() -> dict:
    settings = get_settings()
    return {
        "available": settings.has_qwen_video,
        "enabled": settings.qwen_video_enabled,
        "provider": "qwen_wanx_video",
        "model": settings.qwen_video_model if settings.has_qwen_video else None,
        "endpoint": f"{_base_url()}{_VIDEO_SYNTHESIS}",
        "duration_sec": settings.qwen_video_duration,
        "resolution": settings.qwen_video_resolution,
    }
