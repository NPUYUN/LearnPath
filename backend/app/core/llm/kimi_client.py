"""Kimi（Moonshot）OpenAI 兼容 API 客户端。"""

from functools import lru_cache

from app.core.config import get_settings
from app.core.llm.openai_compat import OpenAICompatClient


class KimiLLMClient(OpenAICompatClient):
    def __init__(self) -> None:
        s = get_settings()
        super().__init__(
            provider="kimi",
            base_url=s.kimi_base_url,
            api_key=s.kimi_api_key,
            model=s.kimi_model,
            mock_quick=False,
        )


@lru_cache
def get_kimi_client() -> KimiLLMClient:
    return KimiLLMClient()
