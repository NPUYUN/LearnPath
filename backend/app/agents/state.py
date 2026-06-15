from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    user_id: str
    messages: list[dict[str, str]]
    intent: str
    profile: dict[str, Any]
    learner_analysis: dict[str, Any]
    resources: list[dict[str, Any]]
    new_resources: list[dict[str, Any]]
    path: dict[str, Any]
    rag_context: str
    topic: str
    resource_types: list[str]
    resource_type_counts: dict[str, int]
    resource_generation_jobs: list[tuple[str, int]]
    resource_variant_index: int
    resource_variant_total: int
    reply: str
    deep_thinking: bool
    fresh_path: bool
    quality_replan: bool
    skip_narrative: bool
    library_id: str
    generation_context: dict[str, Any]
