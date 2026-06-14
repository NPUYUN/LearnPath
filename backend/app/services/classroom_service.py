from __future__ import annotations

import json
import re
import uuid
from typing import Any

from app.core.guardrails import filter_sensitive
from app.core.llm.router import get_primary_llm
from app.core.config import get_settings
from app.db.repository import get_path, get_profile, get_realtime_state, get_resource, list_resources
from app.models.schemas import (
    ClassroomCheckQuestion,
    ClassroomGenerateRequest,
    ClassroomHandoutSection,
    ClassroomQuizOption,
    ClassroomQuizRequest,
    ClassroomQuizResponse,
    ClassroomResourceSummary,
    ClassroomSessionResponse,
    ClassroomSlide,
    ClassroomTeacherScripts,
)
from app.services.image_generation_service import generate_ai_image_bytes
from app.services.media_storage import save_generated_image
from app.services.personalization_strategy_service import (
    build_personalization_strategy,
    format_personalization_strategy_prompt,
    format_realtime_reply_policy_prompt,
)


def _clip(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _unique(items: list[str]) -> list[str]:
    out: list[str] = []
    for item in items:
        if item and item not in out:
            out.append(item)
    return out


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _strip_leading_marker(value: str) -> str:
    text = value.strip()
    text = re.sub(r"^\s*[-*]\s+", "", text)
    text = re.sub(r"^\s*\d{1,2}[)）、:：]\s*", "", text)
    text = re.sub(r"^\s*\d{1,2}\.\s+", "", text)
    text = re.sub(r"^\s*\d{1,2}\s+(?=[\u4e00-\u9fffA-Za-z（(])", "", text)
    return text.strip()


def _split_text_items(value: Any) -> list[str]:
    if isinstance(value, list):
        raw = [str(x) for x in value]
    elif isinstance(value, str):
        raw = re.split(r"[\n；;]+", value)
    else:
        raw = []
    items: list[str] = []
    for item in raw:
        cleaned = _strip_leading_marker(_clean_text(item))
        if not cleaned:
            continue
        if len(cleaned) <= 1:
            continue
        items.append(cleaned)
    return _unique(items)


def _normalize_points(value: Any, fallback: list[str], limit: int = 5) -> list[str]:
    points = [x for x in _split_text_items(value) if len(x) >= 2]
    if len(points) < 2:
        points = fallback
    return _unique(points)[:limit]


def _extract_json_object(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        return data if isinstance(data, dict) else {}
    except Exception:
        pass
    match = re.search(r"\{.*\}", cleaned, flags=re.S)
    if not match:
        return {}
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _short(value: Any, limit: int = 48) -> str:
    text = _clean_text(value)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _default_visual_blocks(slide: ClassroomSlide, course_title: str, objective: str) -> list[dict[str, Any]]:
    points = [p for p in (slide.board or []) if p][:4]
    layout = (slide.layout or "concept").strip()
    title = slide.title or course_title
    if layout in {"cover", "timeline", "summary"}:
        return [
            {
                "type": "process",
                "title": "课堂主线",
                "steps": points or ["明确目标", "建立概念", "跑通例子", "完成检查"],
            }
        ]
    if layout == "problem":
        return [
            {
                "type": "table",
                "title": "问题拆解",
                "columns": ["现象", "学习困难", "处理方式"],
                "rows": [
                    ["信息很多", "不知道先看哪里", "先找输入、规则、输出"],
                    ["概念抽象", "难以判断边界", "用一个最小例子验证"],
                    ["步骤分散", "容易只背结论", "把每步和目的绑定"],
                ],
            }
        ]
    if layout == "example":
        return [
            {
                "type": "example",
                "title": "最小例题",
                "question": f"用一个具体场景说明：{title}",
                "steps": points or ["给出输入", "套用关键规则", "解释输出"],
                "answer": "重点不是记住形式，而是说明每一步为什么这样做。",
            }
        ]
    if layout == "mistake":
        return [
            {
                "type": "table",
                "title": "易错对照",
                "columns": ["易错点", "错误理解", "正确抓法"],
                "rows": [
                    ["只背定义", "以为会说术语就会用", "必须能指出适用条件"],
                    ["跳过例子", "觉得例题只是辅助", "用例题检查概念边界"],
                    ["忽略反馈", "错题只看答案", "记录错在输入、规则还是输出"],
                ],
            }
        ]
    if layout == "quiz":
        return [
            {
                "type": "exercise",
                "title": "课堂检查",
                "question": f"如果把场景换一下，你还能用自己的话解释“{title}”吗？",
                "steps": points or ["复述概念", "指出条件", "给出判断"],
                "answer": "能把概念迁移到新场景，并说清判断依据。",
            }
        ]
    return [
        {
            "type": "compare",
            "title": "概念对照",
            "columns": ["要素", "通俗解释", "本节用途"],
            "rows": [
                ["核心目标", _short(objective, 36) or "建立直觉", "确定这节课要解决什么"],
                ["关键概念", _short(title, 36), "作为后续例题的判断依据"],
                ["检查方式", "换场景仍能解释", "判断是否真正理解"],
            ],
        }
    ]


def _normalize_visual_blocks(
    value: Any,
    fallback: list[dict[str, Any]],
    slide: ClassroomSlide,
    limit: int = 2,
) -> list[dict[str, Any]]:
    raw_blocks = value if isinstance(value, list) else []
    blocks: list[dict[str, Any]] = []
    for raw in raw_blocks:
        if not isinstance(raw, dict):
            continue
        block_type = _clean_text(raw.get("type")) or "note"
        block: dict[str, Any] = {
            "type": block_type,
            "title": _short(raw.get("title") or slide.visual_theme or slide.title, 30),
        }
        if block_type in {"table", "compare"}:
            columns = [_short(x, 24) for x in _split_text_items(raw.get("columns"))][:4]
            rows_raw = raw.get("rows") if isinstance(raw.get("rows"), list) else []
            rows: list[list[str]] = []
            for row in rows_raw[:5]:
                if isinstance(row, list):
                    cleaned = [_short(cell, 72) for cell in row[: len(columns) or 3]]
                    if any(cleaned):
                        rows.append(cleaned)
            if len(columns) >= 2 and rows:
                block["columns"] = columns
                block["rows"] = rows
            else:
                continue
        elif block_type in {"example", "exercise", "formula"}:
            block["question"] = _short(raw.get("question") or raw.get("expression") or slide.title, 140)
            block["steps"] = _normalize_points(raw.get("steps") or raw.get("items"), slide.board, limit=5)
            block["answer"] = _short(raw.get("answer") or raw.get("explanation") or slide.teacher_note, 180)
            block["explanation"] = _short(raw.get("explanation") or raw.get("analysis") or raw.get("solution") or raw.get("answer"), 220)
            block["difficulty"] = _short(raw.get("difficulty") or raw.get("level"), 24)
            block["latex"] = _short(raw.get("latex") or raw.get("formula") or raw.get("expression"), 180)
        elif block_type in {"process", "diagram"}:
            block["steps"] = _normalize_points(raw.get("steps") or raw.get("items"), slide.board, limit=5)
        else:
            items = _normalize_points(raw.get("items") or raw.get("steps"), slide.board, limit=4)
            block["items"] = items
        blocks.append(block)
        if len(blocks) >= limit:
            break
    return blocks or fallback[:limit]


def _slide_image_priority(slide: ClassroomSlide, index: int, total: int) -> int:
    layout = (slide.layout or "").strip()
    if layout == "cover":
        return 100
    if layout == "concept":
        return 90
    if layout == "example":
        return 82
    if layout == "summary":
        return 74
    if index == total - 1:
        return 68
    if layout in {"problem", "timeline"}:
        return 55
    return 20


def _fallback_slide_image_prompt(session: ClassroomSessionResponse, slide: ClassroomSlide) -> str:
    points = "；".join((slide.board or [])[:4])
    allowed_text = " / ".join([slide.title, slide.body, *((slide.board or [])[:4])])
    settings = get_settings()
    if "qwen-image-2.0" in (settings.qwen_image_model or "").lower():
        return (
            f"生成一张 16:9 横版中文课堂幻灯片页面，整张图片本身就是课堂展示页。"
            f"课程：{session.title}。本页主题：{slide.title}。"
            f"正文要点：{slide.body}。关键点：{points}。"
            f"视觉方向：{slide.visual_prompt or slide.visual_theme or '中文教学信息图'}。"
            f"只允许使用这些短文本作为画面文字，不要新增、不改写、不自行编造任何文字：{allowed_text}。"
            "版式像高质量 PPT 单页：大标题、2-4 个清晰模块、少量中文标签、必要公式或示意图。"
            "画面必须铺满整张 16:9 页面，不要外层深色边框，不要在图片里再画白色幻灯片卡片，不要播放器外壳，不要窗口边框。"
            "不要手机、不要 App 界面、不要网页界面、不要广告海报、不要水印、不要真实人物。"
            "中文必须清晰；如果无法保证文字正确，就用无文字图标、箭头、色块和结构线代替，不要生成乱码、错别字或伪文字。"
            "公式必须谨慎且尽量少，整体专业、干净、适合学生自学。"
        )
    return (
        f"生成一张 16:9 的中文 AI 课堂教学插图，用于课堂展示框，不是整页 PPT。"
        f"课程：{session.title}。本页主题：{slide.title}。"
        f"正文要点：{slide.body}。关键点：{points}。"
        f"视觉方向：{slide.visual_prompt or slide.visual_theme or '教学概念图'}。"
        "画面要有明确知识结构、示意图或场景化解释，适合学生看图理解。"
        "只画知识图解本身，不要手机、不要 App 界面、不要网页界面、不要海报排版、不要大段文字、不要水印、不要真实人物肖像，风格清晰高级、干净、有教学性。"
    )


def _prompt_matches_slide(prompt: str, session: ClassroomSessionResponse, slide: ClassroomSlide) -> bool:
    source = f"{session.title} {slide.title} {' '.join(slide.board or [])}"
    subject_terms = [
        "微积分",
        "极限",
        "导数",
        "积分",
        "线性回归",
        "机器学习",
        "概率",
        "统计",
        "Python",
        "函数",
    ]
    expected_terms = [term for term in subject_terms if term in source]
    if expected_terms and not any(term in prompt for term in expected_terms):
        return False
    tokens = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}", source)
    stop_words = {"基础", "知识", "讲解", "课堂", "应用", "核心", "概念", "理解", "学习", "总览"}
    keywords = [token for token in tokens if token not in stop_words]
    if not keywords:
        return True
    hits = sum(1 for token in keywords[:8] if token in prompt)
    return hits >= 1


async def _build_slide_image_prompt(session: ClassroomSessionResponse, slide: ClassroomSlide) -> str:
    fallback = _fallback_slide_image_prompt(session, slide)
    llm = get_primary_llm()
    if getattr(llm, "use_mock", False):
        return fallback
    payload = {
        "course_title": session.title,
        "course_objective": session.objective,
        "depth_level": getattr(session, "depth_level", "标准掌握"),
        "depth_policy": _depth_policy(getattr(session, "depth_level", "标准掌握")),
        "slide_title": slide.title,
        "slide_body": slide.body,
        "slide_board": slide.board,
        "slide_layout": slide.layout,
        "visual_theme": slide.visual_theme,
        "visual_prompt": slide.visual_prompt,
        "teacher_note": slide.teacher_note,
        "allowed_text": [slide.title, slide.body, *((slide.board or [])[:5])],
    }
    settings = get_settings()
    if "qwen-image-2.0" in (settings.qwen_image_model or "").lower():
        system = (
            "你是 AI 课堂的中文知识卡提示词设计师。"
            "目标模型是 qwen-image-2.0-pro，它擅长中英文文本渲染，适合生成图表、海报和 PPT 风格知识卡。"
            "请根据课程内容写一段完整中文图像提示词，让模型生成一张 16:9 横版课堂幻灯片整页图。"
            "必须严格保持用户提供的课程主题和本页主题，不得改成其他学科或其他章节。"
            "提示词必须包含：主标题、2-4 个模块标题、每个模块的短要点、必要示意图元素、整体版式和风格。"
            "画面文字只能来自 payload.allowed_text；禁止模型自由扩写、改写、补写中文；如果某段文字过长，要求模型改用无文字图标、箭头、结构线表达。"
            "必须写明：整张图片就是幻灯片页面本身，内容直接铺满 16:9 画布；禁止外层深色边框，禁止在图片中再画白色页面卡片，禁止播放器/电脑屏幕/窗口外壳。"
            "如果涉及数学公式，只放最关键的 1-3 个短公式，并要求公式清晰、不要复杂长推导。"
            "必须明确禁止手机、App界面、网页界面、真实人物、水印、无意义英文、乱码、伪文字和错别字。"
            "只输出提示词本身，不要 Markdown，不要解释。"
        )
    else:
        system = (
            "你是 AI 课堂的教学插图提示词设计师。"
            "请根据课程内容，写一段给图像生成模型使用的高质量中文提示词。"
            "目标是生成一张放在课堂展示框里的 16:9 教学插图，不是 PPT 页面。"
            "必须严格保持用户提供的课程主题和本页主题，不得改成其他学科或其他章节。"
            "提示词要具体描述画面构图、知识关系、视觉元素、风格和禁忌。"
            "尽量避免让图像模型生成可读正文、长公式或表格文字，因为文字容易出错；需要表达公式时用抽象符号、曲线、坐标、节点、箭头等视觉方式。"
            "提示词中必须明确禁止手机、App界面、网页界面、海报、广告、大段文字、水印和真实人物。"
            "只输出提示词本身，不要 Markdown，不要解释。"
        )
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.25,
            task="classroom",
        )
        prompt = _clean_text(raw)
        if not _prompt_matches_slide(prompt, session, slide):
            return fallback
        limit = 1600 if "qwen-image-2.0" in (settings.qwen_image_model or "").lower() else 900
        return _clip(prompt, limit) if len(prompt) >= 24 else fallback
    except Exception:
        return fallback


async def _enrich_session_images(session: ClassroomSessionResponse) -> ClassroomSessionResponse:
    settings = get_settings()
    if not settings.has_ai_image or not session.slides:
        return session
    max_count = max(1, min(4, settings.ai_image_max_count))
    ranked = sorted(
        enumerate(session.slides),
        key=lambda item: _slide_image_priority(item[1], item[0], len(session.slides)),
        reverse=True,
    )
    generated = 0
    for _, slide in ranked:
        if generated >= max_count:
            break
        if slide.image_url:
            continue
        prompt = await _build_slide_image_prompt(session, slide)
        data, _provider = await generate_ai_image_bytes(prompt, width=1344, height=768)
        if not data:
            continue
        slide.image_url = save_generated_image(data, ext=".png")
        generated += 1
    return session


async def _resolve_selected_resources(req: ClassroomGenerateRequest) -> list[dict[str, Any]]:
    ids = _unique(req.selected_resource_ids or req.resource_ids)
    rows: list[dict[str, Any]] = []
    for rid in ids[:8]:
        row = await get_resource(req.user_id, rid)
        if row:
            rows.append(row)
    if rows:
        return rows

    all_resources = await list_resources(req.user_id)
    title_blob = f"{req.title} {req.objective}"
    scored: list[tuple[int, dict[str, Any]]] = []
    for row in all_resources:
        blob = f"{row.get('title', '')} {row.get('topic', '')} {row.get('content', '')[:400]}"
        score = sum(1 for token in re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}", title_blob) if token in blob)
        if score > 0:
            scored.append((score, row))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [row for _, row in scored[:4]]


def _resource_summaries(resources: list[dict[str, Any]]) -> list[ClassroomResourceSummary]:
    return [
        ClassroomResourceSummary(
            id=str(r.get("id", "")),
            type=str(r.get("type", "")),
            title=str(r.get("title", "")),
            topic=str(r.get("topic", "")),
        )
        for r in resources
        if r.get("id")
    ]


def _resources_context(resources: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {
            "id": str(r.get("id", "")),
            "type": str(r.get("type", "")),
            "title": str(r.get("title", "")),
            "topic": str(r.get("topic", "")),
            "content_excerpt": _clip(str(r.get("content", "")), 1600),
        }
        for r in resources[:8]
    ]


def _local_materials_context(req: ClassroomGenerateRequest) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for item in req.local_materials[:6]:
        title = str(item.get("title", "")).strip()
        excerpt = _clip(str(item.get("content_excerpt", "")), 1600)
        if title:
            items.append({"title": title, "content_excerpt": excerpt})
    return items


def _depth_policy(depth_level: str) -> str:
    depth = (depth_level or "标准掌握").strip()
    policies = {
        "基础入门": (
            "课程深度：基础入门。目标是建立直观和最低必要概念。"
            "少推导，多使用类比、图解、最小例题和即时检查；避免一次引入多个新概念。"
        ),
        "标准掌握": (
            "课程深度：标准掌握。目标是让学生能独立完成同类题。"
            "需要包含定义、适用条件、标准例题、常见误区、迁移练习和课后巩固。"
        ),
        "进阶提高": (
            "课程深度：进阶提高。目标是理解概念之间的关系和方法选择。"
            "必须包含关键推导、条件边界、反例或易错对照、至少 2 道综合例题和 2 道迁移练习。"
        ),
        "挑战推导": (
            "课程深度：挑战推导。目标是让学生看懂为什么成立，而不只是会用。"
            "必须包含形式化定义、核心定理或结论的推导链、必要条件与反例、分步骤证明、较难综合题和思考题。"
        ),
        "项目应用": (
            "课程深度：项目应用。目标是把知识放入真实任务。"
            "必须包含问题建模、变量与假设、方法选择、结果解释、代码或实验思路、项目式作业和评价指标。"
        ),
    }
    return policies.get(depth, policies["标准掌握"])

def _fallback_classroom_quiz(req: ClassroomQuizRequest) -> ClassroomQuizResponse:
    points = _normalize_points(req.slide_board, [req.slide_title, req.slide_body], limit=5)
    correct = points[req.variant % max(len(points), 1)] if points else (req.slide_title or "先抓住当前页核心目标")
    distractors = _unique(
        [
            "只记住最后结论，不检查适用条件",
            "先做复杂题，再回头补基础定义",
            "忽略输入、输出和判断标准之间的关系",
            "把所有公式都背下来，不解释它们解决什么问题",
            *[p for p in points if p != correct],
        ]
    )
    texts = _unique([correct, *distractors])[:4]
    while len(texts) < 4:
        texts.append(f"补充选项 {len(texts) + 1}")
    shift = req.variant % len(texts)
    ordered = [*texts[shift:], *texts[:shift]]
    options = [ClassroomQuizOption(id=chr(65 + i), text=text) for i, text in enumerate(ordered)]
    answer_id = next((item.id for item in options if item.text == correct), "A")
    return ClassroomQuizResponse(
        id=str(uuid.uuid4()),
        question=f"关于「{req.slide_title or req.course_title}」，最合理的第一步判断是什么？",
        options=options,
        answer_id=answer_id,
        explanation=f"正确答案是「{correct}」。这一步能把当前页的问题压缩成可判断、可验证的小目标。",
        transfer="举一反三：换成同类题时，先找输入、输出、约束条件和判断标准，再决定用哪个概念或公式。",
        question_type="concept",
        difficulty="standard",
    )


def _normalize_quiz_response(data: dict[str, Any], req: ClassroomQuizRequest) -> ClassroomQuizResponse:
    fallback = _fallback_classroom_quiz(req)
    raw_options = data.get("options")
    options: list[ClassroomQuizOption] = []
    if isinstance(raw_options, list):
        for i, item in enumerate(raw_options[:4]):
            if isinstance(item, dict):
                option_id = _clean_text(item.get("id"))[:1].upper() or chr(65 + i)
                text = _clean_text(item.get("text"))
            else:
                option_id = chr(65 + i)
                text = _clean_text(item)
            if text:
                options.append(ClassroomQuizOption(id=option_id, text=_clip(text, 120)))
    if len(options) < 4:
        options = fallback.options
    valid_ids = {item.id for item in options}
    answer_id = _clean_text(data.get("answer_id")).upper()[:1] or fallback.answer_id
    if answer_id not in valid_ids:
        answer_id = fallback.answer_id if fallback.answer_id in valid_ids else options[0].id
    return ClassroomQuizResponse(
        id=str(uuid.uuid4()),
        question=_clip(_clean_text(data.get("question")) or fallback.question, 180),
        options=options[:4],
        answer_id=answer_id,
        explanation=_clip(_clean_text(data.get("explanation")) or fallback.explanation, 420),
        transfer=_clip(_clean_text(data.get("transfer")) or fallback.transfer, 360),
        question_type=_clip(_clean_text(data.get("question_type")) or fallback.question_type, 24),
        difficulty=_clip(_clean_text(data.get("difficulty")) or fallback.difficulty, 24),
    )


async def generate_classroom_quiz(req: ClassroomQuizRequest) -> ClassroomQuizResponse:
    fallback = _fallback_classroom_quiz(req)
    payload = {
        "course_title": req.course_title,
        "course_objective": req.course_objective,
        "slide_title": req.slide_title,
        "slide_body": req.slide_body,
        "slide_board": req.slide_board,
        "teacher_note": req.teacher_note,
        "depth_level": req.depth_level,
        "previous_question": req.previous_question,
        "variant": req.variant,
    }
    system = (
        "你是 AI 课堂的随堂选择题命题老师。请根据当前页内容生成一道新的单选题，不能复用上一题。\n"
        "题型选择规则：如果当前页含公式、数值、函数、导数、积分、概率、矩阵、回归、损失、梯度等内容，优先出计算型选择题；"
        "如果当前页含 Python、代码、算法步骤、模型训练、输入输出、API 等内容，优先出代码阅读/输出判断/流程判断题；"
        "如果当前页不适合计算或代码，就出概念辨析、错误判断、内容概括或应用场景选择题。\n"
        "参考常见选择题模式：定义辨析、条件判断、最佳下一步、计算结果、代码输出、错误原因、场景匹配、概念对比。\n"
        "要求：题干必须贴合当前页；4 个选项都要像真实干扰项；只有一个正确答案；解析说明为什么对、为什么常见错误会错；"
        "举一反三给一个同类变式方向。不要出开放题，不要让学生自己写长答案。\n"
        "只输出 JSON，不要 Markdown。字段：question, options, answer_id, explanation, transfer, question_type, difficulty。"
        'options 格式为 [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}]。'
    )
    try:
        llm = get_primary_llm()
        raw = await llm.chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.55,
            task="classroom",
        )
        data = _extract_json_object(raw)
        if not data:
            return fallback
        return _normalize_quiz_response(data, req)
    except Exception:
        return fallback


def _path_step_context(path: dict | None, step_key: str) -> dict[str, Any]:
    if not path:
        return {}

    def walk(steps: list[dict[str, Any]]) -> dict[str, Any] | None:
        for step in steps:
            if str(step.get("id") or step.get("order") or "") == step_key:
                return step
            found = walk(step.get("substeps") or [])
            if found:
                return found
        return None

    found = walk(path.get("steps") or [])
    if not found:
        return {}
    return {
        "id": found.get("id", ""),
        "title": found.get("title", ""),
        "objective": found.get("objective", ""),
        "status": found.get("status", ""),
        "resource_ids": found.get("resource_ids", []),
        "estimated_minutes": found.get("estimated_minutes", 20),
    }


def _fallback_session(
    req: ClassroomGenerateRequest,
    resources: list[dict[str, Any]],
    personalization_brief: str,
) -> ClassroomSessionResponse:
    title = req.title or "AI 个性化课堂"
    objective = req.objective or "建立本节知识的核心直觉，并完成一个小检查。"
    resource_titles = [str(r.get("title", "")) for r in resources[:3] if r.get("title")]
    local_titles = [str(m.get("title", "")) for m in req.local_materials[:3] if m.get("title")]
    all_titles = resource_titles + local_titles
    material_line = "、".join(resource_titles) if resource_titles else "当前路径目标"
    if local_titles:
        material_line = "、".join(all_titles)
    main_topic = title.replace("：", " ").split()[0] if title else "本节主题"
    slides = [
        ClassroomSlide(
            kicker="01 / 导入",
            title=title,
            body=f"这节课先明确学习目标：{objective}。参考资料会围绕“{material_line}”展开，而不是泛泛讲概念。",
            board=["本节目标是什么", "为什么现在要学它", "最后要能独立说清一个例子"],
            teacher_note="先把课程目标说清楚，再把学生带入一个具体问题场景。",
            layout="cover",
            visual_theme="清爽科技课堂封面",
            accent_color="blue",
            visual_prompt=f"为“{title}”设计一张现代课程封面，突出学习目标和知识结构。",
        ),
        ClassroomSlide(
            kicker="02 / 问题",
            title=f"{main_topic}要解决什么问题",
            body="先不背定义，先看它试图处理的现实困难：信息太多、关系不明显、判断标准不稳定，需要一种可复用的方法。",
            board=["先识别输入和输出", "再判断困难来自哪里", "最后说明方法为什么必要"],
            teacher_note="这一页不要急着给公式，重点是让学生知道学习动机。",
            layout="problem",
            visual_theme="问题拆解与场景引入",
            accent_color="amber",
            visual_prompt="用问题地图或场景卡片表现学习动机。",
        ),
        ClassroomSlide(
            kicker="03 / 概念",
            title="核心概念的直觉定义",
            body=f"把“{title}”压缩成一句话：它是一套把问题拆成可观察对象、可判断规则和可验证结果的学习过程。",
            board=["对象：我们观察什么", "规则：我们如何判断", "结果：我们如何验证"],
            teacher_note="用一句话定义，再用三个关键词帮助学生建立稳定抓手。",
            layout="concept",
            visual_theme="核心概念卡与三关键词",
            accent_color="teal",
            visual_prompt="用三个并列概念卡表现对象、规则、结果。",
        ),
        ClassroomSlide(
            kicker="04 / 步骤",
            title="讲义主线：从材料到结论",
            body="课堂讲义按照“背景问题 -> 核心概念 -> 最小例子 -> 易错点 -> 检查题”的顺序展开，降低认知负荷。",
            board=["背景问题先行", "概念只保留必要定义", "例子负责验证理解"],
            teacher_note="如果学生困惑，优先回到这一页的五段结构。",
            layout="timeline",
            visual_theme="五段式课堂路径",
            accent_color="indigo",
            visual_prompt="用横向流程线表现从背景到检查的课堂结构。",
        ),
        ClassroomSlide(
            kicker="05 / 例子",
            title="用一个最小例子跑一遍",
            body="选择一个足够小的案例，把输入、处理过程和输出都摆出来，让学生看到概念如何真正工作。",
            board=["给出一个具体场景", "指出需要判断的目标", "解释每一步为什么这样做"],
            teacher_note="例子必须短，不要引入第二个新概念。",
            layout="example",
            visual_theme="案例演示与输入输出",
            accent_color="green",
            visual_prompt="用输入-处理-输出三栏表现最小案例。",
        ),
        ClassroomSlide(
            kicker="06 / 易错点",
            title="最容易混淆的地方",
            body="学生常见卡点不是不知道术语，而是不清楚概念边界、适用条件和结果判断方式。",
            board=["不要把定义当作结论", "不要跳过适用条件", "不要只看结果不看依据"],
            teacher_note="把易错点讲成提醒，而不是批评。",
            layout="mistake",
            visual_theme="易错点对照表",
            accent_color="rose",
            visual_prompt="用警示清单和对照关系表现常见误区。",
        ),
        ClassroomSlide(
            kicker="07 / 检查",
            title="课堂中途检查",
            body="用一道最小问题确认学生是否能迁移：换一个场景，仍然能指出输入、规则和输出。",
            board=["请先一句话复述", "再指出一个输入", "最后说明结果怎么判断"],
            teacher_note="如果学生答不上来，转入慢速模式，不继续推进新内容。",
            layout="quiz",
            visual_theme="课堂检查题",
            accent_color="violet",
            visual_prompt="用测验卡片表现课堂检查与迁移。",
        ),
        ClassroomSlide(
            kicker="08 / 收束",
            title="课后如何巩固",
            body="课后任务不追求数量，而是让学生把本节概念重新组织成自己的语言，并完成一个小迁移。",
            board=["整理 3 句话讲义", "完成 1 道迁移题", "记录 1 个仍卡住的问题"],
            teacher_note="结尾强调低负担复盘，给学生留下可完成的动作。",
            layout="summary",
            visual_theme="总结与行动清单",
            accent_color="cyan",
            visual_prompt="用行动清单表现课后复盘路径。",
        ),
    ]
    for slide in slides:
        slide.visual_blocks = _default_visual_blocks(slide, title, objective)
    handout = [
        ClassroomHandoutSection(
            heading="学习目标",
            content=f"围绕“{objective}”建立核心直觉，并能用自己的话解释“{title}”解决的问题。",
        ),
        ClassroomHandoutSection(
            heading="参考资料",
            content=f"本节课优先参考：{material_line}。资料中的定义、例子和易错点会被压缩进课堂主线。",
        ),
        ClassroomHandoutSection(
            heading="讲义主线",
            content="背景问题 -> 核心概念 -> 最小例子 -> 易错点 -> 课堂检查 -> 课后巩固。",
        ),
        ClassroomHandoutSection(
            heading="课堂检查",
            content="学生需要能用一句话复述核心直觉，并在新场景中指出输入、规则和输出。",
        ),
        ClassroomHandoutSection(
            heading="个性化策略",
            content="如果实时画像显示困惑或负荷升高，课堂会减少分支、放慢节奏，并优先使用具体例子。",
        ),
    ]
    scripts = ClassroomTeacherScripts(
        normal=f"我们先把这节课抓成一句话：{title}不是孤立术语，而是在帮你解决“{objective}”背后的那个问题。",
        confused="卡住很正常。我们先拆回最小单位：输入是什么，输出是什么，中间哪一步让你不确定。",
        slow="我会讲慢一点。你先不用记全部细节，只抓住每一步是在降低哪种困难。",
        example="换个例子：把它想成一次路线规划，目标不是背地图，而是知道每个路口为什么这样转。",
        practice="来一道小题：请用一句话说出本节概念要解决的问题，再举一个你自己的例子。",
    )
    return ClassroomSessionResponse(
        id=str(uuid.uuid4()),
        title=title,
        objective=objective,
        course_name=req.course_name,
        estimated_minutes=req.estimated_minutes or 20,
        depth_level=req.depth_level,
        slides=slides,
        handout=handout,
        teacher_scripts=scripts,
        check_question=ClassroomCheckQuestion(
            question="请用一句话复述本节课的核心直觉。",
            expected_answer="能说出本节概念要解决的问题，并能解释为什么需要这个方法。",
            hint="先不要背术语，先说它在帮你减少什么困难。",
        ),
        homework=[
            "用 3 句话写出本节核心直觉",
            "完成 1 道最小检查题",
            "标记仍然卡住的一个概念",
        ],
        source_resources=_resource_summaries(resources),
        prompt_summary=f"课堂依据：{title}；目标：{objective}；参考资料：{material_line}。",
        personalization_brief=personalization_brief,
    )


def _extract_json_object(raw: str) -> dict[str, Any] | None:
    raw = filter_sensitive(raw or "").strip()
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return None
    try:
        data = json.loads(match.group())
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _normalize_llm_session(
    data: dict[str, Any],
    req: ClassroomGenerateRequest,
    resources: list[dict[str, Any]],
    personalization_brief: str,
) -> ClassroomSessionResponse:
    fallback = _fallback_session(req, resources, personalization_brief)
    fallback_slides = fallback.slides
    slides_raw = data.get("slides") if isinstance(data.get("slides"), list) else []
    slides: list[ClassroomSlide] = []
    for i, item in enumerate(slides_raw[:18]):
        if not isinstance(item, dict):
            continue
        fallback_slide = fallback_slides[min(i, len(fallback_slides) - 1)]
        title = _clean_text(item.get("title")) or fallback_slide.title
        body = _clean_text(item.get("body")) or fallback_slide.body
        if len(body) < 18:
            body = fallback_slide.body
        board = _normalize_points(item.get("board"), fallback_slide.board, limit=5)
        teacher_note = _clean_text(item.get("teacher_note")) or fallback_slide.teacher_note
        slides.append(
            ClassroomSlide(
                kicker=_clean_text(item.get("kicker")) or f"{i + 1:02d} / 课堂",
                title=title,
                body=body,
                board=board,
                teacher_note=teacher_note,
                layout=_clean_text(item.get("layout")) or fallback_slide.layout,
                visual_theme=_clean_text(item.get("visual_theme")) or fallback_slide.visual_theme,
                accent_color=_clean_text(item.get("accent_color")) or fallback_slide.accent_color,
                visual_prompt=_clean_text(item.get("visual_prompt")) or fallback_slide.visual_prompt,
                visual_blocks=_normalize_visual_blocks(
                    item.get("visual_blocks"),
                    fallback_slide.visual_blocks,
                    fallback_slide,
                ),
                image_url=_clean_text(item.get("image_url")),
            )
        )
    if len(slides) < 6:
        seen_titles = {s.title for s in slides}
        for item in fallback_slides:
            if item.title not in seen_titles:
                slides.append(item)
                seen_titles.add(item.title)
            if len(slides) >= 8:
                break
    slides = slides[:18]

    scripts_raw = data.get("teacher_scripts") if isinstance(data.get("teacher_scripts"), dict) else {}
    question_raw = data.get("check_question") if isinstance(data.get("check_question"), dict) else {}
    homework_raw = data.get("homework") or []
    homework = _normalize_points(homework_raw, fallback.homework, limit=6)
    handout_raw = data.get("handout") or data.get("handout_sections") or []
    handout: list[ClassroomHandoutSection] = []
    if isinstance(handout_raw, list):
        for i, item in enumerate(handout_raw[:10]):
            if isinstance(item, dict):
                heading = _clean_text(item.get("heading") or item.get("title"))
                content = _clean_text(item.get("content") or item.get("body"))
            else:
                heading = f"讲义要点 {i + 1}"
                content = _clean_text(item)
            if heading and len(content) >= 8:
                handout.append(ClassroomHandoutSection(heading=heading, content=content))
    if len(handout) < 4:
        existing = {x.heading for x in handout}
        for item in fallback.handout:
            if item.heading not in existing:
                handout.append(item)
            if len(handout) >= 6:
                break
    return ClassroomSessionResponse(
        id=str(uuid.uuid4()),
        title=_clean_text(data.get("title")) or req.title or "AI 个性化课堂",
        objective=_clean_text(data.get("objective")) or req.objective or "",
        course_name=req.course_name,
        estimated_minutes=req.estimated_minutes or 20,
        depth_level=req.depth_level,
        slides=slides,
        handout=handout,
        teacher_scripts=ClassroomTeacherScripts(
            normal=_clean_text(scripts_raw.get("normal")) or fallback.teacher_scripts.normal,
            confused=_clean_text(scripts_raw.get("confused")) or fallback.teacher_scripts.confused,
            slow=_clean_text(scripts_raw.get("slow")) or fallback.teacher_scripts.slow,
            example=_clean_text(scripts_raw.get("example")) or fallback.teacher_scripts.example,
            practice=_clean_text(scripts_raw.get("practice")) or fallback.teacher_scripts.practice,
        ),
        check_question=ClassroomCheckQuestion(
            question=_clean_text(question_raw.get("question")) or fallback.check_question.question,
            expected_answer=_clean_text(question_raw.get("expected_answer")) or fallback.check_question.expected_answer,
            hint=_clean_text(question_raw.get("hint")) or fallback.check_question.hint,
        ),
        homework=homework,
        source_resources=_resource_summaries(resources),
        prompt_summary=_clean_text(data.get("prompt_summary")) or fallback.prompt_summary,
        personalization_brief=personalization_brief,
    )


async def generate_classroom_session(req: ClassroomGenerateRequest) -> ClassroomSessionResponse:
    profile = await get_profile(req.user_id)
    realtime = await get_realtime_state(req.user_id)
    path = await get_path(req.user_id)
    path_step = _path_step_context(path, req.step_key)
    resources = await _resolve_selected_resources(req)
    strategy = build_personalization_strategy(
        profile=profile,
        realtime_state=realtime,
        question_type="classroom",
        question=req.title or req.objective,
    )
    personalization_brief = (
        format_personalization_strategy_prompt(strategy)
        + "\n\n"
        + format_realtime_reply_policy_prompt(strategy, realtime)
    )

    llm = get_primary_llm()
    fallback = _fallback_session(req, resources, personalization_brief)
    depth_policy = _depth_policy(req.depth_level)
    if getattr(llm, "use_mock", False):
        return await _enrich_session_images(fallback)

    payload = {
        "output_language": "zh-CN",
        "quality_level": "完整中文自学课件",
        "course_name": req.course_name,
        "classroom_step": {
            "step_key": req.step_key,
            "title": req.title or path_step.get("title", ""),
            "objective": req.objective or path_step.get("objective", ""),
            "estimated_minutes": req.estimated_minutes,
        },
        "classroom_preferences": {
            "teaching_mode": req.teaching_mode,
            "depth_level": req.depth_level,
            "depth_policy": depth_policy,
            "keywords": req.classroom_keywords,
            "ai_material_requests": req.ai_material_requests,
        },
        "long_term_profile": profile or {},
        "realtime_profile": realtime or {},
        "personalization_strategy_for_ai_only": personalization_brief,
        "selected_resources": _resources_context(resources),
        "local_materials": _local_materials_context(req),
    }
    system = (
        "你是 LearnPath 的 AI 课堂编排器。请根据学生长期画像、实时画像、路径节点和用户选择的资料，"
        "生成一节可以直接进入上课的完整课堂包。课堂必须优先使用 selected_resources 和 local_materials，"
        "如果用户上传或选择了资料，PPT 和讲义都要体现这些资料中的核心概念、例子或易错点。\n"
        "只输出 JSON，不要输出 Markdown、解释或代码块。\n"
        "JSON 字段：title, objective, slides, handout, teacher_scripts, check_question, homework, prompt_summary。\n"
        "slides 为 8-12 页，像真正 PPT：每页包含 kicker/title/body/board/teacher_note。"
        "每页还必须包含 layout/visual_theme/accent_color/visual_prompt/visual_blocks。"
        "layout 只能从 cover/problem/concept/timeline/example/mistake/quiz/summary 中选择，"
        "accent_color 只能从 blue/teal/amber/indigo/green/rose/violet/cyan 中选择。"
        "visual_blocks 是给前端和 PPT 渲染的结构化教学块，每页 1-2 个，禁止只写装饰性描述；"
        "type 可用 table/compare/process/example/exercise/formula/diagram。"
        "table/compare 必须包含 columns 和 rows；process/diagram 必须包含 steps；"
        "example/exercise/formula 必须包含 question、steps、answer。"
        "整套 slides 至少包含 2 个表格、2 个例题或示例、2 个课堂练习/检查题、1 个流程图、1 个概念对照或公式解释。"
        "这些内容要优先来自 selected_resources/local_materials，并服务于教学理解，不要为了填满页面而堆砌空话。"
        "board 必须是 3-5 条完整短句，禁止输出单字、空字符串或把一个词拆成多个字。"
        "body 必须能独立讲清这一页，不要只写标题。teacher_note 是 AI 老师逐页讲稿。"
        "handout 为 6-10 个讲义小节，每节包含 heading/content，content 要是学生课后能复习的完整内容。"
        "teacher_scripts 包含 normal/confused/slow/example/practice，分别对应标准讲法、听不懂、讲慢点、换例子、来道题。"
        "check_question 生成一个课堂检查题，homework 生成 3-6 个轻量课后任务。"
        "prompt_summary 是给后续 AI 对话使用的内部摘要，不要写给学生看的宣传语。"
    )
    quality_contract = (
        f"{depth_policy}\n"
        "输出语言必须是简体中文。除必要的代码、公式、英文专有名词外，标题、正文、讲义、题目、解析、作业都必须使用中文。\n"
        "PPT 必须是一套可供学生自学的正式教学课件，不是装饰性大纲。主题需要深度时生成 14-18 页。\n"
        "每一页都必须有一个具体可学习对象：定义、定理、公式、完整例题、误区对照表、方法流程或分层练习。\n"
        "数学类主题必须在 visual_blocks 中用 latex/formula/expression 提供公式；公式解释要说明每个符号的含义。\n"
        "例题和练习必须包含 question、steps、answer、explanation、difficulty，并给出可检查的最终结果。\n"
        "整套课件至少包含 3 个完整例题和 3 个递进练习，其中至少有 1 个定义法例题、1 个迁移练习、1 个常见误区对照表。\n"
        "禁止只写“核心概念、学习步骤、视觉区域、清爽封面”等空泛词；每句话都要服务于具体知识理解。\n"
    )
    system = quality_contract + system
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.35,
            task="classroom",
        )
        data = _extract_json_object(raw)
        if not data:
            return await _enrich_session_images(fallback)
        session = _normalize_llm_session(data, req, resources, personalization_brief)
        return await _enrich_session_images(session)
    except Exception:
        return await _enrich_session_images(fallback)
