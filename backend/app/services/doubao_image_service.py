"""火山方舟 · 豆包 Seedream 文生图，用于课堂 PPT 教学插图。"""

from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings
from app.services.media_storage import save_generated_image

logger = logging.getLogger(__name__)


def _base_url() -> str:
    settings = get_settings()
    return (settings.ark_image_base_url or "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")


def _headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "Authorization": f"Bearer {settings.ark_api_key.strip()}",
        "Content-Type": "application/json",
    }


def _size_for(width: int, height: int) -> str:
    ratio = width / max(1, height)
    if ratio >= 1.5:
        return "2K"
    return "1024x1024"


def _classroom_prompt(prompt: str) -> str:
    base = (prompt or "").strip()
    if not base:
        return ""
    return (
        f"{base}\n"
        "用途：AI课堂PPT教学插图。要求：16:9构图，现代教育科技风格，清晰、克制、适合放在课件右侧视觉区；"
        "包含真实教学信息或概念关系，不要空泛装饰；不要文字、不要水印、不要logo、不要人物肖像特写。"
    )[:1200]


async def generate_doubao_image(
    prompt: str,
    *,
    width: int = 1344,
    height: int = 768,
) -> bytes | None:
    """调用豆包 Seedream 生成图片字节，失败返回 None。"""
    settings = get_settings()
    if not settings.has_ark_image:
        return None
    prompt = _classroom_prompt(prompt)
    if not prompt:
        return None

    body = {
        "model": settings.ark_image_model.strip() or "doubao-seedream-5-0-260128",
        "prompt": prompt,
        "size": _size_for(width, height),
        "output_format": "png",
        "response_format": "url",
        "watermark": False,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=180.0)) as client:
            resp = await client.post(f"{_base_url()}/images/generations", headers=_headers(), json=body)
            resp.raise_for_status()
            data = resp.json()
            url = (((data.get("data") or [{}])[0]) or {}).get("url")
            if not url:
                logger.warning("Doubao image response missing url: %s", data)
                return None
            img_resp = await client.get(str(url), follow_redirects=True)
            img_resp.raise_for_status()
            return img_resp.content
    except Exception as exc:
        detail = ""
        if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
            try:
                detail = exc.response.text[:500]
            except Exception:
                pass
        logger.warning("Doubao image generation failed: %s %s", exc, detail)
        return None


async def generate_doubao_image_saved(
    prompt: str,
    *,
    width: int = 1344,
    height: int = 768,
) -> str | None:
    """生成图片并保存到本地媒体目录，返回 /api/media/images/..."""
    data = await generate_doubao_image(prompt, width=width, height=height)
    if not data:
        return None
    return save_generated_image(data, ext=".png")


def doubao_image_status() -> dict:
    settings = get_settings()
    return {
        "available": settings.has_ark_image,
        "provider": "doubao_seedream",
        "model": settings.ark_image_model if settings.has_ark_image else None,
        "endpoint": f"{_base_url()}/images/generations",
        "max_per_classroom": settings.ark_image_max_per_classroom,
    }
