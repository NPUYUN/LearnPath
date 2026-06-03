"""从附件元数据汇总可供 LLM 使用的文本（含千问-VL 图片理解）。"""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.core.config import ROOT_DIR, get_settings
from app.services.file_extract_service import extract_text_from_bytes
from app.services.qwen_vision_service import describe_image

_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}


def _upload_path(user_id: str, url: str) -> Path | None:
    fname = url.rsplit("/", 1)[-1] if url else ""
    if not fname:
        return None
    root = ROOT_DIR / "storage" / "chat_uploads"
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in user_id)[:64]
    path = root / safe / fname
    return path if path.is_file() else None


def build_attachment_context(attachments: list[dict], user_id: str) -> str:
    """同步占位（无 VL）；流式对话请用 build_attachment_context_async。"""
    if not attachments:
        return ""
    parts: list[str] = []
    for i, att in enumerate(attachments, 1):
        name = att.get("name", f"附件{i}")
        kind = att.get("kind", "file")
        preview = (att.get("text_preview") or "").strip()
        if kind == "image":
            if preview:
                parts.append(f"[{i}] 图片 {name}（视觉理解）：\n{preview}")
            else:
                parts.append(f"[{i}] 图片：{name}（请结合用户问题理解附图场景）")
            continue
        url = att.get("url", "")
        text = preview
        if not text:
            path = _upload_path(user_id, url)
            if path:
                try:
                    text = extract_text_from_bytes(name, path.read_bytes())[:6000]
                except Exception:
                    text = ""
        if text.strip():
            parts.append(f"[{i}] 文件 {name}：\n{text.strip()}")
        else:
            parts.append(f"[{i}] 文件：{name}（未能提取正文，请根据文件名与问题作答）")
    return "\n\n".join(parts)


async def _describe_one_image(
    att: dict,
    user_id: str,
    user_question: str,
) -> str:
    preview = (att.get("text_preview") or "").strip()
    name = att.get("name", "图片")
    url = att.get("url", "")

    settings = get_settings()
    if not settings.has_qwen_vision:
        return preview

    path = _upload_path(user_id, url)
    if not path:
        return preview

    ext = path.suffix.lower() or ".jpg"
    # 有问题时重新理解；无问题且已有上传时预览则复用
    if preview and not user_question.strip():
        return preview

    desc = await describe_image(
        image_path=path,
        image_ext=ext,
        user_question=user_question,
    )
    return desc or preview or f"（已上传图片 {name}，暂未能自动识别内容）"


async def build_attachment_context_async(
    attachments: list[dict],
    user_id: str,
    *,
    user_question: str = "",
) -> str:
    """异步构建附件上下文：图片走千问-VL，文件走文本抽取。"""
    if not attachments:
        return ""

    parts: list[str] = []
    image_tasks: list[tuple[int, str, asyncio.Task[str]]] = []

    for i, att in enumerate(attachments, 1):
        name = att.get("name", f"附件{i}")
        kind = att.get("kind", "file")
        if kind == "image":
            task = asyncio.create_task(_describe_one_image(att, user_id, user_question))
            image_tasks.append((i, name, task))
            continue

        preview = (att.get("text_preview") or "").strip()
        url = att.get("url", "")
        text = preview
        if not text:
            path = _upload_path(user_id, url)
            if path:
                try:
                    text = extract_text_from_bytes(name, path.read_bytes())[:6000]
                except Exception:
                    text = ""
        if text.strip():
            parts.append(f"[{i}] 文件 {name}：\n{text.strip()}")
        else:
            parts.append(f"[{i}] 文件：{name}（未能提取正文，请根据文件名与问题作答）")

    for idx, name, task in image_tasks:
        desc = await task
        parts.append(f"[{idx}] 图片 {name}（视觉理解）：\n{desc}")

    # 保持附件序号顺序
    def _sort_key(block: str) -> int:
        if block.startswith("[") and "]" in block[:6]:
            try:
                return int(block[1 : block.index("]")])
            except ValueError:
                return 999
        return 999

    parts.sort(key=_sort_key)
    return "\n\n".join(parts)
