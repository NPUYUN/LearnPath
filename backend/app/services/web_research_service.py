"""全网资料检索与整理（多步 LLM，无资料库或补充检索时使用）。"""

from __future__ import annotations

import json
import re

from app.core.llm.router import get_primary_llm
from app.core.prompts import WEB_RESEARCH_PLAN_SYSTEM, WEB_RESEARCH_SYNTHESIS_SYSTEM, WEB_SUPPLEMENT_SYSTEM


def _parse_json_block(text: str) -> dict:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return {}
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}


async def plan_web_research(topic: str) -> dict:
    llm = get_primary_llm()
    raw = await llm.chat(
        [
            {"role": "system", "content": WEB_RESEARCH_PLAN_SYSTEM},
            {"role": "user", "content": f"学习主题：{topic}"},
        ],
        temperature=0.35,
    )
    data = _parse_json_block(raw)
    queries = data.get("queries") or [
        f"{topic} 课程讲义",
        f"{topic} 入门教程",
        f"{topic} 常见误区",
    ]
    return {
        "queries": queries[:5],
        "focus_areas": data.get("focus_areas") or [topic],
        "raw_plan": raw,
    }


async def synthesize_web_research(topic: str, plan: dict) -> str:
    llm = get_primary_llm()
    queries = plan.get("queries") or []
    user = (
        f"主题：{topic}\n"
        f"检索查询：{json.dumps(queries, ensure_ascii=False)}\n"
        f"关注方向：{json.dumps(plan.get('focus_areas', []), ensure_ascii=False)}\n"
        "请整理为可用于后续生成学习资源的 Markdown 摘要。"
    )
    return await llm.chat(
        [
            {"role": "system", "content": WEB_RESEARCH_SYNTHESIS_SYSTEM},
            {"role": "user", "content": user},
        ],
        temperature=0.45,
    )


async def full_web_research(topic: str) -> tuple[str, list[str]]:
    """返回 (摘要 Markdown, 检索 query 列表)。"""
    plan = await plan_web_research(topic)
    summary = await synthesize_web_research(topic, plan)
    return summary, list(plan.get("queries") or [])


async def supplement_library_context(topic: str, library_excerpt: str) -> str:
    """资料库模式下少量补充检索（单次 LLM）。"""
    llm = get_primary_llm()
    return await llm.chat(
        [
            {"role": "system", "content": WEB_SUPPLEMENT_SYSTEM},
            {
                "role": "user",
                "content": f"主题：{topic}\n\n已有资料库片段：\n{library_excerpt[:2000]}",
            },
        ],
        temperature=0.4,
    )
