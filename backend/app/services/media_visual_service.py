"""多模态讲解资源的视觉增强：生成精美 SVG 插图与分镜封面。"""

from __future__ import annotations

import html
import re

_PALETTE = (
    ("#722ed1", "#9254de", "#b37feb"),
    ("#1677ff", "#4096ff", "#69b1ff"),
    ("#13c2c2", "#36cfc9", "#5cdbd3"),
    ("#eb2f96", "#f759ab", "#ff85c0"),
    ("#fa8c16", "#ffa940", "#ffc069"),
)

_SCENE_HINTS = (
    ("intro", ("引入", "标题", "开场", "目标", "概念")),
    ("concept", ("公式", "推导", "原理", "定义", "图示", "动画", "模型")),
    ("demo", ("例题", "演示", "对比", "实验", "walkthrough", "步骤")),
    ("summary", ("小结", "总结", "复习", "易错", "巩固", "练习")),
)


def _esc(text: str, limit: int = 48) -> str:
    t = (text or "").strip()
    if len(t) > limit:
        t = t[: limit - 1] + "…"
    return html.escape(t, quote=True)


def _mermaid_label(text: str, limit: int = 12) -> str:
    t = (text or "").strip()
    if len(t) > limit:
        t = t[: limit - 1] + "…"
    return t.replace('"', "'")


def _pick_palette(index: int) -> tuple[str, str, str]:
    return _PALETTE[index % len(_PALETTE)]


def _scene_kind(description: str, index: int) -> str:
    desc = (description or "").lower()
    for kind, keywords in _SCENE_HINTS:
        if any(k.lower() in desc for k in keywords):
            return kind
    return ("intro", "concept", "demo", "summary")[index % 4]


def build_poster_svg(topic: str, subtitle: str = "多模态讲解 · 分镜预览") -> str:
    c1, c2, c3 = _pick_palette(0)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="讲解封面">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{c1}"/>
      <stop offset="55%" stop-color="{c2}"/>
      <stop offset="100%" stop-color="{c3}"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <circle cx="820" cy="90" r="120" fill="#ffffff" opacity="0.08"/>
  <circle cx="120" cy="460" r="160" fill="#ffffff" opacity="0.06"/>
  <circle cx="480" cy="270" r="200" fill="#ffffff" opacity="0.04" filter="url(#glow)"/>
  <text x="64" y="200" fill="#ffffff" font-size="46" font-weight="700"
        font-family="'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif">{_esc(topic, 20)}</text>
  <text x="64" y="252" fill="#ffffff" opacity="0.92" font-size="22"
        font-family="'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif">{_esc(subtitle, 36)}</text>
  <rect x="64" y="300" width="72" height="72" rx="36" fill="#ffffff" opacity="0.95"/>
  <polygon points="98,328 98,344 114,336" fill="{c1}"/>
  <text x="156" y="338" fill="#ffffff" font-size="18" opacity="0.88"
        font-family="'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif">点击分镜卡片浏览各镜头视觉稿</text>
</svg>"""


def _svg_intro(topic: str, caption: str) -> str:
    c1, c2, _ = _pick_palette(0)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" rx="16" fill="url(#g)"/>
  <rect x="32" y="32" width="576" height="296" rx="12" fill="#ffffff" opacity="0.12"/>
  <text x="48" y="120" fill="#fff" font-size="28" font-weight="700"
        font-family="'Segoe UI','PingFang SC',sans-serif">{_esc(topic, 16)}</text>
  <text x="48" y="168" fill="#fff" opacity="0.9" font-size="16"
        font-family="'Segoe UI','PingFang SC',sans-serif">{_esc(caption, 40)}</text>
  <circle cx="520" cy="240" r="56" fill="#fff" opacity="0.18"/>
  <circle cx="560" cy="200" r="28" fill="#fff" opacity="0.22"/>
</svg>"""


def _svg_concept(caption: str) -> str:
    c1, c2, c3 = _pick_palette(1)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img">
  <rect width="640" height="360" rx="16" fill="#f5f0ff"/>
  <rect x="24" y="24" width="592" height="312" rx="12" fill="#fff" stroke="#e8e0f5"/>
  <circle cx="120" cy="140" r="36" fill="{c1}"/>
  <circle cx="320" cy="100" r="44" fill="{c2}"/>
  <circle cx="520" cy="150" r="32" fill="{c3}"/>
  <line x1="156" y1="140" x2="276" y2="110" stroke="{c1}" stroke-width="3" opacity="0.5"/>
  <line x1="364" y1="110" x2="488" y2="140" stroke="{c2}" stroke-width="3" opacity="0.5"/>
  <rect x="80" y="220" width="480" height="72" rx="8" fill="#fafafa" stroke="#eee"/>
  <text x="96" y="262" fill="#595959" font-size="15"
        font-family="'Segoe UI','PingFang SC',sans-serif">{_esc(caption, 42)}</text>
</svg>"""


def _svg_demo(caption: str) -> str:
    c1, c2, _ = _pick_palette(2)
    bars = ""
    heights = (180, 120, 220, 160, 200)
    for i, h in enumerate(heights):
        x = 120 + i * 88
        bars += f'<rect x="{x}" y="{280 - h}" width="56" height="{h}" rx="6" fill="{c1 if i % 2 == 0 else c2}" opacity="0.85"/>'
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img">
  <rect width="640" height="360" rx="16" fill="#f0fbff"/>
  <text x="32" y="48" fill="#262626" font-size="18" font-weight="600"
        font-family="'Segoe UI','PingFang SC',sans-serif">演示 · 对比示意</text>
  {bars}
  <line x1="48" y1="280" x2="592" y2="280" stroke="#d9d9d9" stroke-width="2"/>
  <text x="32" y="330" fill="#8c8c8c" font-size="14"
        font-family="'Segoe UI','PingFang SC',sans-serif">{_esc(caption, 44)}</text>
</svg>"""


def _svg_summary(caption: str) -> str:
    c1, _, _ = _pick_palette(3)
    items = ""
    for i, y in enumerate((100, 150, 200, 250)):
        items += f'<circle cx="56" cy="{y}" r="10" fill="{c1}" opacity="0.9"/>'
        items += f'<rect x="80" y="{y - 10}" width="{320 - i * 20}" height="20" rx="4" fill="#f0f0f0"/>'
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img">
  <rect width="640" height="360" rx="16" fill="#fff7f0"/>
  <rect x="400" y="24" width="216" height="312" rx="12" fill="{c1}" opacity="0.12"/>
  <text x="32" y="52" fill="#262626" font-size="18" font-weight="600"
        font-family="'Segoe UI','PingFang SC',sans-serif">要点回顾</text>
  {items}
  <text x="32" y="320" fill="#8c8c8c" font-size="14"
        font-family="'Segoe UI','PingFang SC',sans-serif">{_esc(caption, 44)}</text>
</svg>"""


def build_scene_svg(topic: str, scene_index: int, description: str) -> str:
    kind = _scene_kind(description, scene_index)
    caption = description or f"镜头 {scene_index + 1}"
    if kind == "intro":
        return _svg_intro(topic, caption)
    if kind == "concept":
        return _svg_concept(caption)
    if kind == "demo":
        return _svg_demo(caption)
    return _svg_summary(caption)


def _extract_scenes(content: str) -> list[str]:
    """从分镜 Markdown 表格或列表中提取画面描述。"""
    scenes: list[str] = []
    for row in re.finditer(
        r"\|\s*\d+\s*\|\s*([^|]+)\|",
        content,
    ):
        desc = row.group(1).strip()
        if desc and desc not in ("画面", "------"):
            scenes.append(desc)

    if not scenes:
        for m in re.finditer(
            r"(?:镜头|镜号|Scene)\s*\d+[：:）)]\s*(?:\*\*)?([^*\n|]+)",
            content,
            flags=re.I,
        ):
            scenes.append(m.group(1).strip())

    if not scenes:
        for m in re.finditer(r"^\d+\.\s+\*\*([^*]+)\*\*", content, flags=re.M):
            scenes.append(m.group(1).strip())

    return scenes[:6]


def _wrap_svg_block(svg: str, title: str = "") -> str:
    heading = f"#### {title}\n\n" if title else ""
    return f"{heading}```svg\n{svg.strip()}\n```\n\n"


def enrich_media_content(content: str, topic: str) -> str:
    """为多媒体讲解资源追加封面与各镜头 SVG 视觉稿（若尚未包含）。"""
    if "```svg" in content and content.count("```svg") >= 2:
        return content

    topic = topic or "学习主题"
    parts: list[str] = [content.rstrip()]

    if "讲解封面" not in content and "分镜预览" not in content:
        parts.append("## 讲解封面\n\n")
        parts.append(_wrap_svg_block(build_poster_svg(topic), ""))

    scenes = _extract_scenes(content)
    if not scenes:
        scenes = [
            f"{topic} 概念引入",
            "核心原理与公式图示",
            "例题演示与对比",
            "小结与巩固练习",
        ]

    if not re.search(r"##\s*分镜视觉稿", content):
        parts.append("## 分镜视觉稿\n\n")
        parts.append("> 以下为各镜头自动生成的视觉示意，便于预习与复习时建立画面感。\n\n")
        for i, desc in enumerate(scenes):
            svg = build_scene_svg(topic, i, desc)
            parts.append(_wrap_svg_block(svg, f"镜头 {i + 1} · {desc[:24]}"))

    if "```mermaid" not in content:
        parts.append("## 讲解流程\n\n")
        parts.append("```mermaid\nflowchart LR\n")
        for i, desc in enumerate(scenes[:4]):
            node = _mermaid_label(desc, 12)
            parts.append(f'  S{i}["镜头{i + 1}<br/>{node}"]')
            if i > 0:
                parts.append(f"  S{i - 1} --> S{i}")
        parts.append("```\n")

    return "\n".join(parts)


def enrich_chat_media_answer(answer: str, topic: str) -> str:
    """聊天回复中的多媒体内容追加视觉稿。"""
    if "```svg" in answer:
        return answer
    enriched = enrich_media_content(answer, topic)
    if enriched != answer:
        return enriched
    return answer + "\n\n" + _wrap_svg_block(build_poster_svg(topic or "讲解主题"), "视觉封面")
