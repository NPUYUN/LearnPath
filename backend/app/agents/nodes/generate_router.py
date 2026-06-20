from app.agents.state import AgentState
from app.agents.nodes.doc_agent import doc_node
from app.agents.nodes.mindmap_agent import mindmap_node
from app.agents.nodes.quiz_agent import quiz_node
from app.agents.nodes.reading_agent import reading_node
from app.agents.nodes.media_agent import media_node
from app.agents.nodes.code_agent import code_node
from app.agents.nodes.ppt_agent import ppt_node
from app.agents.nodes.design_agent import design_node
from app.agents.nodes.project_agent import project_node
from app.agents.nodes.reviewer_agent import review_resources
from app.core.prompts import chat_reply_hint
from app.services.resource_generation_utils import expand_resource_jobs, normalize_resource_type_counts

RESOURCE_NODE_MAP = {
    "doc": doc_node,
    "mindmap": mindmap_node,
    "quiz": quiz_node,
    "reading": reading_node,
    "media": media_node,
    "code": code_node,
    "ppt": ppt_node,
    "design": design_node,
    "project": project_node,
}


async def generate_router_node(state: AgentState) -> dict:
    """按 resource_types 依次调用各资源 Agent，仅将本批新增写入 new_resources。"""
    jobs = state.get("resource_generation_jobs")
    if not jobs:
        counts = normalize_resource_type_counts(
            state.get("resource_type_counts"),
            state.get("resource_types"),
            topic=str(state.get("topic") or ""),
            requirements=str((state.get("generation_context") or {}).get("requirements") or ""),
        )
        jobs = expand_resource_jobs(counts)
    if not jobs:
        jobs = [(rt, 1) for rt in (state.get("resource_types") or ["doc", "mindmap", "quiz", "reading", "code"])]

    prior = list(state.get("resources") or [])
    prior_ids = {r.get("id") for r in prior if r.get("id")}

    merged: dict = {"resources": list(prior)}
    current = dict(state)
    current["resources"] = merged["resources"]

    type_counts = normalize_resource_type_counts(
        state.get("resource_type_counts"),
        state.get("resource_types"),
        topic=str(state.get("topic") or ""),
        requirements=str((state.get("generation_context") or {}).get("requirements") or ""),
    )

    for rt, variant in jobs:
        node_fn = RESOURCE_NODE_MAP.get(rt)
        if node_fn:
            variant_total = sum(1 for t, _ in jobs if t == rt)
            current["resource_variant_index"] = variant
            current["resource_variant_total"] = variant_total
            result = await node_fn(current)
            current["resources"] = result.get("resources", current["resources"])
            merged["resources"] = current["resources"]

    all_resources = merged["resources"]
    new_resources = [r for r in all_resources if r.get("id") and r.get("id") not in prior_ids]
    new_resources = await review_resources(new_resources, existing_resources=prior)
    for i, r in enumerate(all_resources):
        if r.get("id") in {n.get("id") for n in new_resources}:
            for nr in new_resources:
                if nr.get("id") == r.get("id"):
                    all_resources[i] = nr
                    break
    merged["resources"] = all_resources

    deep = bool(state.get("deep_thinking"))
    ordered_types: list[str] = []
    for rt, _ in jobs:
        if rt not in ordered_types:
            ordered_types.append(rt)
    type_labels = "、".join(
        f"{rt}×{sum(1 for t, _ in jobs if t == rt)}"
        if sum(1 for t, _ in jobs if t == rt) > 1
        else rt
        for rt in ordered_types
    )
    merged["new_resources"] = new_resources
    merged["reply"] = (
        chat_reply_hint("generate", deep)
        + f"\n\n本次共生成 **{len(new_resources)}** 项新资源（类型：{type_labels}）。"
        + (f"资源库合计 **{len(all_resources)}** 项。" if prior else "")
    )
    return merged


def resource_nodes():
    return list(RESOURCE_NODE_MAP.values())
