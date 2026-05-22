"""
系统配置 — 从 .env 文件或环境变量读取所有配置项
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # ===== 讯飞星火 API =====
    SPARK_APP_ID: str = ""
    SPARK_API_KEY: str = ""
    SPARK_API_SECRET: str = ""
    # 可选: lite / generalv3 / generalv3.5 / 4.0Ultra
    SPARK_DOMAIN: str = "4.0Ultra"

    # ===== 数据库 =====
    DATABASE_URL: str = "sqlite:///./learnpath.db"

    # ===== 向量数据库 =====
    CHROMA_PERSIST_DIR: str = "./chroma_db"
    CHROMA_COLLECTION_NAME: str = "learnpath_knowledge"

    # ===== 知识库 =====
    KNOWLEDGE_BASE_DIR: str = "./knowledge_base"

    # ===== API 安全 =====
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7天

    # ===== CORS =====
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ===== 资源生成 =====
    # 最大并行智能体数
    MAX_PARALLEL_AGENTS: int = 5
    # RAG 检索 top-k
    RAG_TOP_K: int = 5
    # 单次生成最大 token
    MAX_GENERATION_TOKENS: int = 4096

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
