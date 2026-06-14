import logging
import uuid
from typing import Any

from app.agents.state import AgentState
from app.core.guardrails import attach_sources, filter_sensitive, review_consistency
from app.core.llm.router import get_primary_llm
from app.core.prompts import resource_generation_system, resource_generation_user, resource_temperature
from app.rag.retriever import retrieve
from app.services.resource_context_service import _profile_summary

logger = logging.getLogger(__name__)


def resolve_resource_title(state: AgentState, resource_type: str, default: str) -> str:
    titles = state.get("resource_titles") or {}
    custom = titles.get(resource_type)
    if custom and str(custom).strip():
        return str(custom).strip()[:80]
    return default


async def _generate_with_llm(
    state: AgentState,
    *,
    resource_type: str,
    title: str,
    gen_ctx: dict[str, Any],
) -> tuple[str, str]:
    """返回 (正文, generation_source)；source 为 llm | mock。"""
    topic = state.get("topic") or "机器学习导论"
    profile = state.get("profile") or {}
    deep = bool(state.get("deep_thinking"))
    llm = get_primary_llm()
    if llm.use_mock:
        return "", "mock"

    content = await llm.chat(
        [
            {"role": "system", "content": resource_generation_system(resource_type, deep)},
            {
                "role": "user",
                "content": resource_generation_user(
                    topic=topic,
                    resource_type=resource_type,
                    title=title,
                    library_context=gen_ctx.get("library_context", ""),
                    web_context=gen_ctx.get("web_context", ""),
                    profile_summary=_profile_summary(profile),
                    generation_mode=gen_ctx.get("mode", "web"),
                    stage_objective=str(gen_ctx.get("stage_objective") or ""),
                    learner_analysis_brief=str(gen_ctx.get("learner_analysis_brief") or ""),
                ),
            },
        ],
        temperature=resource_temperature(deep),
        deep_thinking=deep,
        task="resource",
    )
    return content.strip(), "llm"


def _template_fallback(topic: str, context: str, content_template: str) -> str:
    return content_template.replace("{topic}", topic).replace("{context}", context[:500])


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
        body, src = await _generate_with_llm(
            state,
            resource_type=resource_type,
            title=resolved_title,
            gen_ctx=gen_ctx,
        )
        if src == "llm" and len(body) >= 80:
            generation_source = "llm"
        elif src == "mock":
            generation_source = "mock"
            generation_warning = "LLM 处于 Mock 模式，已使用模板回退"
            logger.warning(
                "resource generation mock fallback user=%s type=%s stage=%s",
                state.get("user_id"),
                resource_type,
                stage_title,
            )
        else:
            generation_warning = "LLM 返回内容过短，已使用模板回退"
            logger.warning(
                "resource generation short output user=%s type=%s stage=%s len=%s",
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

    if len(body) < 80:
        body = _template_fallback(topic, combined_context, content_template)
        if generation_source != "mock":
            generation_source = "template"

    content = filter_sensitive(
        "【学术讲义风格】条理清晰、术语准确、适合高校自学阅读。\n\n" + body
    )

    pseudo_chunks = [{"text": combined_context[:800], "metadata": {"title": source_labels[0] if source_labels else topic}}]
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

    return {
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
