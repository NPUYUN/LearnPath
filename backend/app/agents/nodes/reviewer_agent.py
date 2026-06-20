"""ResourceReviewer: type-aware learning-value checks and one-shot repair."""

from __future__ import annotations

import ast
import logging
import re
from typing import Any

from app.core.guardrails import filter_sensitive
from app.core.llm import get_aux_llm, get_primary_llm
from app.core.prompts import resource_generation_system, reviewer_system
from app.services.quiz_validation_service import (
    replace_question_blocks,
    validate_quiz_content,
)
from app.services.quiz_semantic_review_service import review_quiz_semantics
from app.services.resource_content_service import formula_quality_issues, normalize_latex_markdown
from app.services.resource_metadata_service import with_resource_metadata

logger = logging.getLogger(__name__)

QUALITY_THRESHOLD = 7.0


async def _aux_review_snippet(title: str, excerpt: str) -> str | None:
    aux = get_aux_llm()
    if aux.use_mock:
        return None
    prompt = [
        {"role": "system", "content": reviewer_system()},
        {
            "role": "user",
            "content": f"标题：{title}\n节选：{excerpt[:1200]}\n请只用一句话指出最重要的学习价值或质量风险。",
        },
    ]
    try:
        text = (await aux.chat(prompt, temperature=0.2)).strip()
        return text[:160] if text else None
    except Exception:
        return None


def _content_fingerprint(content: str) -> str:
    return re.sub(r"\W+", "", content.lower())[:1600]


def _shingles(text: str, size: int = 4) -> set[str]:
    normalized = _content_fingerprint(text)
    if len(normalized) < size:
        return {normalized} if normalized else set()
    return {normalized[index : index + size] for index in range(len(normalized) - size + 1)}


def _similarity(left: str, right: str) -> float:
    a, b = _shingles(left), _shingles(right)
    if not a or not b:
        return 0.0
    return len(a & b) / max(1, len(a | b))


def _duplicate_id(resource: dict, existing_resources: list[dict]) -> str:
    content = str(resource.get("content") or "")
    title = str(resource.get("title") or "").strip()
    metadata = resource.get("metadata") if isinstance(resource.get("metadata"), dict) else {}
    points = set(str(x) for x in metadata.get("knowledge_points") or [] if str(x).strip())
    for old in existing_resources:
        if old.get("id") == resource.get("id") or old.get("status") == "draft":
            continue
        old_content = str(old.get("content") or "")
        old_meta = old.get("metadata") if isinstance(old.get("metadata"), dict) else {}
        old_points = set(str(x) for x in old_meta.get("knowledge_points") or [] if str(x).strip())
        same_title_and_point = bool(title and title == str(old.get("title") or "").strip() and points & old_points)
        if same_title_and_point or _similarity(content, old_content) >= 0.72:
            return str(old.get("id") or "existing")
    return ""


def _has(content: str, *patterns: str) -> bool:
    return any(re.search(pattern, content, re.I | re.M) for pattern in patterns)


def _count(content: str, pattern: str) -> int:
    return len(re.findall(pattern, content, re.I | re.M))


def _code_blocks(content: str) -> list[tuple[str, str]]:
    return [
        (match.group(1).strip().lower(), match.group(2).strip())
        for match in re.finditer(r"```([\w#+.-]*)\s*\n([\s\S]*?)```", content)
    ]


def _python_syntax_ok(blocks: list[tuple[str, str]]) -> bool:
    python_blocks = [code for language, code in blocks if language in {"python", "py"}]
    if not python_blocks:
        return True
    try:
        ast.parse(max(python_blocks, key=len))
        return True
    except SyntaxError:
        return False


def _mindmap_depth(content: str) -> int:
    match = re.search(r"```mermaid\s*\n([\s\S]*?)```", content, re.I)
    if not match or "mindmap" not in match.group(1).lower():
        return 0
    levels: set[int] = set()
    for line in match.group(1).splitlines():
        if not line.strip() or line.strip().lower() == "mindmap":
            continue
        levels.add(len(line) - len(line.lstrip(" ")))
    return len(levels)


def _type_checks(resource_type: str, content: str) -> list[tuple[bool, str, bool]]:
    """Return (passed, issue, hard_requirement) checks for the concrete resource type."""
    if resource_type == "doc":
        return [
            (_has(content, r"典型例题", r"例题\s*\d*"), "讲义没有典型例题", True),
            (_has(content, r"解题思路", r"分析[：:]"), "例题缺少解题思路", True),
            (_has(content, r"步骤\s*1", r"1[.、)]\s*.+\n.*2[.、)]") and _has(content, r"最终答案", r"答案[：:]"), "例题缺少完整步骤或最终答案", True),
            (_has(content, r"易错点", r"常见误区"), "讲义没有易错点", False),
            (_has(content, r"自检") and _has(content, r"参考答案", r"答案[：:]") and _has(content, r"解析", r"详解"), "自检问题缺少答案或解析", True),
        ]

    if resource_type == "quiz":
        quiz_validation = validate_quiz_content(content)
        questions = _count(content, r"^#{2,4}\s*第\s*\d+\s*题")
        answers = _count(content, r"(?:\*\*)?答案(?:\*\*)?\s*[：:]")
        explanations = _count(content, r"(?:\*\*)?(?:详细解析|详解|解析)(?:\*\*)?\s*[：:]?")
        targets = _count(content, r"(?:目标)?知识点\s*[：:]")
        single_choice = _count(content, r"题型\s*[：:]\s*单选")
        option_sets = min(
            _count(content, r"^\s*[-*]\s*(?:\*\*)?A[.．、:：)](?:\*\*)?"),
            _count(content, r"^\s*[-*]\s*(?:\*\*)?B[.．、:：)](?:\*\*)?"),
            _count(content, r"^\s*[-*]\s*(?:\*\*)?C[.．、:：)](?:\*\*)?"),
            _count(content, r"^\s*[-*]\s*(?:\*\*)?D[.．、:：)](?:\*\*)?"),
        )
        diagnoses = _count(content, r"^\s*[-*]\s*(?:\*\*)?[A-D][.．、:：)].*(?:误区|混淆|忽略|错误|说明)")
        definition_hits = _count(content, r"(?:定义|是指|含义|概念是)")
        application_hits = _count(content, r"(?:情境|给定|计算|代码|案例|输出|变化|判断依据|实验)")
        invalid_type = _has(content, r"题型\s*[：:]\s*(?:填空|简答|多选|计算题)")
        return [
            (questions >= 8, f"题集只有 {questions} 道题，少于 8 道", True),
            (not invalid_type and _has(content, r"单选", r"判断"), "题型不是仅由单选题和判断题组成", True),
            (_has(content, r"基础") and _has(content, r"应用") and _has(content, r"易错", r"辨析"), "题目缺少基础、应用、易错分层", False),
            (answers >= questions and questions > 0, "并非每道题都有答案", True),
            (explanations >= questions and questions > 0, "并非每道题都有详细解析", True),
            (targets >= questions and questions > 0, "并非每道题都绑定知识点", True),
            (single_choice == 0 or option_sets >= single_choice, "单选题缺少完整 A-D 选项", True),
            (single_choice == 0 or diagnoses >= single_choice * 3, "错误选项缺少真实误区诊断", True),
            (definition_hits < max(4, questions // 2) or application_hits >= 3, "题目过度集中于定义记忆", True),
            (
                quiz_validation["passed"],
                "题目答案与选项、计算过程或解析不一致"
                if quiz_validation["invalid_questions"]
                else "无法识别可校验的题目结构",
                True,
            ),
        ]

    if resource_type == "code":
        blocks = _code_blocks(content)
        code = max((block for _, block in blocks), key=len, default="")
        chinese_comments = _count(code, r"(?:#|//|/\*)[^\n]*[\u4e00-\u9fff]")
        runnable_shape = _has(code, r"if\s+__name__\s*==", r"function\s+main", r"public\s+static\s+void\s+main", r"int\s+main\s*\(")
        return [
            (len(code) >= 120 and "..." not in code and "此处" not in code, "没有完整可运行代码，或仍含省略内容", True),
            (chinese_comments >= 2, "代码缺少充分中文注释", True),
            (_has(content, r"运行环境", r"环境与版本"), "没有说明运行环境和版本", True),
            (_has(content, r"运行步骤", r"如何运行") and runnable_shape, "没有明确运行方法或程序入口", True),
            (_has(content, r"样例输入", r"示例输入") and _has(content, r"样例输出", r"示例输出"), "缺少运行示例的输入或输出", False),
            (_has(content, r"核心逻辑", r"核心函数", r"关键代码"), "缺少核心函数或计算过程解释", False),
            (_has(content, r"常见错误") and _has(content, r"解决"), "缺少常见错误及解决方法", False),
            (_python_syntax_ok(blocks), "Python 代码存在语法错误", True),
        ]

    if resource_type == "mindmap":
        return [
            (_mindmap_depth(content) >= 3, "思维导图不足 3 层或 Mermaid 结构无效", True),
            (all(label in content for label in ("核心概念", "方法步骤", "应用场景", "易错点")), "导图没有区分概念、方法、应用和易错点", True),
            (_has(content, r"如何使用这张图", r"如何使用.*导图"), "缺少导图学习使用说明", False),
            (_has(content, r"闭卷", r"复述任务", r"自检"), "缺少利用导图进行复习的任务", False),
        ]

    if resource_type == "reading":
        items = max(_count(content, r"^#{2,4}\s*(?:阅读|材料|方向|推荐)\s*\d+"), _count(content, r"^\s*\d+[.、]\s+"))
        has_unverified_link = bool(re.search(r"https?://", content, re.I)) and not _has(content, r"来源", r"官方", r"上下文")
        return [
            (items >= 3, "拓展阅读少于 3 条", True),
            (_has(content, r"为什么推荐", r"推荐理由"), "阅读材料没有说明推荐理由", True),
            (_has(content, r"基础") and _has(content, r"进阶", r"拓展"), "阅读材料没有标注难度层次", False),
            (_has(content, r"阅读重点") and _has(content, r"阅读后.*问题", r"读后问题"), "缺少阅读重点或阅读后问题", True),
            (not has_unverified_link, "出现无法核验来源的链接，应改为搜索关键词", True),
        ]

    if resource_type == "media":
        shots = _count(content, r"^\|\s*\d+\s*\|")
        decorative_only = _has(content, r"科技风背景", r"装饰性", r"渐变标题卡") and not _has(content, r"变量关系", r"流程图", r"结构图", r"对比图", r"步骤图")
        return [
            (_has(content, r"```mermaid", r"流程图", r"变量关系图", r"结构图", r"对比图", r"步骤图"), "多模态资源没有教学图或知识可视化", True),
            (shots >= 3 or _count(content, r"^#{2,4}\s*图\s*\d+") >= 2, "分镜或教学图数量不足", False),
            (_has(content, r"对应知识点") and _has(content, r"帮助理解"), "没有说明每张图或分镜帮助理解什么", True),
            (not decorative_only, "主要内容是装饰性画面，缺少教学意义", True),
            (_has(content, r"旁白") and _has(content, r"画面"), "视频脚本缺少旁白或画面内容", False),
        ]

    if resource_type == "ppt":
        pages = _count(content, r"^##\s*第\s*\d+\s*页")
        return [
            (8 <= pages <= 12, f"课件页数为 {pages}，应控制在 8–12 页", True),
            (_count(content, r"讲解重点") >= max(1, pages), "并非每页都有讲解重点", True),
            (_count(content, r"互动问题|小检查") >= max(1, pages), "并非每页都有互动问题或小检查", True),
            (_has(content, r"例题页", r"页.*例题", r"例题") and _has(content, r"详解", r"解题步骤"), "缺少带详解的例题页", True),
            (_has(content, r"总结页", r"页.*总结"), "缺少总结页", True),
            (_count(content, r"配图") >= max(1, pages // 2), "没有充分标明页面配图建议", False),
        ]

    if resource_type == "design":
        labels = ("教学目标", "学情分析", "重点难点", "教学流程", "互动设计", "小测设计", "评价方式", "课后任务", "AI 课堂")
        return [
            (label in content, f"教学设计缺少{label}", label in {"教学目标", "教学流程", "小测设计", "评价方式"})
            for label in labels
        ]

    if resource_type == "project":
        labels = ("项目背景", "实践目标", "输入材料", "任务步骤", "交付成果", "评价标准", "分工建议", "扩展方向", "风险", "解决方案")
        return [
            (label in content, f"实践项目缺少{label}", label in {"任务步骤", "交付成果", "评价标准"})
            for label in labels
        ]

    return [(_has(content, r"例", r"步骤", r"任务", r"练习"), "资源缺少具体学习任务", True)]


def assess_resource(resource: dict, *, duplicate_of: str = "") -> dict[str, Any]:
    resource = with_resource_metadata(resource)
    metadata = dict(resource.get("metadata") or {})
    content = str(resource.get("content") or "").strip()
    resource_type = str(resource.get("type") or "doc")
    knowledge_points = [str(x) for x in metadata.get("knowledge_points") or [] if str(x).strip()]

    base_checks: list[tuple[bool, str, float, bool]] = [
        (bool(knowledge_points), "缺少明确知识点", 0.8, True),
        (bool(metadata.get("learning_purpose")) and bool(metadata.get("used_for")), "缺少学习用途或复用场景", 0.6, True),
        (bool(str(metadata.get("expected_outcome") or "").strip()), "缺少预期学习结果", 0.6, True),
        (80 <= len(str(metadata.get("summary") or "")) <= 120, "资源摘要应为 80–120 字", 0.4, False),
        (bool(metadata.get("learning_before_tip")) and bool(metadata.get("learning_after_check")), "缺少学习前提示或学习后检查", 0.4, False),
        (bool(metadata.get("suitable_scenarios")), "缺少资源适用场景", 0.3, False),
        (
            bool(metadata.get("source_library_id") or metadata.get("generated_context")),
            "资源既未绑定资料库，也未记录生成依据",
            0.4,
            True,
        ),
        (len(content) >= 320 and "##" in content, "正文结构或篇幅不足", 0.3, True),
        (_has(content, r"例", r"题", r"代码", r"步骤", r"任务", r"分镜", r"图"), "只有概念解释，没有例题、代码、练习或任务", 0.3, True),
        (_has(content, r"详解", r"解析", r"说明", r"步骤", r"核心逻辑", r"旁白"), "缺少详细解析或操作说明", 0.3, True),
        (not formula_quality_issues(content), "数学公式存在转义、定界符或渲染风险", 0.4, True),
    ]
    issues: list[str] = []
    hard_failures: list[str] = []
    base_score = 0.0
    for passed, issue, weight, hard in base_checks:
        if passed:
            base_score += weight
        else:
            issues.append(issue)
            if hard:
                hard_failures.append(issue)

    type_checks = _type_checks(resource_type, content)
    passed_type = 0
    for passed, issue, hard in type_checks:
        if passed:
            passed_type += 1
        else:
            issues.append(issue)
            if hard:
                hard_failures.append(issue)

    type_score = 6.0 * passed_type / max(1, len(type_checks))
    score = base_score + type_score
    if duplicate_of:
        issues.append("与已有正式资源高度重复，应改用新的例题、误区或应用角度")
        hard_failures.append(issues[-1])
        score -= 1.5
    if hard_failures:
        score = min(score, 6.5)
    score = round(max(0.0, min(10.0, score)), 1)

    tags: list[str] = []
    if resource_type == "doc" and _has(content, r"典型例题", r"例题\s*\d*"):
        tags.append("有例题")
    if _has(content, r"详解", r"详细解析", r"解题步骤", r"核心逻辑"):
        tags.append("有详解")
    if resource_type == "code" and _code_blocks(content):
        tags.append("有代码")
    if resource_type == "quiz" and _count(content, r"^#{2,4}\s*第\s*\d+\s*题") >= 8:
        tags.append("有小测")
    if metadata.get("learning_purpose") == "exam" or "应试" in content:
        tags.append("应试训练")
    if resource_type in {"code", "project"} or metadata.get("learning_purpose") == "project":
        tags.append("项目实践")

    classroom_missing = list(dict.fromkeys(hard_failures[:5]))
    classroom_ready = score >= QUALITY_THRESHOLD and "classroom" in (metadata.get("used_for") or []) and not classroom_missing
    if classroom_ready:
        tags.append("可进课堂")

    return {
        "score": score,
        "issues": list(dict.fromkeys(issues)),
        "hard_failures": list(dict.fromkeys(hard_failures)),
        "quality_tags": list(dict.fromkeys(tags)),
        "classroom_ready": classroom_ready,
        "classroom_missing": classroom_missing,
        "dimensions": {
            "learning_contract": round(base_score, 1),
            "type_specific": round(type_score, 1),
        },
    }


async def _rewrite_resource(resource: dict, issues: list[str]) -> str | None:
    llm = get_primary_llm()
    if llm.use_mock:
        return None
    resource_type = str(resource.get("type") or "doc")
    metadata = dict(resource.get("metadata") or {})
    issue_lines = "\n".join(f"- {issue}" for issue in issues[:12])
    prompt = (
        f"请重写《{resource.get('title', '')}》这份 {resource_type} 学习资源。\n"
        f"对应知识点：{'、'.join(metadata.get('knowledge_points') or [])}\n"
        f"学习用途：{metadata.get('learning_purpose', '')}\n"
        f"适合难度：{metadata.get('difficulty', '')}\n"
        f"预期学习结果：{metadata.get('expected_outcome', '')}\n\n"
        f"质检未通过项：\n{issue_lines}\n\n"
        "保留正确、有价值的内容，但必须逐项修复上述问题；若提示重复，换用新的例题、情境、误区与任务角度。"
        "直接输出完整干净 Markdown，不要解释你做了什么，不要输出 JSON。\n\n"
        f"原资源：\n{str(resource.get('content') or '')[:14000]}"
    )
    try:
        rewritten = (await llm.chat(
            [
                {"role": "system", "content": resource_generation_system(resource_type, deep=True)},
                {"role": "user", "content": prompt},
            ],
            temperature=0.35,
            deep_thinking=True,
            task="resource",
        )).strip()
        return normalize_latex_markdown(filter_sensitive(rewritten)) if len(rewritten) >= 160 else None
    except Exception as exc:
        logger.warning("resource rewrite failed id=%s: %s", resource.get("id"), exc)
        return None


def _clean_question_rewrite(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:markdown)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    match = re.search(r"^#{2,4}\s*第\s*\d+\s*题[\s\S]*", cleaned, re.M)
    return match.group(0).strip() if match else cleaned


def _merge_invalid_questions(*groups: list[dict]) -> list[dict]:
    merged: dict[int, dict] = {}
    for group in groups:
        for row in group:
            number = int(row.get("number") or 0)
            if not number:
                continue
            if number not in merged:
                merged[number] = dict(row)
                merged[number]["issues"] = list(row.get("issues") or [])
                continue
            merged[number]["issues"] = list(
                dict.fromkeys(
                    [*merged[number].get("issues", []), *list(row.get("issues") or [])]
                )
            )
            for key in ("semantic_verdict", "correct_answer"):
                if row.get(key):
                    merged[number][key] = row[key]
    return [merged[number] for number in sorted(merged)]


def _apply_semantic_failure(assessment: dict[str, Any], semantic_review: dict[str, Any]) -> None:
    if semantic_review.get("passed"):
        return
    invalid_numbers = semantic_review.get("invalid_numbers") or []
    issue = (
        f"题目语义正确性审核未通过：第 {', '.join(str(x) for x in invalid_numbers)} 题"
        if invalid_numbers
        else str(semantic_review.get("error") or "题目语义正确性审核未完成")
    )
    assessment["issues"] = list(dict.fromkeys([*assessment.get("issues", []), issue]))
    assessment["hard_failures"] = list(
        dict.fromkeys([*assessment.get("hard_failures", []), issue])
    )
    assessment["score"] = min(float(assessment.get("score") or 0), 6.5)
    assessment["classroom_ready"] = False
    assessment["classroom_missing"] = list(
        dict.fromkeys([*assessment.get("classroom_missing", []), issue])
    )[:5]


async def _repair_quiz_questions(resource: dict, invalid_questions: list[dict]) -> str | None:
    """Repair only conflicting questions; leave the rest of the quiz untouched."""
    llm = get_primary_llm()
    if llm.use_mock or not invalid_questions:
        return None
    replacements: dict[int, str] = {}
    for row in invalid_questions:
        number = int(row.get("number") or 0)
        level = str(row.get("level") or "基础")
        issues = "；".join(str(x) for x in row.get("issues") or [])
        prompt = (
            "你是题目一致性修复器，只修复下面这一道题，禁止改写整份题集。\n"
            f"保留题号 {number} 和难度层级『{level}』，修复问题：{issues}。\n"
            "只允许单选题或判断题。单选题必须有 A-D、唯一答案、逐项误区诊断和支持答案的详细解析；"
            "判断题答案只能是 T/F。数学题必须重新计算并让最终结果与答案一致。\n"
            "只输出一个完整 Markdown 题目块，不要代码围栏、JSON 或修改说明。\n\n"
            f"原题：\n{row.get('raw', '')}"
        )
        try:
            rewritten = (await llm.chat(
                [{"role": "system", "content": "你负责修复单道学习测验题的一致性。"}, {"role": "user", "content": prompt}],
                temperature=0.2,
                deep_thinking=True,
                task="resource",
            )).strip()
        except Exception as exc:
            logger.warning("quiz question repair failed resource=%s question=%s: %s", resource.get("id"), number, exc)
            continue
        candidate = _clean_question_rewrite(rewritten)
        validation = validate_quiz_content(candidate)
        semantic = await review_quiz_semantics(str(resource.get("title") or ""), candidate)
        if validation["question_count"] == 1 and validation["passed"] and semantic["passed"]:
            replacements[number] = candidate
            continue
        # Repair failed: discard the broken block and generate a fresh same-level replacement.
        knowledge_match = re.search(r"(?:目标)?知识点\s*[：:]\s*([^\n]+)", str(row.get("raw") or ""))
        knowledge_point = knowledge_match.group(1).strip("* ") if knowledge_match else "当前目标知识点"
        replacement_prompt = (
            f"重新生成第 {number} 题（{level}），目标知识点：{knowledge_point}。"
            "只允许单选题或判断题；答案、详细解析和计算过程必须一致。"
            "单选题给出 A-D 四个可信选项及每个错误选项的误区诊断。"
            "只输出一个完整 Markdown 题目块，不要 JSON 或说明。"
        )
        try:
            replacement = (await llm.chat(
                [{"role": "system", "content": "你负责生成可信、可校验的单道学习测验题。"}, {"role": "user", "content": replacement_prompt}],
                temperature=0.25,
                deep_thinking=True,
                task="resource",
            )).strip()
            replacement = _clean_question_rewrite(replacement)
            replacement_validation = validate_quiz_content(replacement)
            replacement_semantic = await review_quiz_semantics(
                str(resource.get("title") or ""), replacement
            )
            if (
                replacement_validation["question_count"] == 1
                and replacement_validation["passed"]
                and replacement_semantic["passed"]
            ):
                replacements[number] = replacement
        except Exception as exc:
            logger.warning("quiz replacement failed resource=%s question=%s: %s", resource.get("id"), number, exc)
    if not replacements:
        return None
    return replace_question_blocks(str(resource.get("content") or ""), replacements)


async def review_resources(
    resources: list[dict],
    *,
    skip_llm: bool = False,
    allow_rewrite: bool = True,
    existing_resources: list[dict] | None = None,
) -> list[dict]:
    reviewed: list[dict] = []
    comparison_pool = list(existing_resources or [])
    for raw in resources:
        resource = with_resource_metadata(raw)
        resource["content"] = normalize_latex_markdown(
            filter_sensitive(str(resource.get("content") or ""))
        )
        duplicate_of = _duplicate_id(resource, comparison_pool)
        assessment = assess_resource(resource, duplicate_of=duplicate_of)
        metadata = dict(resource.get("metadata") or {})
        attempts = int(metadata.get("review_attempts") or 0)
        full_rewrite_attempted = bool(
            metadata.get("full_rewrite_attempted")
            or (attempts > 0 and resource.get("generation_source") == "llm_rewrite")
        )

        semantic_review: dict[str, Any] | None = None
        semantic_failed = False
        if resource.get("type") == "quiz":
            quiz_validation = validate_quiz_content(resource["content"])
            if not skip_llm:
                semantic_review = await review_quiz_semantics(
                    str(resource.get("title") or ""), resource["content"]
                )
            invalid_questions = _merge_invalid_questions(
                quiz_validation["invalid_questions"],
                list((semantic_review or {}).get("invalid_questions") or []),
            )
            if (
                invalid_questions
                and allow_rewrite
                and not skip_llm
                and int((semantic_review or {}).get("reviewed_count") or 0) > 0
            ):
                repaired_quiz = await _repair_quiz_questions(resource, invalid_questions)
                if repaired_quiz:
                    attempts += 1
                    resource["content"] = normalize_latex_markdown(repaired_quiz)
                    resource["generation_source"] = "llm_question_repair"
                    resource = with_resource_metadata(resource)
                    assessment = assess_resource(resource, duplicate_of=duplicate_of)
                    semantic_review = await review_quiz_semantics(
                        str(resource.get("title") or ""), resource["content"]
                    )
            if semantic_review is not None:
                semantic_failed = not bool(semantic_review.get("passed"))
                _apply_semantic_failure(assessment, semantic_review)

        if (
            assessment["score"] < QUALITY_THRESHOLD
            and allow_rewrite
            and not skip_llm
            and not full_rewrite_attempted
            and not semantic_failed
        ):
            rewritten = await _rewrite_resource(resource, assessment["issues"])
            attempts += 1
            full_rewrite_attempted = True
            if rewritten:
                resource["content"] = rewritten
                resource["generation_source"] = "llm_rewrite"
                resource = with_resource_metadata(resource)
                duplicate_of = _duplicate_id(resource, comparison_pool)
                assessment = assess_resource(resource, duplicate_of=duplicate_of)
                if resource.get("type") == "quiz":
                    semantic_review = await review_quiz_semantics(
                        str(resource.get("title") or ""), resource["content"]
                    )
                    semantic_failed = not bool(semantic_review.get("passed"))
                    _apply_semantic_failure(assessment, semantic_review)

        llm_note = None
        if not skip_llm and assessment["score"] >= QUALITY_THRESHOLD:
            llm_note = await _aux_review_snippet(str(resource.get("title") or ""), resource["content"])
        passed = assessment["score"] >= QUALITY_THRESHOLD
        quality_reason = (
            llm_note or "知识点、具体学习任务、详解和复用场景达到发布标准。"
            if passed
            else "；".join(assessment["issues"][:5]) or "学习价值不足，已保留为草稿。"
        )
        metadata = dict(resource.get("metadata") or {})
        metadata.update(
            {
                "quality_score": assessment["score"],
                "quality_reason": quality_reason[:300],
                "quality_issues": assessment["issues"][:12],
                "quality_tags": assessment["quality_tags"],
                "quality_dimensions": assessment["dimensions"],
                "review_attempts": attempts,
                "full_rewrite_attempted": full_rewrite_attempted,
                "classroom_ready": assessment["classroom_ready"],
                "classroom_missing": assessment["classroom_missing"],
                "duplicate_of": duplicate_of,
                "formula_issues": formula_quality_issues(resource["content"]),
                "quiz_invalid_questions": (
                    sorted(
                        set(validate_quiz_content(resource["content"])["invalid_numbers"])
                        | set((semantic_review or {}).get("invalid_numbers") or [])
                    )
                    if resource.get("type") == "quiz"
                    else []
                ),
                "quiz_semantic_verified": bool(
                    resource.get("type") != "quiz"
                    or (semantic_review and semantic_review.get("passed"))
                ),
                "quiz_semantic_review": (
                    {
                        "passed": bool((semantic_review or {}).get("passed")),
                        "reviewed_count": int((semantic_review or {}).get("reviewed_count") or 0),
                        "question_count": int((semantic_review or {}).get("question_count") or 0),
                        "invalid_numbers": list((semantic_review or {}).get("invalid_numbers") or []),
                        "items": list((semantic_review or {}).get("items") or []),
                        "error": str((semantic_review or {}).get("error") or ""),
                    }
                    if resource.get("type") == "quiz" and not skip_llm
                    else {}
                ),
            }
        )
        final = {
            **resource,
            "metadata": metadata,
            "status": "published" if passed else "draft",
            "needs_rewrite": not passed,
        }
        reviewed.append(final)
        comparison_pool.append(final)
    return reviewed
