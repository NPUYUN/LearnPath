"""Shared learning-asset metadata inference and compatibility helpers."""

from __future__ import annotations

import re
from typing import Any


PURPOSE_STAGE = {
    "preview": "课前预习",
    "explain": "课堂讲解",
    "practice": "课后练习",
    "review": "复习巩固",
    "exam": "应试训练",
    "classroom": "课堂讲解",
    "project": "项目实践",
}

PURPOSE_USED_FOR = {
    "preview": ["path", "classroom", "review"],
    "explain": ["path", "classroom", "review"],
    "practice": ["path", "classroom", "quiz", "review"],
    "review": ["path", "review"],
    "exam": ["path", "classroom", "quiz", "review"],
    "classroom": ["classroom", "path", "quiz"],
    "project": ["path", "classroom"],
}

TYPE_PURPOSE = {
    "doc": "explain",
    "mindmap": "review",
    "quiz": "practice",
    "reading": "preview",
    "media": "classroom",
    "code": "project",
    "ppt": "classroom",
    "design": "project",
    "project": "project",
}

PURPOSE_MINUTES = {
    "preview": 6,
    "explain": 10,
    "practice": 12,
    "review": 8,
    "exam": 18,
    "classroom": 12,
    "project": 30,
}

TYPE_SCENARIOS = {
    "doc": ["课前预习", "课堂讲解", "课后复习"],
    "mindmap": ["课堂总结", "课后复习", "考前回顾"],
    "quiz": ["课堂小测", "课后练习", "应试训练"],
    "reading": ["课前预习", "进阶拓展"],
    "media": ["课堂讲解", "概念可视化"],
    "code": ["实践课堂", "项目实践", "课后实操"],
    "ppt": ["课堂讲授", "集体复习"],
    "design": ["教学实施", "AI 课堂编排"],
    "project": ["项目实践", "综合评价"],
}

TYPE_POST_CHECK = {
    "doc": "遮住例题答案独立复现解题步骤，再完成自检问题并解释依据。",
    "mindmap": "合上导图，按核心概念、方法、应用和易错点四条主线口述知识结构。",
    "quiz": "限时完成全部题目，并能解释每个错误选项对应的真实误区。",
    "reading": "回答每条材料后的阅读问题，并用三句话说明它与当前知识点的联系。",
    "media": "不看旁白复述图中的变量或步骤关系，并完成分镜后的检查问题。",
    "code": "按运行说明复现示例，修改一个关键变量并解释输出变化。",
    "ppt": "根据互动问题试讲一遍，并用总结页检查是否覆盖教学目标。",
    "design": "按流程模拟一次课堂，检查互动、小测、评价和 AI 课堂衔接是否闭环。",
    "project": "依据评价标准验收交付成果，并说明一个失败风险及其解决方案。",
}

TYPE_NEXT_STEP = {
    "doc": "完成配套题集，或把例题交给 AI 课堂进行变式追问。",
    "mindmap": "选择一个薄弱分支，回到讲义或专项练习补强。",
    "quiz": "按错因归类错题，再生成对应误区讲解或变式训练。",
    "reading": "围绕阅读后问题整理一页笔记，并进入进阶资源。",
    "media": "结合讲义重画一次关系图，随后完成课堂小测。",
    "code": "完成扩展任务，并把关键输出与理论预期进行对照。",
    "ppt": "把互动题和例题页加入 AI 课堂试讲并记录反馈。",
    "design": "按教学流程生成课件、课堂小测和课后任务。",
    "project": "先完成最小可交付版本，再依据评价标准逐项迭代。",
}


def _strings(value: Any, limit: int = 8) -> list[str]:
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        items = re.split(r"[、,，;/；\n]+", value)
    else:
        items = []
    out: list[str] = []
    for item in items:
        text = str(item or "").strip()
        if text and text not in out:
            out.append(text[:80])
        if len(out) >= limit:
            break
    return out


def _plain_text(content: str) -> str:
    text = re.sub(r"```[\s\S]*?```", " ", content or "")
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)", " ", text)
    text = re.sub(r"[#>*_`|~-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _summary(resource: dict[str, Any], knowledge_points: list[str], expected: str) -> str:
    existing = resource.get("summary")
    if isinstance(resource.get("metadata"), dict):
        existing = resource["metadata"].get("summary") or existing
    text = str(existing or "").strip()
    if not text:
        point = "、".join(knowledge_points[:2]) or str(resource.get("topic") or "当前知识点")
        excerpt = _plain_text(str(resource.get("content") or ""))
        excerpt = re.sub(r"^(?:【[^】]{1,24}】\s*)+", "", excerpt)
        excerpt = re.sub(r"^(?:学术讲义风格|学习资源导航)\s*", "", excerpt)
        text = f"本资源围绕{point}组织可直接使用的讲解、示例或学习任务，帮助学生从理解走向应用。{excerpt[:55]}"
        if len(text) < 80:
            text += f"完成后，{expected.rstrip('。')}。"
    if len(text) < 80:
        text += "建议按学习前提示、正文实践和学习后检查的顺序使用，并记录仍未解决的问题。"
    return text[:120]


def _learning_before_tip(prerequisites: list[str]) -> str:
    if prerequisites:
        return f"开始前请先确认已了解{'、'.join(prerequisites[:3])}；不熟悉时先完成最小前置复习。"
    return "开始前先用一句话写下你对目标知识点的已有理解，并标记最不确定的一个问题。"


def _knowledge_rows(context: dict[str, Any]) -> list[dict[str, Any]]:
    value = context.get("knowledge_index") or []
    return [row for row in value if isinstance(row, dict)] if isinstance(value, list) else []


def _infer_knowledge_points(
    resource: dict[str, Any], context: dict[str, Any], state: dict[str, Any]
) -> list[str]:
    explicit = _strings(resource.get("knowledge_points") or context.get("target_knowledge_points"))
    if explicit:
        return explicit

    query = " ".join(
        str(value or "")
        for value in (
            resource.get("topic"),
            resource.get("title"),
            state.get("stage_title"),
            context.get("stage_objective"),
        )
    )
    matched: list[str] = []
    for row in _knowledge_rows(context):
        name = str(row.get("name") or row.get("title") or row.get("knowledge_point") or "").strip()
        if name and (name in query or any(token in query for token in _strings(row.get("aliases")))):
            matched.append(name)
    if matched:
        return _strings(matched, 5)

    topic = str(resource.get("topic") or state.get("stage_title") or "").strip()
    title = str(resource.get("title") or "").strip()
    return _strings([topic or title or "当前学习主题"], 3)


def _infer_purpose(
    resource_type: str, context: dict[str, Any], state: dict[str, Any]
) -> str:
    explicit = str(context.get("learning_purpose") or "").strip()
    if explicit in PURPOSE_STAGE:
        return explicit
    text = " ".join(
        str(value or "")
        for value in (context.get("requirements"), context.get("stage_objective"), state.get("stage_title"))
    )
    for keyword, purpose in (
        ("应试", "exam"),
        ("考试", "exam"),
        ("预习", "preview"),
        ("复习", "review"),
        ("错题", "review"),
        ("课堂", "classroom"),
        ("练习", "practice"),
        ("项目", "project"),
        ("实验", "project"),
    ):
        if keyword in text:
            return purpose
    return TYPE_PURPOSE.get(resource_type, "explain")


def _infer_difficulty(context: dict[str, Any], state: dict[str, Any], purpose: str) -> str:
    text = " ".join(
        str(value or "")
        for value in (
            context.get("requirements"),
            context.get("learner_analysis_brief"),
            (state.get("profile") or {}).get("knowledge_level") if isinstance(state.get("profile"), dict) else "",
        )
    )
    if purpose == "exam" or any(word in text for word in ("应试", "考试", "高考", "期末")):
        return "exam"
    if any(word in text for word in ("深入", "高级", "进阶", "综合", "较难")):
        return "advanced"
    if any(word in text for word in ("基础", "入门", "零基础", "简单")):
        return "basic"
    return "intermediate"


def build_resource_metadata(
    resource: dict[str, Any],
    *,
    generation_context: dict[str, Any] | None = None,
    state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    context = generation_context or {}
    runtime = state or {}
    existing = resource.get("metadata") if isinstance(resource.get("metadata"), dict) else {}
    resource_type = str(resource.get("type") or "doc")
    purpose = str(existing.get("learning_purpose") or _infer_purpose(resource_type, context, runtime))
    if purpose not in PURPOSE_STAGE:
        purpose = TYPE_PURPOSE.get(resource_type, "explain")
    knowledge_points = _strings(existing.get("knowledge_points")) or _infer_knowledge_points(
        resource, context, runtime
    )
    difficulty = str(existing.get("difficulty") or _infer_difficulty(context, runtime, purpose))
    if difficulty not in {"basic", "intermediate", "advanced", "exam"}:
        difficulty = "intermediate"
    prerequisites = _strings(existing.get("prerequisites") or context.get("prerequisites"), 6)
    expected = str(existing.get("expected_outcome") or "").strip()
    if not expected:
        point = "、".join(knowledge_points[:2]) or str(resource.get("topic") or "当前知识点")
        expected = f"能够解释{point}，并在一个具体问题中正确使用。"
    source_files = _strings(existing.get("source_files") or resource.get("sources"), 10)
    path_step_key = str(
        existing.get("path_step_key")
        or context.get("path_step_key")
        or runtime.get("path_step_key")
        or ""
    ).strip()
    used_for = _strings(existing.get("used_for") or PURPOSE_USED_FOR[purpose], 4)
    summary = _summary(resource, knowledge_points, expected)
    scenarios = _strings(existing.get("suitable_scenarios") or TYPE_SCENARIOS.get(resource_type, [PURPOSE_STAGE[purpose]]), 5)
    before_tip = str(existing.get("learning_before_tip") or _learning_before_tip(prerequisites)).strip()
    after_check = str(existing.get("learning_after_check") or TYPE_POST_CHECK.get(resource_type, "完成一个独立任务并解释自己的判断依据。")).strip()
    next_step = str(existing.get("next_step") or TYPE_NEXT_STEP.get(resource_type, "进入下一层难度资源并完成一次迁移应用。")).strip()
    generated_context = dict(existing.get("generated_context") or {})
    if not generated_context:
        generated_context = {
            "topic": str(resource.get("topic") or runtime.get("stage_title") or "")[:160],
            "requirements": str(context.get("requirements") or "")[:800],
            "generation_mode": str(resource.get("generation_mode") or context.get("mode") or ""),
            "target_knowledge_points": knowledge_points[:8],
            "search_summary": str(context.get("web_context") or "")[:1200],
        }
    return {
        **existing,
        "knowledge_points": knowledge_points,
        "difficulty": difficulty,
        "learning_purpose": purpose,
        "used_for": [item for item in used_for if item in {"path", "classroom", "quiz", "review"}],
        "recommended_stage": str(existing.get("recommended_stage") or PURPOSE_STAGE[purpose]),
        "estimated_minutes": max(
            3,
            min(90, int(existing.get("estimated_minutes") or PURPOSE_MINUTES[purpose])),
        ),
        "prerequisites": prerequisites,
        "summary": summary,
        "learning_before_tip": before_tip[:240],
        "learning_after_check": after_check[:240],
        "suitable_scenarios": scenarios,
        "next_step": next_step[:240],
        "expected_outcome": expected[:240],
        "source_library_id": str(
            existing.get("source_library_id")
            or resource.get("library_id")
            or context.get("library_id")
            or ""
        ),
        "source_files": source_files,
        "path_step_key": path_step_key,
        "quality_score": float(existing.get("quality_score") or 0),
        "quality_reason": str(existing.get("quality_reason") or ""),
        "quality_issues": _strings(existing.get("quality_issues"), 12),
        "quality_tags": _strings(existing.get("quality_tags"), 8),
        "quality_dimensions": dict(existing.get("quality_dimensions") or {}),
        "review_attempts": int(existing.get("review_attempts") or 0),
        "full_rewrite_attempted": bool(existing.get("full_rewrite_attempted", False)),
        "classroom_ready": bool(existing.get("classroom_ready", False)),
        "classroom_missing": _strings(existing.get("classroom_missing"), 8),
        "duplicate_of": str(existing.get("duplicate_of") or ""),
        "formula_issues": _strings(existing.get("formula_issues"), 8),
        "quiz_invalid_questions": [
            int(value)
            for value in list(existing.get("quiz_invalid_questions") or [])[:20]
            if str(value).isdigit()
        ],
        "quiz_semantic_verified": bool(existing.get("quiz_semantic_verified", False)),
        "quiz_semantic_review": dict(existing.get("quiz_semantic_review") or {}),
        "generated_context": generated_context,
        "path_attachment_warning": str(existing.get("path_attachment_warning") or ""),
    }


def with_resource_metadata(
    resource: dict[str, Any],
    *,
    generation_context: dict[str, Any] | None = None,
    state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        **resource,
        "metadata": build_resource_metadata(
            resource,
            generation_context=generation_context,
            state=state,
        ),
        "status": resource.get("status") if resource.get("status") in {"draft", "published"} else "published",
    }
