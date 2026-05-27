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
    "ppt",
    "design",
    "project",
]

EXTENDED_RESOURCE_TYPES: list[ResourceType] = [
    "doc",
    "mindmap",
    "quiz",
    "reading",
    "media",
    "code",
    "ppt",
    "design",
    "project",
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
    generation_mode: str = ""
    library_id: str = ""
    library_name: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    user_id: str = "demo"
    message: str
    stream: bool = True
    chunk_size: int = 8
    deep_thinking: bool = False


class ChatResponse(BaseModel):
    reply: str
    profile: StudentProfile | None = None
    intent: IntentType = "chat"
    resources: list[dict] = Field(default_factory=list)
    path: dict | None = None


class GenerateResourcesRequest(BaseModel):
    user_id: str = "demo"
    topic: str = "机器学习导论"
    resource_types: list[ResourceType] = Field(
        default_factory=lambda: ["doc", "mindmap", "quiz", "reading", "media", "code"]
    )
    library_id: str | None = None
    new_library_name: str | None = None


class ResourceLibrarySummary(BaseModel):
    id: str
    name: str
    description: str = ""
    source_type: Literal["builtin", "upload"] = "upload"
    status: Literal["empty", "processing", "ready", "error"] = "empty"
    file_count: int = 0
    chunk_count: int = 0
    course: str = ""
    created_at: str = ""
    updated_at: str = ""


class CreateLibraryRequest(BaseModel):
    user_id: str = "demo"
    name: str
    description: str = ""


class LibraryFileInfo(BaseModel):
    id: str
    filename: str
    mime_type: str = ""
    size: int = 0
    status: str = "pending"


class LibraryDetail(ResourceLibrarySummary):
    files: list[LibraryFileInfo] = Field(default_factory=list)
    synthesis: dict[str, Any] = Field(default_factory=dict)


class UploadLibraryResponse(BaseModel):
    library_id: str
    ingested_chunks: int = 0
    file_count: int = 0
    errors: list[str] = Field(default_factory=list)
    library: ResourceLibrarySummary | None = None


class TutorRequest(BaseModel):
    user_id: str = "demo"
    question: str
    topic: str = ""
    deep_thinking: bool = False


class EvalSubmitRequest(BaseModel):
    user_id: str = "demo"
    quiz_id: str
    answers: list[int] = Field(default_factory=list)


class EvalSubmitResponse(BaseModel):
    score: int
    total: int
    feedback: str
    weak_topics: list[str] = Field(default_factory=list)


# ── Auth schemas ──────────────────────────────────────────────────────────────

class SendOtpRequest(BaseModel):
    email: str


class VerifyOtpRequest(BaseModel):
    email: str
    code: str


class AuthUser(BaseModel):
    user_id: str
    email: str
    display_name: str
    access_token: str = ""


class DemoTokenRequest(BaseModel):
    display_name: str = "演示学生"


class UserAccount(BaseModel):
    user_id: str
    display_name: str = ""
    email: str = ""
    course_name: str = "机器学习导论"
    major: str = ""
    bio: str = ""
    phone: str = ""
    created_at: datetime | None = None


class UserAccountUpdate(BaseModel):
    display_name: str | None = None
    course_name: str | None = None
    major: str | None = None
    bio: str | None = None
    phone: str | None = None


# ── Eval stats schema ─────────────────────────────────────────────────────────

class RadarData(BaseModel):
    dimensions: list[str]
    before: list[int]
    after: list[int]


class EvalEvent(BaseModel):
    label: str
    color: str
    content: str
    date: str


class EvalStats(BaseModel):
    total_resources: int
    resources_by_type: dict[str, int]
    profile_completeness: int
    study_days: int
    has_path: bool
    radar: RadarData
    recent_events: list[EvalEvent]


class PathStepStatusUpdate(BaseModel):
    status: Literal["pending", "in_progress", "done"]


class ResourceRecommendation(BaseModel):
    id: str
    type: str
    title: str
    topic: str = ""
    score: float = 0.0
    reason: str = ""


class UserPreferences(BaseModel):
    user_id: str
    starred_resource_ids: list[str] = Field(default_factory=list)
    account_patch: dict = Field(default_factory=dict)


class UserPreferencesUpdate(BaseModel):
    starred_resource_ids: list[str] | None = None
    account_patch: dict | None = None


class ChatMessageItem(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    resources: list[dict] = Field(default_factory=list)
    created_at: str = ""


class ChatHistoryAppend(BaseModel):
    user_id: str = "demo"
    role: Literal["user", "assistant"]
    content: str
    resources: list[dict] = Field(default_factory=list)


class TtsSpeakRequest(BaseModel):
    text: str
    voice: Literal["female", "male", "off"] = "female"


class TtsSpeakResponse(BaseModel):
    audio_base64: str = ""
    format: str = "mp3"
    provider: Literal["spark", "mock"] = "mock"
