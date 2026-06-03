"""阿里云百炼 · 通义万相文生图（DashScope）。"""

from __future__ import annotations

import asyncio
import logging
import time

import httpx

from app.core.config import get_settings
from app.services.spark_tti_service import save_generated_image

logger = logging.getLogger(__name__)

_IMAGE_SYNTHESIS = "/services/aigc/text2image/image-synthesis"
_DEFAULT_NEGATIVE = "低质量, 模糊, 水印, 文字, 畸形, 噪点, 真人肖像"


def _base_url() -> str:
    settings = get_settings()
    base = (settings.qwen_base_url or "https://dashscope.aliyuncs.com/api/v1").rstrip("/")
    return base


def _auth_headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "Authorization": f"Bearer {settings.qwen_api_key.strip()}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }


def _normalize_size(width: int, height: int) -> str:
    w = max(512, min(1440, int(width)))
    h = max(512, min(1440, int(height)))
    return f"{w}*{h}"


async def _submit_image_task(
    client: httpx.AsyncClient,
    *,
    prompt: str,
    size: str,
) -> str | None:
    settings = get_settings()
    body = {
        "model": settings.qwen_image_model.strip() or "wan2.2-t2i-flash",
        "input": {
            "prompt": prompt,
            "negative_prompt": _DEFAULT_NEGATIVE,
        },
        "parameters": {"size": size, "n": 1},
    }
    try:
        resp = await client.post(
            f"{_base_url()}{_IMAGE_SYNTHESIS}",
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
        logger.warning("Qwen image submit failed: %s %s", exc, detail)
        return None

    output = data.get("output") or {}
    task_id = output.get("task_id")
    if not task_id:
        logger.warning("Qwen image missing task_id: %s", data)
        return None
    return str(task_id)


async def _poll_task_url(
    client: httpx.AsyncClient,
    task_id: str,
    *,
    timeout_sec: float = 120.0,
    interval_sec: float = 2.0,
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
            logger.warning("Qwen task poll failed: %s", exc)
            await asyncio.sleep(interval_sec)
            continue

        output = data.get("output") or {}
        status = (output.get("task_status") or "").upper()
        if status == "SUCCEEDED":
            for item in output.get("results") or []:
                if isinstance(item, dict) and item.get("url"):
                    return str(item["url"])
            logger.warning("Qwen task succeeded but no url: %s", data)
            return None
        if status in ("FAILED", "CANCELED", "UNKNOWN"):
            logger.warning(
                "Qwen image task %s: %s",
                status,
                output.get("message") or output.get("code"),
            )
            return None
        await asyncio.sleep(interval_sec)
    logger.warning("Qwen image task timeout: %s", task_id)
    return None


async def _download_image(client: httpx.AsyncClient, url: str) -> bytes | None:
    try:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        logger.warning("Qwen image download failed: %s", exc)
        return None


async def generate_qwen_image(
    prompt: str,
    *,
    width: int = 1024,
    height: int = 576,
) -> bytes | None:
    """调用通义万相生成图片，失败返回 None。"""
    settings = get_settings()
    if not settings.has_qwen_image:
        return None

    prompt = (prompt or "").strip()
    if not prompt:
        return None
    if len(prompt) > 780:
        prompt = prompt[:780]

    size = _normalize_size(width, height)

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=120.0)) as client:
        task_id = await _submit_image_task(client, prompt=prompt, size=size)
        if not task_id:
            return None
        image_url = await _poll_task_url(client, task_id)
        if not image_url:
            return None
        return await _download_image(client, image_url)


async def generate_qwen_image_saved(
    prompt: str,
    *,
    width: int = 1024,
    height: int = 576,
    ext: str = ".png",
) -> str | None:
    """生成并落盘，返回 /api/media/images/... 路径。"""
    data = await generate_qwen_image(prompt, width=width, height=height)
    if not data:
        return None
    return save_generated_image(data, ext=ext)


def qwen_image_status() -> dict:
    settings = get_settings()
    return {
        "available": settings.has_qwen_image,
        "provider": "qwen_wanx",
        "model": settings.qwen_image_model if settings.has_qwen_image else None,
        "endpoint": f"{_base_url()}{_IMAGE_SYNTHESIS}",
    }
