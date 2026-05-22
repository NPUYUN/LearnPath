"""
LearnPath 后端启动入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from backend.core.config import settings
from backend.core.database import init_db
from backend.api import chat, profile, resources, learning_path, evaluation


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动/关闭生命周期"""
    # 初始化数据库
    await init_db()
    yield
    # 清理资源（如需要）


app = FastAPI(
    title="LearnPath API",
    description="基于大模型的个性化资源生成与学习多智能体系统",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(chat.router, prefix="/api", tags=["对话"])
app.include_router(profile.router, prefix="/api", tags=["学生画像"])
app.include_router(resources.router, prefix="/api", tags=["资源生成"])
app.include_router(learning_path.router, prefix="/api", tags=["学习路径"])
app.include_router(evaluation.router, prefix="/api", tags=["学习评估"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
