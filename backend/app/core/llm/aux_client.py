"""辅助云端 LLM（推荐文案、质检等次要任务；默认硅基流动等 OpenAI 兼容服务）。"""

from functools import lru_cache

from app.core.config import get_settings
from app.core.llm.openai_compat import OpenAICompatClient


class AuxLLMClient(OpenAICompatClient):
    def __init__(self) -> None:
        s = get_settings()
        super().__init__(
            provider="aux",
            base_url=s.aux_llm_base_url,
            api_key=s.aux_llm_api_key,
            model=s.aux_llm_model,
            mock_quick=True,
        )


@lru_cache
def get_aux_client() -> AuxLLMClient:
    return AuxLLMClient()
