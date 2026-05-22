from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

ResourceType = Literal[
    "doc",
    "mindmap",
    "quiz",
    "reading",
    "media",
    "code",
]

IntentType = Literal[
    "profile",
    "generate",
    "path",
    "tutor",
    "eval",
    "chat",
]


class StudentProfile(BaseModel):
    user_id: str
    knowledge_level: str = "未评估"
    learning_goal: str = "未设定"
    cognitive_style: str = "未评估"
    error_prone_topics: list[str] = Field(default_factory=list)
    preferred_modality: str = "文档+练习"
    pace_and_time: str = "未设定"
    recent_progress: str = "尚未开始学习"
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PathStep(BaseModel):
    order: int
    title: str
    objective: str
    resource_ids: list[str] = Field(default_factory=list)
    estimated_minutes: int = 30
    status: Literal["pending", "in_progress", "done"] = "pending"


class LearningPath(BaseModel):
    user_id: str
    steps: list[PathStep] = Field(default_factory=list)
    version: int = 1


class LearningResource(BaseModel):
    id: str
    type: ResourceType
    title: str
    content: str
    sources: list[str] = Field(default_factory=list)
    topic: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    user_id: str = "demo"
    message: str
    stream: bool = True


class ChatResponse(BaseModel):
    reply: str
    profile: StudentProfile | None = None
    intent: IntentType = "chat"


class GenerateResourcesRequest(BaseModel):
    user_id: str = "demo"
    topic: str = "机器学习导论"
    resource_types: list[ResourceType] = Field(
        default_factory=lambda: ["doc", "mindmap", "quiz", "reading", "code"]
    )


class TutorRequest(BaseModel):
    user_id: str = "demo"
    question: str
    topic: str = ""


class EvalSubmitRequest(BaseModel):
    user_id: str = "demo"
    quiz_id: str
    answers: dict[str, Any]
