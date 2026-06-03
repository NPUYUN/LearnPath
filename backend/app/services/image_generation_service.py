"""统一 AI 配图：优先千问通义万相，回退讯飞星火 TTI。"""

from __future__ import annotations

import logging

from app.core.config import get_settings
from app.services.qwen_image_service import generate_qwen_image, qwen_image_status
from app.services.spark_tti_service import generate_spark_image, spark_tti_status

logger = logging.getLogger(__name__)


async def generate_ai_image_bytes(
    prompt: str,
    *,
    width: int = 1024,
    height: int = 576,
) -> tuple[bytes | None, str]:
    """
    生成图片字节。
    返回 (bytes, provider_label)；失败时 (None, "")。
    """
    settings = get_settings()
    if settings.has_qwen_image:
        data = await generate_qwen_image(prompt, width=width, height=height)
        if data:
            return data, "通义万相"
        logger.info("Qwen image failed, try Spark TTI fallback")

    if settings.has_spark_tti:
        data = await generate_spark_image(prompt, width=width, height=height)
        if data:
            return data, "讯飞星火文生图"

    return None, ""


def ai_image_generation_status() -> dict:
    settings = get_settings()
    qwen = qwen_image_status()
    spark = spark_tti_status()
    provider = None
    if qwen["available"]:
        provider = "qwen_wanx"
    elif spark["available"]:
        provider = "spark_tti"

    return {
        "available": settings.has_ai_image,
        "provider": provider,
        "qwen": qwen,
        "spark_tti": spark,
    }
