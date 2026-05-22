from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import chat, health, path, profile, resources, tutor, auth, eval as eval_route
from app.core.config import ROOT_DIR, get_settings
from app.db.session import init_db

load_dotenv(ROOT_DIR / ".env")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="学径 LearnPath API",
    description="基于大模型的个性化资源生成与学习多智能体系统",
    version="0.1.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(resources.router, prefix="/api")
app.include_router(path.router, prefix="/api")
app.include_router(tutor.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(eval_route.router, prefix="/api")
