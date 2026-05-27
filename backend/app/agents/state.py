from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    user_id: str
    messages: list[dict[str, str]]
    intent: str
    profile: dict[str, Any]
    resources: list[dict[str, Any]]
    new_resources: list[dict[str, Any]]
    path: dict[str, Any]
    rag_context: str
    topic: str
    resource_types: list[str]
    reply: str
    deep_thinking: bool
    library_id: str
    generation_context: dict[str, Any]
