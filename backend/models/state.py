"""
LangGraph 多智能体状态定义
所有智能体共享同一个 AgentState 对象，通过状态传递协作
"""
from typing import TypedDict, List, Optional, Annotated
from langgraph.graph.message import add_messages


class StudentProfile(TypedDict):
    """
    学生画像（≥6个维度，满足赛题要求）
    """
    knowledge_level: dict       # 知识基础：{"score": 0-10, "weak_points": [...]}
    cognitive_style: str        # 认知风格：visual / auditory / reading / kinesthetic
    learning_goal: str          # 学习目标
    error_prone_topics: List[str]  # 易错点
    available_time_per_day: float  # 每日可用学习时长（小时）
    interest_direction: List[str]  # 兴趣方向
    # 可扩展维度：
    # learning_pace: str         # 学习节奏：fast / medium / slow
    # preferred_resource_type: List[str]  # 偏好资源类型


class LearningResource(TypedDict):
    """单个学习资源"""
    resource_id: str
    resource_type: str          # document / mindmap / quiz / video / code / reading
    title: str
    content: dict               # 具体内容（不同类型格式不同）
    generated_at: str


class LearningPathStage(TypedDict):
    """学习路径中的一个阶段"""
    stage_id: str
    stage_name: str
    objectives: List[str]       # 学习目标
    resources: List[str]        # 资源 ID 列表
    estimated_hours: float
    is_completed: bool


class AgentState(TypedDict):
    """
    多智能体共享状态对象
    LangGraph 图中所有节点读写此对象
    """
    # === 会话基础 ===
    student_id: str
    messages: Annotated[List[dict], add_messages]   # 对话历史（自动追加）

    # === 学生画像 ===
    student_profile: Optional[StudentProfile]
    profile_build_turns: int    # 已进行的画像构建轮数

    # === 当前任务 ===
    current_intent: str         # 用户意图：build_profile / generate_resources / plan_path / tutor / evaluate
    current_topic: str          # 当前学习主题

    # === RAG ===
    rag_context: str            # 检索到的知识库上下文

    # === 资源生成 ===
    resource_request: Optional[dict]               # 资源生成请求参数
    generated_resources: List[LearningResource]    # 已生成的资源

    # === 学习路径 ===
    learning_path: Optional[List[LearningPathStage]]

    # === 路由控制 ===
    next_agent: Optional[str]   # 下一步路由目标（由 orchestrator 设置）
    error_message: Optional[str]  # 错误信息
