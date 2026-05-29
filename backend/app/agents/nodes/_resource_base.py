import uuid
from typing import Any

from app.agents.state import AgentState
from app.core.guardrails import attach_sources, filter_sensitive, review_consistency
from app.core.llm.router import get_primary_llm
from app.core.prompts import resource_generation_system, resource_generation_user
from app.rag.retriever import retrieve
from app.services.resource_context_service import _profile_summary


async def _generate_with_llm(
    state: AgentState,
    *,
    resource_type: str,
    title: str,
    gen_ctx: dict[str, Any],
) -> str:
    topic = state.get("topic") or "机器学习导论"
    profile = state.get("profile") or {}
    llm = get_primary_llm()
    content = await llm.chat(
        [
            {"role": "system", "content": resource_generation_system(resource_type)},
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
                ),
            },
        ],
        temperature=0.45,
        deep_thinking=bool(state.get("deep_thinking")),
    )
    return content.strip()


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
    gen_ctx = state.get("generation_context") or {}

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
    try:
        body = await _generate_with_llm(
            state,
            resource_type=resource_type,
            title=title,
            gen_ctx=gen_ctx,
        )
    except Exception:
        body = ""

    if len(body) < 80:
        body = _template_fallback(topic, combined_context, content_template)

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

    return {
        "id": str(uuid.uuid4()).replace("-", "")[:12],
        "type": resource_type,
        "title": title,
        "content": content,
        "sources": source_labels[:8],
        "topic": topic,
        "library_id": gen_ctx.get("library_id", ""),
        "library_name": gen_ctx.get("library_name", ""),
        "generation_mode": gen_ctx.get("mode", ""),
    }
