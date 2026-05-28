"""从附件元数据汇总可供 LLM 使用的文本。"""

from __future__ import annotations

from pathlib import Path

from app.core.config import ROOT_DIR
from app.services.file_extract_service import extract_text_from_bytes


def build_attachment_context(attachments: list[dict], user_id: str) -> str:
    if not attachments:
        return ""
    parts: list[str] = []
    root = ROOT_DIR / "storage" / "chat_uploads"
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in user_id)[:64]
    user_path = root / safe

    for i, att in enumerate(attachments, 1):
        name = att.get("name", f"附件{i}")
        kind = att.get("kind", "file")
        if kind == "image":
            parts.append(f"[{i}] 图片：{name}（请结合用户问题理解附图场景）")
            continue
        url = att.get("url", "")
        fname = url.rsplit("/", 1)[-1] if url else ""
        text = ""
        if fname:
            path = user_path / fname
            if path.is_file():
                try:
                    text = extract_text_from_bytes(name, path.read_bytes())[:6000]
                except Exception:
                    text = ""
        if text.strip():
            parts.append(f"[{i}] 文件 {name}：\n{text.strip()}")
        else:
            parts.append(f"[{i}] 文件：{name}（未能提取正文，请根据文件名与问题作答）")
    return "\n\n".join(parts)
