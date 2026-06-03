"""阿里云百炼 · 千问视觉理解（Qwen-VL）。"""

from __future__ import annotations

import logging
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.services.qwen_video_service import image_bytes_to_data_url, image_file_to_data_url

logger = logging.getLogger(__name__)

_MULTIMODAL_GEN = "/services/aigc/multimodal-generation/generation"
_COMPAT_CHAT = "/compatible-mode/v1/chat/completions"

_VISION_SYSTEM = (
    "你是学径学习助手的环境感知模块。请客观描述用户上传的图片内容，"
    "重点包括：主题、文字/公式/图表、界面或代码、与学习相关的信息。"
    "用中文，3–8 句，不要编造看不清的细节。"
)


def _base_url() -> str:
    settings = get_settings()
    return (settings.qwen_base_url or "https://dashscope.aliyuncs.com/api/v1").rstrip("/")


def _auth_headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "Authorization": f"Bearer {settings.qwen_api_key.strip()}",
        "Content-Type": "application/json",
    }


def _parse_vl_text(data: dict) -> str:
    """从 multimodal-generation 或 compatible 响应提取文本。"""
    output = data.get("output") or {}
    choices = output.get("choices") or data.get("choices") or []
    if choices:
        msg = choices[0].get("message") or {}
        content = msg.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("text"):
                        parts.append(str(block["text"]))
                    elif block.get("type") == "text" and block.get("text"):
                        parts.append(str(block["text"]))
            if parts:
                return "\n".join(parts).strip()

    text = output.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()
    return ""


async def _call_multimodal_native(
    client: httpx.AsyncClient,
    *,
    image_data_url: str,
    prompt: str,
) -> str:
    settings = get_settings()
    body = {
        "model": settings.qwen_vl_model.strip() or "qwen-vl-plus",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"image": image_data_url},
                        {"text": f"{_VISION_SYSTEM}\n\n{prompt}"},
                    ],
                }
            ]
        },
        "parameters": {"max_tokens": 800, "temperature": 0.2},
    }
    resp = await client.post(
        f"{_base_url()}{_MULTIMODAL_GEN}",
        headers=_auth_headers(),
        json=body,
    )
    resp.raise_for_status()
    return _parse_vl_text(resp.json())


async def _call_compatible_vision(
    client: httpx.AsyncClient,
    *,
    image_data_url: str,
    prompt: str,
) -> str:
    settings = get_settings()
    root = _base_url().removesuffix("/api/v1")
    body = {
        "model": settings.qwen_vl_model.strip() or "qwen-vl-plus",
        "messages": [
            {"role": "system", "content": _VISION_SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                    {"type": "text", "text": prompt},
                ],
            },
        ],
        "max_tokens": 800,
        "temperature": 0.2,
    }
    resp = await client.post(
        f"{root}{_COMPAT_CHAT}",
        headers=_auth_headers(),
        json=body,
    )
    resp.raise_for_status()
    return _parse_vl_text(resp.json())


async def describe_image(
    *,
    image_bytes: bytes | None = None,
    image_path: Path | None = None,
    image_ext: str = ".jpg",
    user_question: str = "",
) -> str:
    """理解图片内容，失败返回空字符串。"""
    settings = get_settings()
    if not settings.has_qwen_vision:
        return ""

    img_url: str | None = None
    if image_bytes:
        img_url = image_bytes_to_data_url(image_bytes, ext=image_ext)
    elif image_path:
        img_url = image_file_to_data_url(image_path)
    if not img_url:
        return ""

    q = (user_question or "").strip()
    prompt = (
        f"用户问题：{q}\n请结合问题描述图片中与回答相关的信息。"
        if q
        else "请描述这张图片的内容，便于后续学习辅导使用。"
    )

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=90.0)) as client:
        for caller in (_call_multimodal_native, _call_compatible_vision):
            try:
                text = await caller(client, image_data_url=img_url, prompt=prompt)
                if text.strip():
                    return text.strip()[:4000]
            except Exception as exc:
                logger.info("Qwen VL %s failed: %s", caller.__name__, exc)
    return ""


def qwen_vision_status() -> dict:
    settings = get_settings()
    return {
        "available": settings.has_qwen_vision,
        "provider": "qwen_vl",
        "model": settings.qwen_vl_model if settings.has_qwen_vision else None,
    }
