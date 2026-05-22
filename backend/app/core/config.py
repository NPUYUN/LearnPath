from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录 A3/
ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_mock: bool = True
    spark_api_key: str = ""
    spark_base_url: str = "https://spark-api-open.xf-yun.com/v1"
    spark_model: str = "generalv3.5"

    database_url: str = f"sqlite:///{(ROOT_DIR / 'storage' / 'learnpath.db').as_posix()}"
    chroma_persist_dir: str = str(ROOT_DIR / "storage" / "chroma")
    knowledge_base_dir: str = str(ROOT_DIR / "data" / "knowledge_base" / "ml_intro")

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
