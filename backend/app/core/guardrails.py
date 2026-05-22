"""防幻觉与内容安全过滤（框架阶段为规则实现，可升级为 LLM Reviewer）。"""

import re
from typing import Any

SENSITIVE_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"违禁",
        r"暴力教程",
    ]
]


def filter_sensitive(text: str) -> str:
    result = text
    for pattern in SENSITIVE_PATTERNS:
        result = pattern.sub("[已过滤]", result)
    return result


def attach_sources(content: str, chunks: list[dict[str, Any]]) -> str:
    if not chunks:
        return content + "\n\n> 注：本节内容未绑定知识库引用，请人工核对。\n"
    refs = "\n".join(
        f"- [{c.get('metadata', {}).get('title', c.get('id', 'chunk'))}] "
        f"({c.get('metadata', {}).get('chapter', 'unknown')})"
        for c in chunks[:5]
    )
    return f"{content}\n\n---\n**知识库引用**\n{refs}\n"


def review_consistency(generated: str, context: str, threshold: float = 0.05) -> dict[str, Any]:
    """简单词重叠检查；低于阈值标记需人工确认。"""
    gen_words = set(re.findall(r"[\u4e00-\u9fff\w]{2,}", generated.lower()))
    ctx_words = set(re.findall(r"[\u4e00-\u9fff\w]{2,}", context.lower()))
    if not gen_words:
        return {"passed": False, "score": 0.0, "message": "生成内容为空"}
    overlap = len(gen_words & ctx_words) / max(len(gen_words), 1)
    passed = overlap >= threshold or len(context) < 50
    return {
        "passed": passed,
        "score": round(overlap, 3),
        "message": "通过" if passed else "与知识库重叠较低，建议人工确认",
    }
