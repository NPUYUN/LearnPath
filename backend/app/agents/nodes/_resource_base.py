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
    # 使用 replace 而非 format，避免 quiz JSON、Mermaid 等模板中的花括号触发 KeyError
    body = (
        content_template.replace("{topic}", topic).replace("{context}", context[:500])
    )
    content = filter_sensitive(
        "【学术讲义风格】条理清晰、术语准确、适合高校自学阅读。\n\n" + body
    )
    content = attach_sources(content, chunks)
    review = review_consistency(content, context)
    if not review["passed"]:
        content += f"\n\n> 质检提示：{review['message']}\n"

    return {
        "id": str(uuid.uuid4()).replace("-", "")[:12],
        "type": resource_type,
        "title": title,
        "content": content,
        "sources": [c.get("metadata", {}).get("title", "chunk") for c in chunks],
        "topic": topic,
    }
