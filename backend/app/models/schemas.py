from datetime import UTC, datetime
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
    "review_card",
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
    "review_card",
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


class RealtimeLearningState(BaseModel):
    """短期学习状态：描述学生当下情绪、投入度、卡点与好奇点。"""

    user_id: str
    emotion: Literal["neutral", "confused", "frustrated", "excited", "tired", "anxious"] = "neutral"
    implicit_emotion: str = "平稳专注"
    engagement: Literal["low", "medium", "high"] = "medium"
    confusion_level: float = 0.0
    curiosity_level: float = 0.0
    cognitive_load_level: float = 0.5
    frustration_level: float = 0.0
    confidence_level: float = 0.6
    initiative_level: float = 0.5
    curiosity_topics: list[str] = Field(default_factory=list)
    stuck_topics: list[str] = Field(default_factory=list)
    language_style: str = "自然口语"
    preferred_reply_style: str = "结构化说明，配合例子"
    cognitive_load: Literal["low", "medium", "high"] = "medium"
    next_best_action: str = "正常回答并给出下一步建议"
    confidence: float = 0.6
    evidence: list[str] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PersonalizationStrategy(BaseModel):
    """内部个性化教学策略：由长期画像与实时画像生成，只喂给 AI，不直接展示给学生。"""

    teaching_mode: Literal["routine", "unblock", "simplify", "explore", "challenge", "focus", "stabilize"] = "routine"
    tone: str = "温和、清晰、鼓励"
    difficulty: Literal["lower", "maintain", "raise"] = "maintain"
    pacing: Literal["slow", "normal", "fast"] = "normal"
    explanation_depth: Literal["brief", "standard", "deep"] = "standard"
    response_plan: list[str] = Field(default_factory=list)
    must_do: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)
    preferred_resource_types: list[ResourceType] = Field(default_factory=list)
    avoid_resource_types: list[ResourceType] = Field(default_factory=list)
    assessment_style: str = "结尾给一个小检查问题，确认是否理解"
    focus_topics: list[str] = Field(default_factory=list)


class ProfileRefreshResponse(BaseModel):
    profile: StudentProfile
    message: str = ""
    sources: dict = Field(default_factory=dict)


class LearnerLongTermInsights(BaseModel):
    knowledge_assessment: str = ""
    goal_clarity: str = ""
    cognitive_style_notes: str = ""
    error_prone_analysis: str = ""
    progress_narrative: str = ""


class LearnerRealtimeInsights(BaseModel):
    emotional_state: str = ""
    engagement_notes: str = ""
    confusion_and_stuck: str = ""
    curiosity_notes: str = ""
    cognitive_load_notes: str = ""
    confidence_notes: str = ""


class LearnerBehavioralInsights(BaseModel):
    chat_patterns: str = ""
    resource_usage: str = ""
    quiz_performance: str = ""
    modality_preference: str = ""


class LearnerProfileAnalysis(BaseModel):
    """长期 + 实时画像与行为信号的综合分析，专供后续 AI 任务消费。"""

    user_id: str
    summary: str = ""
    long_term: LearnerLongTermInsights = Field(default_factory=LearnerLongTermInsights)
    realtime: LearnerRealtimeInsights = Field(default_factory=LearnerRealtimeInsights)
    behavioral: LearnerBehavioralInsights = Field(default_factory=LearnerBehavioralInsights)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    recommended_focus: list[str] = Field(default_factory=list)
    planning_hints: list[str] = Field(default_factory=list)
    personalization_strategy: PersonalizationStrategy = Field(default_factory=PersonalizationStrategy)
    ai_context_brief: str = ""
    sources: dict = Field(default_factory=dict)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProfileAnalysisResponse(BaseModel):
    analysis: LearnerProfileAnalysis
    profile: StudentProfile
    message: str = ""


class PathStep(BaseModel):
    id: str = ""
    order: int
    title: str
    objective: str
    resource_ids: list[str] = Field(default_factory=list)
    estimated_minutes: int = 30
    status: Literal["pending", "in_progress", "done"] = "pending"
    substeps: list["PathStep"] = Field(default_factory=list)


PathStep.model_rebuild()


class LearningPath(BaseModel):
    user_id: str
    steps: list[PathStep] = Field(default_factory=list)
    version: int = 1


class PathReplanMeta(BaseModel):
    stage_count: int = 0
    node_count: int = 0
    quality_checked: bool = True
    remaining_issues: list[str] = Field(default_factory=list)
    version: int = 1


class PathReplanResponse(BaseModel):
    path: LearningPath
    meta: PathReplanMeta


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
    metadata: "ResourceMetadata" = Field(default_factory=lambda: ResourceMetadata())
    status: Literal["draft", "published"] = "published"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ResourceMetadata(BaseModel):
    knowledge_points: list[str] = Field(default_factory=list)
    difficulty: Literal["basic", "intermediate", "advanced", "exam"] = "basic"
    learning_purpose: Literal[
        "preview", "explain", "practice", "review", "exam", "classroom", "project"
    ] = "explain"
    used_for: list[Literal["path", "classroom", "quiz", "review"]] = Field(default_factory=list)
    recommended_stage: str = "课堂讲解"
    estimated_minutes: int = 8
    prerequisites: list[str] = Field(default_factory=list)
    summary: str = ""
    learning_before_tip: str = ""
    learning_after_check: str = ""
    suitable_scenarios: list[str] = Field(default_factory=list)
    next_step: str = ""
    expected_outcome: str = ""
    source_library_id: str = ""
    source_files: list[str] = Field(default_factory=list)
    path_step_key: str = ""
    quality_score: float = 0
    quality_reason: str = ""
    quality_issues: list[str] = Field(default_factory=list)
    quality_tags: list[str] = Field(default_factory=list)
    quality_dimensions: dict[str, float] = Field(default_factory=dict)
    review_attempts: int = 0
    full_rewrite_attempted: bool = False
    classroom_ready: bool = False
    classroom_missing: list[str] = Field(default_factory=list)
    duplicate_of: str = ""
    formula_issues: list[str] = Field(default_factory=list)
    quiz_invalid_questions: list[int] = Field(default_factory=list)
    quiz_semantic_verified: bool = False
    quiz_semantic_review: dict[str, Any] = Field(default_factory=dict)
    generated_context: dict[str, Any] = Field(default_factory=dict)
    path_attachment_warning: str = ""


LearningResource.model_rebuild()


class ResourceRegenerateRequest(BaseModel):
    user_id: str = "demo"
    requirements: str = ""
    tags: list[str] = Field(default_factory=list)


class ResourceTemplateInfo(BaseModel):
    id: str
    title: str
    subtitle: str = ""
    topic: str = ""
    tags: list[str] = Field(default_factory=list)
    resource_count: int = 0
    estimated_minutes: int = 0
    icon: str = "book"
    color: str = "#1677ff"


class CreateFromTemplateRequest(BaseModel):
    user_id: str = "demo"
    template_id: str


class CreateFromTemplateResponse(BaseModel):
    template_id: str
    resources: list[LearningResource]
    message: str = ""


class GenerateReviewCardRequest(BaseModel):
    user_id: str = "demo"
    topic: str = ""


class PathResourceRegenRequest(BaseModel):
    user_id: str = "demo"
    library_id: str | None = None


class PathResourceRegenStageMeta(BaseModel):
    step_id: str = ""
    title: str = ""
    generated_count: int = 0
    types: list[str] = Field(default_factory=list)
    resource_ids: list[str] = Field(default_factory=list)
    titles: list[str] = Field(default_factory=list)


class PathResourceRegenMeta(BaseModel):
    generated_count: int = 0
    stages_processed: int = 0
    type_breakdown: dict[str, int] = Field(default_factory=dict)
    stages: list[PathResourceRegenStageMeta] = Field(default_factory=list)
    quality_checked: bool = True
    generation_mode: str = "web"
    library_name: str = ""
    library_id: str = ""
    fallback_count: int = 0
    fallback_warnings: list[str] = Field(default_factory=list)
    forced_regen: bool = True


class PathResourceRegenResponse(BaseModel):
    path: LearningPath
    resources: list[LearningResource] = Field(default_factory=list)
    meta: PathResourceRegenMeta


class PathConfirmMeta(BaseModel):
    ok: bool = True
    issues: list[str] = Field(default_factory=list)
    fixes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    stage_count: int = 0
    node_count: int = 0
    resource_count: int = 0
    linked_resource_count: int = 0
    starred_count: int = 0
    analysis_present: bool = False
    profile_present: bool = False
    confirmed_at: str = ""


class PathConfirmResponse(BaseModel):
    path: LearningPath
    resources: list[LearningResource] = Field(default_factory=list)
    meta: PathConfirmMeta


class PathReplanSubPhase(BaseModel):
    label: str
    status: Literal["pending", "active", "done"] = "pending"


class PathReplanJobResult(BaseModel):
    stage_count: int = 0
    node_count: int = 0
    linked_resource_count: int = 0
    generated_count: int = 0
    deleted_resource_count: int = 0
    kept_resource_count: int = 0
    starred_count: int = 0
    fallback_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    library_name: str = ""
    planning_sources: dict = Field(default_factory=dict)


class PathReplanJobCreateRequest(BaseModel):
    library_id: str | None = None
    conversation_id: str | None = None
    learning_goal: str | None = None
    planning_mode: Literal["auto", "chapter", "time", "detailed"] = "auto"
    planning_requirement: str | None = None


class ReplanContextResponse(BaseModel):
    learning_goal: str = ""
    goal_source: str = "none"
    conversation_id: str = ""
    chat_basis: str = ""
    intent_turn_count: int = 0
    intent_summary: str = ""
    intent_topics: list[str] = Field(default_factory=list)
    starred_count: int = 0
    starred_titles: list[str] = Field(default_factory=list)
    resource_view_count: int = 0
    resource_complete_count: int = 0
    quiz_summary: str = ""
    library_id: str = ""
    library_name: str = ""
    planning_mode: str = "auto"
    planning_requirement: str = ""
    can_start: bool = False
    block_reason: str = ""


class PathReplanJob(BaseModel):
    id: str
    user_id: str
    status: Literal["queued", "running", "done", "error"] = "queued"
    step_index: int = 0
    step_label: str = ""
    stage: str = ""
    progress: int = 0
    sub_phases: list[PathReplanSubPhase] = Field(default_factory=list)
    elapsed_sec: int = 0
    started_at: datetime | None = None
    result_summary: str = ""
    error: str = ""
    library_id: str = ""
    result: PathReplanJobResult | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ClassroomGenerateRequest(BaseModel):
    user_id: str = "demo"
    step_key: str = ""
    title: str = ""
    objective: str = ""
    resource_ids: list[str] = Field(default_factory=list)
    selected_resource_ids: list[str] = Field(default_factory=list)
    estimated_minutes: int = 20
    course_name: str = ""
    teaching_mode: str = ""
    depth_level: str = "标准掌握"
    classroom_keywords: list[str] = Field(default_factory=list)
    local_materials: list[dict[str, str]] = Field(default_factory=list)
    ai_material_requests: list[str] = Field(default_factory=list)


class ClassroomParsedMaterial(BaseModel):
    id: str
    title: str
    size: int = 0
    mime_type: str = ""
    content_excerpt: str = ""
    status: Literal["parsed", "recorded", "error"] = "recorded"
    error: str = ""


class ClassroomParseMaterialsResponse(BaseModel):
    materials: list[ClassroomParsedMaterial] = Field(default_factory=list)


class ClassroomSlide(BaseModel):
    kicker: str = ""
    title: str
    body: str
    board: list[str] = Field(default_factory=list)
    teacher_note: str = ""
    layout: str = "concept"
    visual_theme: str = ""
    accent_color: str = "teal"
    visual_prompt: str = ""
    visual_blocks: list[dict[str, Any]] = Field(default_factory=list)
    image_url: str = ""


class ClassroomTeacherScripts(BaseModel):
    normal: str = ""
    confused: str = ""
    slow: str = ""
    example: str = ""
    practice: str = ""


class ClassroomCheckQuestion(BaseModel):
    question: str
    expected_answer: str = ""
    hint: str = ""


class ClassroomQuizOption(BaseModel):
    id: str
    text: str
    diagnosis: str = ""


class ClassroomQuizRequest(BaseModel):
    user_id: str = "demo"
    course_title: str = ""
    course_objective: str = ""
    slide_title: str = ""
    slide_body: str = ""
    slide_board: list[str] = Field(default_factory=list)
    teacher_note: str = ""
    depth_level: str = "标准掌握"
    previous_question: str = ""
    variant: int = 0
    target_level: Literal["basic", "application", "trap", "exam"] | None = None
    used_question_texts: list[str] = Field(default_factory=list)
    wrong_streak: int = 0
    correct_levels: list[str] = Field(default_factory=list)


class ClassroomQuizResponse(BaseModel):
    id: str = ""
    question: str
    options: list[ClassroomQuizOption] = Field(default_factory=list)
    answer_id: str
    explanation: str = ""
    transfer: str = ""
    question_type: str = "single_choice"
    difficulty: str = "standard"
    diagnosis: dict[str, str] = Field(default_factory=dict)
    level: Literal["basic", "application", "trap", "exam"] = "basic"
    type: Literal["single_choice", "true_false"] = "single_choice"
    target_knowledge_point: str = ""
    ability: str = "concept_understanding"
    misconception: str = ""
    remedial_explanation: str = ""


class ClassroomInteractionRequest(BaseModel):
    user_id: str = "demo"
    session_id: str = ""
    action: Literal["confused", "slow", "example", "qa"]
    question: str = ""
    diagnosis: str = ""
    example_type: str = ""
    click_count: int = 1
    slide_index: int = 0
    slide: dict[str, Any] = Field(default_factory=dict)
    knowledge_point: str = ""
    teacher_script: str = ""
    long_term_profile: dict[str, Any] = Field(default_factory=dict)
    realtime_state: dict[str, Any] = Field(default_factory=dict)
    lesson_events: list[dict[str, Any]] = Field(default_factory=list)
    interaction_history: list[dict[str, Any]] = Field(default_factory=list)


class ClassroomInteractionResponse(BaseModel):
    action: Literal["confused", "slow", "example", "qa"]
    title: str = ""
    body: str = ""
    steps: list[str] = Field(default_factory=list)
    diagnosis: str = ""
    example_type: str = ""
    knowledge_point: str = ""
    helps: str = ""
    check_question: str = ""


class ClassroomHandoutSection(BaseModel):
    heading: str
    content: str


class ClassroomResourceSummary(BaseModel):
    id: str
    type: str = ""
    title: str = ""
    topic: str = ""


class ClassroomSessionResponse(BaseModel):
    id: str
    title: str
    objective: str
    course_name: str = ""
    estimated_minutes: int = 20
    depth_level: str = "标准掌握"
    slides: list[ClassroomSlide] = Field(default_factory=list)
    handout: list[ClassroomHandoutSection] = Field(default_factory=list)
    teacher_scripts: ClassroomTeacherScripts = Field(default_factory=ClassroomTeacherScripts)
    check_question: ClassroomCheckQuestion
    mini_quizzes: list[ClassroomQuizResponse] = Field(default_factory=list)
    homework: list[str] = Field(default_factory=list)
    source_resources: list[ClassroomResourceSummary] = Field(default_factory=list)
    prompt_summary: str = ""
    personalization_brief: str = ""


class ClassroomPptxExportRequest(BaseModel):
    user_id: str = "demo"
    session: ClassroomSessionResponse


class ClassroomGenerationJob(BaseModel):
    id: str
    user_id: str
    title: str = ""
    status: Literal["queued", "running", "done", "error"] = "queued"
    stage: str = ""
    sub_stage: str = ""
    progress: int = 0
    result: ClassroomSessionResponse | None = None
    error: str = ""
    elapsed_seconds: int = 0
    heartbeat_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ClassroomLibraryItem(BaseModel):
    id: str
    job_id: str
    user_id: str
    step_key: str = ""
    title: str = ""
    objective: str = ""
    course_name: str = ""
    status: Literal["queued", "running", "done", "error"] = "queued"
    stage: str = ""
    progress: int = 0
    is_favorite: bool = False
    has_result: bool = False
    error: str = ""
    seed: dict = Field(default_factory=dict)
    result: ClassroomSessionResponse | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ClassroomLibraryListResponse(BaseModel):
    items: list[ClassroomLibraryItem] = Field(default_factory=list)


class ClassroomLibraryFavoriteUpdate(BaseModel):
    is_favorite: bool


class ChatAttachmentMeta(BaseModel):
    id: str
    name: str
    kind: Literal["image", "file"] = "file"
    mime_type: str = ""
    url: str = ""
    size: int = 0
    text_preview: str = ""


class ChatRequest(BaseModel):
    user_id: str = "demo"
    message: str
    stream: bool = True
    chunk_size: int = 8
    deep_thinking: bool = False
    web_search: bool = False
    attachment_context: str = ""
    attachments: list[ChatAttachmentMeta] = Field(default_factory=list)


class AttachmentContextRequest(BaseModel):
    user_id: str = "demo"
    question: str = ""
    attachments: list[ChatAttachmentMeta] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    profile: StudentProfile | None = None
    realtime_state: RealtimeLearningState | None = None
    intent: IntentType = "chat"
    resources: list[dict] = Field(default_factory=list)
    path: dict | None = None


class GenerateResourcesRequest(BaseModel):
    user_id: str = "demo"
    topic: str = "机器学习导论"
    resource_types: list[ResourceType] = Field(
        default_factory=lambda: ["doc", "mindmap", "quiz", "reading", "media", "code"]
    )
    resource_type_counts: dict[str, int] = Field(default_factory=dict)
    library_id: str | None = None
    new_library_name: str | None = None
    generation_source: Literal["existing_library", "uploaded", "empty", "web"] = "web"
    requirements: str = ""
    deep_thinking: bool = False
    learning_purpose: Literal[
        "preview", "explain", "practice", "review", "exam", "classroom", "project"
    ] | None = None
    path_step_key: str | None = None
    attach_to_path: bool = False
    path_attach_mode: Literal["none", "auto", "manual"] = "none"


class ResourceGenerationResultSummary(BaseModel):
    generated_count: int = 0
    published_count: int = 0
    draft_count: int = 0
    rewritten_count: int = 0
    library_resource_count: int = 0
    path_attached_count: int = 0
    path_unmatched_count: int = 0
    classroom_ready_count: int = 0
    library_id: str = ""
    library_name: str = ""
    resource_ids: list[str] = Field(default_factory=list)


class ResourceGenerationJob(BaseModel):
    id: str
    user_id: str
    title: str = ""
    status: Literal["queued", "running", "done", "error"] = "queued"
    stage: str = ""
    sub_stage: str = ""
    current_resource_type: str = ""
    progress: int = 0
    elapsed_seconds: int = 0
    error: str = ""
    result: ResourceGenerationResultSummary | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


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
    requirements: str = ""
    source_library_id: str | None = None
    source_mode: Literal["upload", "existing_library", "empty"] = "upload"


class LibraryFileInfo(BaseModel):
    id: str
    filename: str
    mime_type: str = ""
    size: int = 0
    status: str = "pending"


class LibraryFilePreview(BaseModel):
    id: str
    filename: str
    mime_type: str = ""
    content: str = ""
    preview_kind: Literal["markdown", "code", "text"] = "text"
    source: Literal["original", "extracted", "analysis"] = "analysis"


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
    role: str = "user"


class DemoTokenRequest(BaseModel):
    display_name: str = "演示学生"


class AdminTokenRequest(BaseModel):
    display_name: str = "系统管理员"


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
    study_streak: int = 0
    studied_today: bool = False
    has_path: bool
    radar: RadarData
    recent_events: list[EvalEvent]
    ai_advice: str = ""
    strengths: str = ""
    improvements: str = ""
    advice_updated_at: str = ""


MasteryLevel = Literal["forgot", "fuzzy", "mastered"]


class PathStepStatusUpdate(BaseModel):
    status: Literal["pending", "in_progress", "done"] | None = None
    mastery_level: MasteryLevel | None = None
    resource_id: str = ""


class MasteryFeedbackRequest(BaseModel):
    user_id: str = "demo"
    mastery_level: MasteryLevel
    resource_id: str = ""
    step_key: str = ""


class MasteryRecord(BaseModel):
    level: MasteryLevel
    next_review_at: str
    interval_days: int = 0
    streak: int = 0
    step_key: str = ""
    resource_id: str = ""
    title: str = ""
    updated_at: str = ""


class MasteryFeedbackResponse(BaseModel):
    ok: bool = True
    record: MasteryRecord
    path_updated: bool = False
    next_review_label: str = ""


class ResourceCompleteRequest(BaseModel):
    mastery_level: MasteryLevel | None = None


class ResourceRecommendation(BaseModel):
    id: str
    type: str
    title: str
    topic: str = ""
    score: float = 0.0
    reason: str = ""


class DailyTaskItem(BaseModel):
    id: str
    text: str
    done: bool = False


class DailyPlanState(BaseModel):
    """用户当日学习计划（按本地日期归档）。"""

    date: str = ""
    tasks: list[DailyTaskItem] = Field(default_factory=list)


class UserPreferences(BaseModel):
    user_id: str
    starred_resource_ids: list[str] = Field(default_factory=list)
    account_patch: dict = Field(default_factory=dict)
    daily_plan: DailyPlanState = Field(default_factory=DailyPlanState)
    mastery_records: dict[str, Any] = Field(default_factory=dict)


class UserPreferencesUpdate(BaseModel):
    starred_resource_ids: list[str] | None = None
    account_patch: dict | None = None
    daily_plan: DailyPlanState | None = None
    mastery_records: dict[str, Any] | None = None


class ChatConversationSummary(BaseModel):
    id: str
    title: str = "新对话"
    created_at: str = ""
    updated_at: str = ""
    message_count: int = 0


class CreateChatConversationRequest(BaseModel):
    user_id: str = "demo"
    title: str = "新对话"


class ChatMessageItem(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    resources: list[dict] = Field(default_factory=list)
    turn_id: str = ""
    conversation_id: str = ""
    attachments: list[ChatAttachmentMeta] = Field(default_factory=list)
    created_at: str = ""


class ChatHistoryAppend(BaseModel):
    user_id: str = "demo"
    conversation_id: str = ""
    role: Literal["user", "assistant"]
    content: str
    resources: list[dict] = Field(default_factory=list)
    turn_id: str = ""
    attachments: list[ChatAttachmentMeta] = Field(default_factory=list)


class TtsSpeakRequest(BaseModel):
    text: str
    voice: Literal["female", "male", "off"] = "female"


class TtsSpeakResponse(BaseModel):
    audio_base64: str = ""
    format: str = "mp3"
    provider: Literal["spark", "mock"] = "mock"
