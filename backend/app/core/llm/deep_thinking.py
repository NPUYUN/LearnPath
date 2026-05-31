"""深度思考 vs 快速回答：统一的 LLM 参数（max_tokens / temperature / 超时）。"""

from __future__ import annotations

from typing import Literal

TaskKind = Literal["chat", "tutor", "profile", "resource", "path", "eval", "aux"]

_MAX_TOKENS: dict[TaskKind, dict[str, int]] = {
    "chat": {"fast": 768, "deep": 3200},
    "tutor": {"fast": 768, "deep": 3200},
    "profile": {"fast": 512, "deep": 1400},
    "resource": {"fast": 1100, "deep": 3600},
    "path": {"fast": 720, "deep": 2000},
    "eval": {"fast": 560, "deep": 1600},
    "aux": {"fast": 384, "deep": 768},
}


def completion_max_tokens(*, deep_thinking: bool, task: TaskKind = "chat") -> int:
    mode = "deep" if deep_thinking else "fast"
    return _MAX_TOKENS.get(task, _MAX_TOKENS["chat"])[mode]


def completion_read_timeout(*, deep_thinking: bool) -> float:
    return 150.0 if deep_thinking else 72.0


def apply_temperature(base: float, *, deep_thinking: bool) -> float:
    """深度模式更低温度、更长输出；快速模式略高温度 + max_tokens 限制篇幅。"""
    if deep_thinking:
        return min(base, 0.32)
    return max(min(base, 0.72), 0.58)


def graph_stream_chunk_size(*, deep_thinking: bool, chunk_size: int) -> int:
    """非 chat 意图（整段回复再打字机）时的逐字步长。"""
    if deep_thinking:
        return 1
    return max(4, min(chunk_size, 8))
