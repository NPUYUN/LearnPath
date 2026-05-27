"""资源质检：规则 + LLM 语义质检。"""

from app.core.guardrails import filter_sensitive, review_consistency
from app.core.llm import get_aux_llm
from app.core.prompts import reviewer_system


async def _aux_review_snippet(title: str, excerpt: str) -> str | None:
    aux = get_aux_llm()
    if aux.use_mock:
        return None
    prompt = [
        {"role": "system", "content": reviewer_system()},
        {
            "role": "user",
            "content": f"标题：{title}\n节选：{excerpt[:400]}",
        },
    ]
    try:
        text = (await aux.chat(prompt, temperature=0.2)).strip()
        return text[:80] if text else None
    except Exception:
        return None


async def review_resources(resources: list[dict]) -> list[dict]:
    reviewed: list[dict] = []
    for r in resources:
        content = r.get("content", "")
        review = review_consistency(content, content[:500])
        if not review["passed"]:
            content += f"\n\n> 质检提示：{review['message']}\n"
        else:
            llm_note = await _aux_review_snippet(r.get("title", ""), content)
            if llm_note:
                content += f"\n\n> 质检（AI）：{llm_note}\n"
            else:
                content += "\n\n> 质检：内容与知识库关联度可接受。\n"
        reviewed.append({**r, "content": filter_sensitive(content)})
    return reviewed
