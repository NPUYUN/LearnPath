import logging
import re
import uuid
from typing import Any

from app.agents.state import AgentState
from app.core.guardrails import attach_sources, filter_sensitive, review_consistency
from app.core.llm.router import get_primary_llm
from app.core.prompts import resource_generation_system, resource_generation_user, resource_temperature
from app.rag.retriever import retrieve
from app.services.resource_context_service import _profile_summary
from app.services.resource_metadata_service import PURPOSE_STAGE, TYPE_PURPOSE, with_resource_metadata

logger = logging.getLogger(__name__)

_LATEX_COMMAND_RE = re.compile(
    r"\\(?:frac|dfrac|tfrac|partial|theta|alpha|beta|gamma|delta|sigma|lambda|mu|"
    r"sum|prod|int|lim|sqrt|sin|cos|tan|log|ln|cdot|times|left|right|infty|to)(?![A-Za-z])"
)


def _repair_inline_latex(line: str) -> str:
    if not _LATEX_COMMAND_RE.search(line):
        return line
    line = re.sub(
        r"([A-Za-z][A-Za-z0-9_]*)\s*\$([^$\n]+)\$+",
        lambda match: f"{match.group(1)}({match.group(2).strip()})",
        line,
    )
    protected: list[str] = []

    def protect(match: re.Match[str]) -> str:
        protected.append(match.group(0))
        return f"\x00MATH{len(protected) - 1}\x00"

    out = re.sub(r"\$\$[^$\n]+\$\$|\$[^$\n]+\$", protect, line)
    segment_re = re.compile(
        r"(\\(?:frac|dfrac|tfrac|partial|theta|alpha|beta|gamma|delta|sigma|lambda|mu|"
        r"sum|prod|int|lim|sqrt|sin|cos|tan|log|ln|nabla|cdot|times|left|right|infty|to)(?![A-Za-z])"
        r"[^\u4e00-\u9fff，。；\n\x00]{0,240})"
    )

    def wrap(match: re.Match[str]) -> str:
        expression = match.group(1).strip().replace("$$", "").replace("$", "")
        return f"${expression}$" if expression else match.group(0)

    out = segment_re.sub(wrap, out)
    return re.sub(
        r"\x00MATH(\d+)\x00",
        lambda match: protected[int(match.group(1))],
        out,
    )


def _repair_malformed_latex_lines(content: str) -> str:
    """Repair standalone formula lines whose math delimiters cover only a fragment."""
    repaired: list[str] = []
    for line in content.splitlines():
        stripped = line.strip()
        markdown_formula = re.match(
            r"^(\s*(?:[-*+]\s+)?(?:\*\*[A-Za-z0-9]+[.)]?\*\*\s*)?)(.*)$",
            line,
        )
        if markdown_formula:
            prefix, body = markdown_formula.groups()
            expression = body.replace("$$", "").replace("$", "").strip()
            if (
                re.match(r"^\\[A-Za-z]+", expression)
                and not re.search(r"[\u4e00-\u9fff]", expression)
                and _LATEX_COMMAND_RE.search(expression)
                and re.search(r"(?::=|(?<![<>])=|\\frac|\\partial|\\sum|\\int|\\lim)", expression)
            ):
                repaired.append(f"{prefix}${expression}$")
                continue
        if (
            not stripped
            or len(stripped) > 500
            or stripped.startswith(("```", "#", ">", "- ", "* "))
            or re.search(r"[\u4e00-\u9fff]", stripped)
            or not _LATEX_COMMAND_RE.search(stripped)
        ):
            repaired.append(_repair_inline_latex(line))
            continue

        if (
            (stripped.startswith("$$") and stripped.endswith("$$"))
            or (stripped.startswith("$") and stripped.endswith("$") and not stripped.startswith("$$"))
        ):
            repaired.append(_repair_inline_latex(line))
            continue

        command_count = len(_LATEX_COMMAND_RE.findall(stripped))
        formula_signal = bool(re.search(r"(?::=|(?<![<>])=|\\frac|\\partial|\\sum|\\int|\\lim)", stripped))
        if command_count < 2 and not formula_signal:
            repaired.append(_repair_inline_latex(line))
            continue

        expression = re.sub(
            r"([A-Za-z][A-Za-z0-9_]*)\s*\$([^$\n]+)\$",
            lambda match: f"{match.group(1)}({match.group(2).strip()})",
            stripped,
        )
        expression = expression.replace("$$", "").replace("$", "").strip()
        repaired.append(f"$${expression}$$")

    return "\n".join(repaired)

_PROMPT_ECHO_MARKERS = (
    "学习主题：",
    "资源标题：",
    "生成模式：",
    "学生画像摘要：",
    "【资料库上下文】",
    "【全网整理摘要】",
    "请生成 type=",
    "路径阶段目标：",
    "学习者综合分析（仅供生成参考）",
    "检索查询：",
    "请整理为可用于后续生成学习资源的 Markdown 摘要",
)

_RETRY_SYSTEM_APPEND = (
    "\n\n【重试要求】上次输出误复述了生成指令。本次只输出最终学习资源正文，"
    "禁止出现任何字段标签、生成说明或上下文标题。"
)


def resolve_resource_title(state: AgentState, resource_type: str, default: str) -> str:
    titles = state.get("resource_titles") or {}
    custom = titles.get(resource_type)
    if custom and str(custom).strip():
        return str(custom).strip()[:80]
    return default


def _looks_like_resource_prompt_echo(text: str) -> bool:
    normalized = (text or "").strip()
    if len(normalized) < 40:
        return False
    hits = sum(1 for marker in _PROMPT_ECHO_MARKERS if marker in normalized)
    if hits >= 2:
        return True
    if normalized.startswith("学习主题：") and "资源标题：" in normalized:
        return True
    if normalized.startswith("主题：") and "检索查询" in normalized:
        return True
    if re.search(r"请生成\s*type\s*=", normalized, re.I):
        return True
    return False


def _condense_context_for_fallback(topic: str, context: str) -> str:
    """模板回退时避免把生成指令或空上下文直接展示给学生。"""
    raw = (context or "").strip()
    if not raw or _looks_like_resource_prompt_echo(raw):
        return (
            f"围绕「{topic}」组织内容：给出定义与学习目标，"
            "分节讲解核心概念，补充典型例题、常见误区与短练习。"
        )
    lines: list[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if any(stripped.startswith(marker) for marker in _PROMPT_ECHO_MARKERS):
            continue
        if stripped.startswith("请") and any(k in stripped for k in ("生成", "整理", "输出")):
            continue
        lines.append(line)
    cleaned = "\n".join(lines).strip()
    return cleaned[:1800] if cleaned else (
        f"围绕「{topic}」展开讲解、例题与练习。"
    )


def _retry_user_message(
    *,
    topic: str,
    resource_type: str,
    title: str,
    library_context: str,
    web_context: str,
) -> str:
    refs: list[str] = []
    lib = (library_context or "").strip()
    web = (web_context or "").strip()
    if lib and not _looks_like_resource_prompt_echo(lib):
        refs.append(f"资料库摘录：\n{lib[:2200]}")
    if web and not _looks_like_resource_prompt_echo(web):
        refs.append(f"补充参考：\n{web[:1600]}")
    ref_block = "\n\n".join(refs) if refs else f"参考资料较少，请围绕「{topic}」撰写通用高校自学内容。"
    return (
        f"为学习主题「{topic}」撰写《{title}》（类型 {resource_type}）。\n"
        f"{ref_block}\n\n"
        "直接输出完整正文，不要复述本说明或任何字段标签。"
    )


async def _generate_with_llm(
    state: AgentState,
    *,
    resource_type: str,
    title: str,
    gen_ctx: dict[str, Any],
) -> tuple[str, str, str]:
    """返回 (正文, generation_source, warning)。"""
    topic = state.get("topic") or "机器学习导论"
    profile = state.get("profile") or {}
    deep = bool(state.get("deep_thinking"))
    llm = get_primary_llm()
    if llm.use_mock:
        return "", "mock", ""

    library_context = str(gen_ctx.get("library_context") or "")
    web_context = str(gen_ctx.get("web_context") or "")
    purpose = str(gen_ctx.get("learning_purpose") or TYPE_PURPOSE.get(resource_type, "explain"))
    target_points = list(gen_ctx.get("target_knowledge_points") or [state.get("stage_title") or topic])
    expected_outcome = str(gen_ctx.get("expected_outcome") or "").strip()
    if not expected_outcome:
        expected_outcome = f"能够解释{'、'.join(str(x) for x in target_points[:2])}并完成一个对应任务。"
    realtime = gen_ctx.get("realtime_state") if isinstance(gen_ctx.get("realtime_state"), dict) else {}
    realtime_summary = "；".join(
        part
        for part in (
            f"困惑度={realtime.get('confusion_level')}" if realtime.get("confusion_level") is not None else "",
            f"认知负荷={realtime.get('cognitive_load')}" if realtime.get("cognitive_load") else "",
            f"当前卡点={'、'.join(str(x) for x in realtime.get('stuck_topics') or [])}" if realtime.get("stuck_topics") else "",
        )
        if part
    )

    messages = [
        {"role": "system", "content": resource_generation_system(resource_type, deep)},
        {
            "role": "user",
            "content": resource_generation_user(
                topic=topic,
                resource_type=resource_type,
                title=title,
                library_context=library_context,
                web_context=web_context,
                profile_summary=_profile_summary(profile),
                realtime_summary=realtime_summary,
                generation_mode=gen_ctx.get("mode", "web"),
                stage_objective=str(gen_ctx.get("stage_objective") or ""),
                learner_analysis_brief=str(gen_ctx.get("learner_analysis_brief") or ""),
                variant_index=int(state.get("resource_variant_index") or 1),
                variant_total=int(state.get("resource_variant_total") or 1),
                requirements=str(gen_ctx.get("requirements") or ""),
                learning_purpose=purpose,
                target_knowledge_points=[str(x) for x in target_points if str(x).strip()],
                recommended_stage=PURPOSE_STAGE.get(purpose, "课堂讲解"),
                expected_outcome=expected_outcome,
                existing_resource_summaries=[
                    row
                    for row in list(gen_ctx.get("resource_manifest") or [])
                    if isinstance(row, dict) and row.get("status") != "draft"
                ],
            ),
        },
    ]

    content = (await llm.chat(
        messages,
        temperature=resource_temperature(deep),
        deep_thinking=deep,
        task="resource",
    )).strip()

    if _looks_like_resource_prompt_echo(content):
        logger.warning(
            "resource generation prompt echo detected user=%s type=%s topic=%s",
            state.get("user_id"),
            resource_type,
            topic,
        )
        retry_messages = [
            {
                "role": "system",
                "content": resource_generation_system(resource_type, deep) + _RETRY_SYSTEM_APPEND,
            },
            {
                "role": "user",
                "content": _retry_user_message(
                    topic=topic,
                    resource_type=resource_type,
                    title=title,
                    library_context=library_context,
                    web_context=web_context,
                ),
            },
        ]
        retry_content = (await llm.chat(
            retry_messages,
            temperature=max(0.25, resource_temperature(deep) - 0.1),
            deep_thinking=deep,
            task="resource",
        )).strip()
        if retry_content and not _looks_like_resource_prompt_echo(retry_content) and len(retry_content) >= 80:
            return retry_content, "llm", ""

        return "", "llm", "模型复述了生成指令，已改用模板回退"

    return content, "llm", ""


def _template_fallback(topic: str, context: str, content_template: str) -> str:
    safe_context = _condense_context_for_fallback(topic, context)
    return content_template.replace("{topic}", topic).replace("{context}", safe_context)


async def _build_resource(
    state: AgentState,
    *,
    resource_type: str,
    title: str,
    content_template: str,
) -> dict[str, Any]:
    topic = state.get("topic") or "机器学习导论"
    stage_title = str(state.get("stage_title") or topic)
    gen_ctx = state.get("generation_context") or {}
    resolved_title = resolve_resource_title(state, resource_type, title)
    variant = int(state.get("resource_variant_index") or 1)
    variant_total = int(state.get("resource_variant_total") or 1)
    if variant_total > 1:
        resolved_title = f"{resolved_title} · 第{variant}份"

    library_context = gen_ctx.get("library_context", "")
    web_context = gen_ctx.get("web_context", "")
    combined_context = "\n".join(filter(None, [library_context, web_context]))

    if not combined_context:
        chunks = await retrieve(topic, k=3)
        combined_context = "\n".join(c["text"] for c in chunks)
        source_labels = [c.get("metadata", {}).get("title", "chunk") for c in chunks]
    else:
        source_labels = list(gen_ctx.get("sources") or [])
        if gen_ctx.get("library_name"):
            source_labels.insert(0, gen_ctx["library_name"])

    body = ""
    generation_source = "template"
    generation_warning = ""

    try:
        body, src, warn = await _generate_with_llm(
            state,
            resource_type=resource_type,
            title=resolved_title,
            gen_ctx=gen_ctx,
        )
        if warn:
            generation_warning = warn
        if src == "llm" and len(body) >= 80 and not _looks_like_resource_prompt_echo(body):
            generation_source = "llm"
        elif src == "mock":
            generation_source = "mock"
            generation_warning = generation_warning or "LLM 处于 Mock 模式，已使用模板回退"
            logger.warning(
                "resource generation mock fallback user=%s type=%s stage=%s",
                state.get("user_id"),
                resource_type,
                stage_title,
            )
        elif src == "llm":
            if not generation_warning:
                generation_warning = "LLM 返回内容过短或异常，已使用模板回退"
            logger.warning(
                "resource generation unusable output user=%s type=%s stage=%s len=%s",
                state.get("user_id"),
                resource_type,
                stage_title,
                len(body),
            )
    except Exception as exc:
        generation_warning = f"LLM 生成失败（{exc}），已使用模板回退"
        logger.exception(
            "resource generation failed user=%s type=%s stage=%s",
            state.get("user_id"),
            resource_type,
            stage_title,
        )

    if len(body) < 80 or _looks_like_resource_prompt_echo(body):
        body = _template_fallback(topic, combined_context, content_template)
        if generation_source != "mock":
            generation_source = "template"

    body = _repair_malformed_latex_lines(body)
    content = filter_sensitive(body)

    pseudo_chunks = [
        {"text": combined_context[:800], "metadata": {"title": label, "chapter": label}}
        for label in (source_labels[:5] if source_labels else [topic])
    ]
    content = attach_sources(content, pseudo_chunks if combined_context else [])

    review = review_consistency(content, combined_context)
    if not review["passed"]:
        content += f"\n\n> 质检提示：{review['message']}\n"

    mode_note = gen_ctx.get("mode", "")
    if mode_note:
        content += f"\n\n> 生成依据：{mode_note}"
        if gen_ctx.get("library_name"):
            content += f" · 资料库「{gen_ctx['library_name']}」"

    if generation_warning:
        content += f"\n\n> ⚠ 生成说明：{generation_warning}"

    resource = {
        "id": str(uuid.uuid4()).replace("-", "")[:12],
        "type": resource_type,
        "title": resolved_title,
        "content": content,
        "sources": source_labels[:8],
        "topic": topic,
        "library_id": gen_ctx.get("library_id", ""),
        "library_name": gen_ctx.get("library_name", ""),
        "generation_mode": gen_ctx.get("mode", ""),
        "generation_source": generation_source,
        "generation_warning": generation_warning,
    }
    return with_resource_metadata(
        resource,
        generation_context=gen_ctx,
        state=dict(state),
    )
