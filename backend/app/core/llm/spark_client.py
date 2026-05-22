"""讯飞星火 OpenAI 兼容客户端；支持 Mock 模式本地无密钥启动。"""

from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from app.core.config import get_settings


class SparkClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def is_mock(self) -> bool:
        return self.settings.llm_mock or not self.settings.spark_api_key

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
    ) -> str:
        if self.is_mock:
            user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
            return self._mock_response(user_msg)

        url = f"{self.settings.spark_base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.settings.spark_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.settings.spark_model,
            "messages": messages,
            "temperature": temperature,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
    ) -> AsyncIterator[str]:
        content = await self.chat(messages)
        # Mock/简化：按词流式切分
        chunk_size = 8
        for i in range(0, len(content), chunk_size):
            yield content[i : i + chunk_size]

    def _mock_response(self, user_msg: str) -> str:
        return (
            f"[Mock 星火] 已收到：{user_msg[:80]}… "
            "学径将基于机器学习导论知识库为你生成个性化学习内容。"
        )


def get_llm_client() -> SparkClient:
    return SparkClient()
