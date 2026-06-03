"""多模态资源增强：星火文生图 + Kimi 提示词优化 + SVG 回退。"""

from __future__ import annotations

import json
import logging
import re

from app.core.config import get_settings
from app.core.llm.router import get_primary_llm
from app.services.media_visual_service import (
    _extract_scenes,
    _wrap_svg_block,
    build_poster_svg,
    build_scene_svg,
    enrich_media_content,
)
from app.services.image_generation_service import generate_ai_image_bytes
from app.services.media_storage import save_generated_image
from app.services.qwen_video_service import generate_qwen_video_saved

logger = logging.getLogger(__name__)

_PROMPT_SYSTEM = (
    "你是 AI 绘画提示词专家。根据【学习主题】与【分镜画面描述】，为文生图模型编写中文提示词。\n"
    "要求：教育科普/信息图风格、构图清晰、色彩和谐、无文字水印、无真人肖像、适合高校自学场景。\n"
    "仅输出 JSON 数组，每项一条提示词字符串，顺序与输入镜头一致，不要 markdown。"
)


def _default_prompts(topic: str, scenes: list[str]) -> list[str]:
    return [
        f"精美教育科普插画，主题「{topic}」，画面：{scene}，扁平化设计，柔和渐变，高清，无文字"
        for scene in scenes
    ]


async def craft_image_prompts(topic: str, scenes: list[str]) -> list[str]:
    """使用 Kimi/主 LLM 优化文生图提示词；失败则回退模板。"""
    if not scenes:
        return []

    settings = get_settings()
    if settings.llm_mock:
        return _default_prompts(topic, scenes)

    llm = get_primary_llm()
    user_payload = json.dumps(
        {"topic": topic, "scenes": scenes},
        ensure_ascii=False,
    )
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": _PROMPT_SYSTEM},
                {"role": "user", "content": user_payload},
            ],
            temperature=0.4,
            task="resource",
        )
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        prompts = json.loads(text)
        if isinstance(prompts, list) and len(prompts) >= len(scenes):
            return [str(p).strip() for p in prompts[: len(scenes)]]
    except Exception as exc:
        logger.info("Kimi/LLM image prompt craft failed, use template: %s", exc)

    return _default_prompts(topic, scenes)


def _wrap_image_block(url: str, alt: str, title: str = "") -> str:
    heading = f"#### {title}\n\n" if title else ""
    return f"{heading}![{alt}]({url})\n\n"


def _wrap_video_block(url: str, title: str = "讲解视频") -> str:
    return f"## {title}\n\n```video\n{url}\n```\n\n"


async def _generate_ai_video(
    topic: str,
    scenes: list[str],
    *,
    cover_image_bytes: bytes | None,
) -> tuple[str, str]:
    """图生视频（首帧为封面/第一镜），返回 (markdown块, provider_note)。"""
    settings = get_settings()
    if not settings.has_qwen_video:
        return "", ""

    scene_desc = scenes[0] if scenes else f"{topic} 概念讲解"
    video_url = await generate_qwen_video_saved(
        topic,
        scene_desc,
        image_bytes=cover_image_bytes,
    )
    if not video_url:
        return "", ""
    note = "通义万相图生视频"
    return _wrap_video_block(video_url), note


async def _generate_ai_visuals(
    topic: str,
    scenes: list[str],
    *,
    max_images: int,
    include_poster: bool = True,
) -> tuple[list[str], str]:
    """
    生成 AI 图片 markdown 块。
    返回 (markdown_parts, provider_note)。
    """
    settings = get_settings()
    if not settings.has_ai_image:
        return [], "", None

    prompts: list[str] = []
    labels: list[str] = []

    if include_poster:
        prompts.append(
            f"电影感教育讲解封面，主题「{topic}」，紫色渐变，现代简洁，无文字，16:9 构图，高清"
        )
        labels.append("讲解封面")

    scene_budget = max(0, max_images - len(prompts))
    scene_slice = scenes[:scene_budget]
    if scene_slice:
        crafted = await craft_image_prompts(topic, scene_slice)
        prompts.extend(crafted)
        labels.extend([f"镜头 {i + 1} · {s[:20]}" for i, s in enumerate(scene_slice)])

    parts: list[str] = []
    success = 0
    provider_label = ""
    first_image_bytes: bytes | None = None

    for i, (prompt, label) in enumerate(zip(prompts, labels)):
        is_poster = i == 0 and include_poster
        width, height = (1280, 720) if is_poster else (768, 768)
        img_bytes, prov = await generate_ai_image_bytes(prompt, width=width, height=height)
        if not img_bytes:
            continue
        if first_image_bytes is None:
            first_image_bytes = img_bytes
        if prov and not provider_label:
            provider_label = prov
        url = save_generated_image(img_bytes)
        if is_poster:
            parts.append("## 讲解封面\n\n")
            parts.append(_wrap_image_block(url, f"{topic} 讲解封面", ""))
        else:
            parts.append(_wrap_image_block(url, label, label))
        success += 1

    if success == 0:
        return [], "", None

    provider = provider_label or "AI 文生图"
    if settings.has_kimi:
        provider += " · 提示词由 Kimi 优化"
    return parts, provider, first_image_bytes


async def enrich_media_content_async(
    content: str,
    topic: str,
    *,
    max_images: int | None = None,
    include_video: bool = True,
) -> str:
    """异步增强多媒体内容：优先星火 AI 配图，不足处补 SVG。"""
    settings = get_settings()
    limit = max_images if max_images is not None else settings.ai_image_max_count
    topic = topic or "学习主题"

    scenes = _extract_scenes(content)
    if not scenes:
        scenes = [
            f"{topic} 概念引入",
            "核心原理与公式图示",
            "例题演示与对比",
            "小结与巩固练习",
        ]

    ai_parts: list[str] = []
    provider_note = ""
    cover_bytes: bytes | None = None

    if settings.has_ai_image and "/api/media/images/" not in content:
        ai_parts, provider_note, cover_bytes = await _generate_ai_visuals(
            topic,
            scenes,
            max_images=limit,
            include_poster=True,
        )

    if ai_parts:
        base = content.rstrip()
        merged = base + "\n\n" + "".join(ai_parts)

        if include_video and settings.has_qwen_video and "/api/media/videos/" not in merged:
            video_md, video_note = await _generate_ai_video(topic, scenes, cover_image_bytes=cover_bytes)
            if video_md:
                merged = video_md + merged
                provider_note = f"{video_note} · {provider_note}" if provider_note else video_note

        if not re.search(r"##\s*分镜视觉稿", merged):
            merged += "\n\n## 分镜视觉稿\n\n"
            merged += "> 以下镜头暂未生成 AI 配图时使用示意图补充。\n\n"
            start = len(ai_parts) - 1 if len(ai_parts) > 1 else 0
            for i, desc in enumerate(scenes[start:]):
                svg = build_scene_svg(topic, i + start, desc)
                merged += _wrap_svg_block(svg, f"示意图 · 镜头 {i + start + 1}")

        if provider_note:
            merged += f"\n\n> 视觉生成：{provider_note}\n"

        if "```mermaid" not in merged:
            merged = enrich_media_content(merged, topic)
        return merged

    return enrich_media_content(content, topic)


async def enrich_chat_media_answer_async(answer: str, topic: str) -> str:
    """聊天场景：限制配图数量以控制延迟。"""
    settings = get_settings()
    if settings.has_ai_image:
        limit = min(2, settings.ai_image_max_count)
        enriched = await enrich_media_content_async(
            answer, topic, max_images=limit, include_video=False
        )
        if enriched != answer:
            return enriched
    from app.services.media_visual_service import enrich_media_content

    return enrich_media_content(answer, topic)
