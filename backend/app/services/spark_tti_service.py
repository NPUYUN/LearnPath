"""讯飞星火 · 文生图（TTI）服务。"""

from __future__ import annotations

import base64
import json
import logging
from pathlib import Path

import httpx

from app.core.config import ROOT_DIR, get_settings
from app.core.spark_auth import assemble_spark_auth_url
from app.services.media_storage import save_generated_image

logger = logging.getLogger(__name__)

_TTI_URL = "https://spark-api.cn-huabei-1.xf-yun.com/v2.1/tti"
_MEDIA_ROOT = ROOT_DIR / "storage" / "media_generated"


def _ensure_media_dir() -> Path:
    _MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
    return _MEDIA_ROOT


# 兼容旧 import
__all__ = ["generate_spark_image", "save_generated_image", "spark_tti_status"]


def _parse_image_bytes(response_json: dict) -> bytes | None:
    header = response_json.get("header") or {}
    code = header.get("code", -1)
    if code != 0:
        msg = header.get("message") or header.get("msg") or "unknown"
        logger.warning("Spark TTI error code=%s msg=%s", code, msg)
        return None

    payload = response_json.get("payload") or {}
    choices = payload.get("choices") or {}
    texts = choices.get("text") or []
    if not texts:
        return None

    content = texts[0].get("content") if isinstance(texts[0], dict) else None
    if not content or not isinstance(content, str):
        return None

    try:
        return base64.b64decode(content)
    except Exception as exc:
        logger.warning("Spark TTI base64 decode failed: %s", exc)
        return None


async def generate_spark_image(
    prompt: str,
    *,
    width: int = 1024,
    height: int = 576,
) -> bytes | None:
    """调用星火 TTI 生成图片，失败返回 None。"""
    settings = get_settings()
    if not settings.has_spark_tti:
        return None

    prompt = (prompt or "").strip()
    if not prompt:
        return None
    if len(prompt) > 980:
        prompt = prompt[:980]

    body = {
        "header": {
            "app_id": settings.spark_app_id.strip(),
            "uid": uuid.uuid4().hex[:12],
        },
        "parameter": {
            "chat": {
                "domain": "general",
                "width": width,
                "height": height,
            }
        },
        "payload": {
            "message": {
                "text": [{"role": "user", "content": prompt}],
            }
        },
    }

    url = assemble_spark_auth_url(
        _TTI_URL,
        method="POST",
        api_key=settings.spark_tti_key,
        api_secret=settings.spark_api_secret.strip(),
    )

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                url,
                json=body,
                headers={"Content-Type": "application/json;charset=UTF-8"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Spark TTI request failed: %s", exc)
        return None

    return _parse_image_bytes(data)


def spark_tti_status() -> dict:
    settings = get_settings()
    return {
        "available": settings.has_spark_tti,
        "provider": "spark_tti",
        "endpoint": _TTI_URL,
    }
