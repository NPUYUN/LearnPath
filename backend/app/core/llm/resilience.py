"""LLM 调用重试与多通道回退。"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

import httpx

_TRANSIENT_STATUS = {408, 429, 500, 502, 503, 504}


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _TRANSIENT_STATUS
    msg = str(exc).lower()
    return any(
        k in msg
        for k in (
            "timeout",
            "timed out",
            "connection",
            "429",
            "502",
            "503",
            "504",
            "rate limit",
            "empty stream",
            "overloaded",
        )
    )


def llm_http_timeout() -> httpx.Timeout:
    return httpx.Timeout(connect=20.0, read=90.0, write=30.0, pool=10.0)


async def chat_with_retry(
    chat_once,
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    deep_thinking: bool = False,
    max_attempts: int = 3,
) -> str:
    last: BaseException | None = None
    for attempt in range(max_attempts):
        try:
            return await chat_once(
                messages,
                temperature=temperature,
                deep_thinking=deep_thinking,
            )
        except Exception as exc:
            last = exc
            if attempt + 1 >= max_attempts or not _is_transient(exc):
                raise
            await asyncio.sleep(min(2**attempt, 8))
    raise last or RuntimeError("LLM chat failed")


async def stream_chat_with_retry(
    client,
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    deep_thinking: bool = False,
    max_attempts: int = 3,
) -> AsyncIterator[str]:
    """流式优先；空流或瞬态错误时重试，末次失败则回退为非流式 chat。"""
    last: BaseException | None = None
    for attempt in range(max_attempts):
        acc = ""
        try:
            async for token in client.stream_chat(
                messages,
                temperature=temperature,
                deep_thinking=deep_thinking,
            ):
                acc += token
                yield token
            if acc.strip():
                return
            last = RuntimeError(f"{client.provider} returned empty stream")
        except Exception as exc:
            last = exc
            if attempt + 1 < max_attempts and _is_transient(exc):
                await asyncio.sleep(min(2**attempt, 8))
                continue
            break

    chat_once = getattr(client, "_chat_once", None)
    if not chat_once:
        raise last or RuntimeError(f"{client.provider} unavailable")
    try:
        text = await chat_with_retry(
            chat_once,
            messages,
            temperature=temperature,
            deep_thinking=deep_thinking,
            max_attempts=2,
        )
        if text.strip():
            yield text
            return
    except Exception as exc:
        last = exc

    raise last or RuntimeError(f"{client.provider} unavailable")


async def stream_with_client_fallback(
    clients: list,
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    deep_thinking: bool = False,
) -> AsyncIterator[str]:
    errors: list[str] = []
    for client in clients:
        try:
            async for token in stream_chat_with_retry(
                client,
                messages,
                temperature=temperature,
                deep_thinking=deep_thinking,
            ):
                yield token
            return
        except Exception as exc:
            errors.append(f"{client.provider}: {exc}")
            continue
    detail = "；".join(errors[-3:]) if errors else "无可用 LLM"
    raise RuntimeError(f"所有 LLM 通道均失败（{detail}）")
