"""OpenAI 兼容 Chat Completions 客户端（星火 / 硅基流动 / DeepSeek 等云端 API）。"""

from __future__ import annotations

import json
from typing import AsyncIterator, Protocol

import httpx

from app.core.config import get_settings
from app.core.llm.mock_client import MockLLMClient, mock_chat_response
from app.core.llm.resilience import chat_with_retry, llm_http_timeout


class LLMClient(Protocol):
    provider: str

    @property
    def is_available(self) -> bool: ...

    @property
    def use_mock(self) -> bool: ...

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        deep_thinking: bool = False,
    ) -> str: ...

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        deep_thinking: bool = False,
    ) -> AsyncIterator[str]: ...


class OpenAICompatClient:
    """通用云端 LLM 调用；无 Key 或 LLM_MOCK 时回退 Mock。"""

    def __init__(
        self,
        *,
        provider: str,
        base_url: str,
        api_key: str,
        model: str,
        mock_quick: bool = False,
    ) -> None:
        self.provider = provider
        self.base_url = base_url.rstrip("/")
        self.api_key = (api_key or "").strip()
        self.model = model
        self.mock_quick = mock_quick
        self._settings = get_settings()

    @property
    def is_available(self) -> bool:
        return bool(self.api_key)

    @property
    def use_mock(self) -> bool:
        return self._settings.llm_mock or not self.is_available

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        deep_thinking: bool = False,
    ) -> str:
        if deep_thinking:
            temperature = min(temperature, 0.45)
        if self.use_mock:
            return mock_chat_response(
                messages, deep=deep_thinking, quick=self.mock_quick
            )

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        return await chat_with_retry(
            self._chat_once,
            messages,
            temperature=temperature,
            deep_thinking=deep_thinking,
        )

    async def _chat_once(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        deep_thinking: bool = False,
    ) -> str:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        timeout = llm_http_timeout()
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        deep_thinking: bool = False,
    ) -> AsyncIterator[str]:
        if deep_thinking:
            temperature = min(temperature, 0.45)
        if self.use_mock:
            mock = MockLLMClient(quick=self.mock_quick)
            async for chunk in mock.stream_chat(
                messages, temperature=temperature, deep_thinking=deep_thinking
            ):
                yield chunk
            return

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        timeout = llm_http_timeout()
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", errors="replace")
                    raise RuntimeError(
                        f"{self.provider} API HTTP {resp.status_code}: {body[:800]}"
                    )
                got_token = False
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        err = chunk.get("error")
                        if err:
                            msg = err.get("message") if isinstance(err, dict) else str(err)
                            raise RuntimeError(f"{self.provider} API: {msg}")
                        delta = chunk["choices"][0].get("delta", {})
                        text = delta.get("content") or ""
                        if text:
                            got_token = True
                            yield text
                    except json.JSONDecodeError:
                        continue
                if not got_token:
                    raise RuntimeError(
                        f"{self.provider} API returned an empty stream; check KIMI_API_KEY / model name"
                    )
