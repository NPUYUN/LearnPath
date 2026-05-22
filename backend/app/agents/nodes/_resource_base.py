import uuid
from typing import Any

from app.agents.state import AgentState
from app.core.guardrails import attach_sources, filter_sensitive, review_consistency
from app.rag.retriever import retrieve


async def _build_resource(
    state: AgentState,
    *,
    resource_type: str,
    title: str,
    content_template: str,
) -> dict[str, Any]:
    topic = state.get("topic") or "机器学习导论"
    chunks = await retrieve(topic, k=3)
    context = "\n".join(c["text"] for c in chunks)
    content = filter_sensitive(content_template.format(topic=topic, context=context[:500]))
    content = attach_sources(content, chunks)
    review = review_consistency(content, context)
    if not review["passed"]:
        content += f"\n\n> 质检提示：{review['message']}\n"

    return {
        "id": str(uuid.uuid4())[:8],
        "type": resource_type,
        "title": title,
        "content": content,
        "sources": [c.get("metadata", {}).get("title", "chunk") for c in chunks],
        "topic": topic,
    }
