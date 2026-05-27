import json
import re

from app.agents.state import AgentState
from app.core.llm import get_primary_llm
from app.core.prompts import chat_reply_hint, path_planning_system, path_planning_user_payload
from app.db.repository import get_path, save_path


def _topic_in_resource(topic: str, r: dict) -> bool:
    if not topic:
        return False
    blob = f"{r.get('title', '')} {r.get('topic', '')} {r.get('content', '')[:300]}"
    return topic in blob


def _partition_resources(resources: list[dict], weak_topics: list[str]) -> tuple[list, list, list]:
    weak = [w for w in (weak_topics or []) if w]
    weak_related: list[dict] = []
    other: list[dict] = []
    for r in resources:
        if any(_topic_in_resource(w, r) for w in weak):
            weak_related.append(r)
        else:
            other.append(r)
    ordered = weak_related + other
    if not ordered:
        return [], [], []
    n = len(ordered)
    if n == 1:
        return ordered[:1], [], []
    if n == 2:
        return ordered[:1], ordered[1:2], []
    return (
        ordered[:1],
        ordered[1 : 1 + max(1, (n - 2) // 2 + ((n - 2) % 2))],
        ordered[1 + max(1, (n - 2) // 2 + ((n - 2) % 2)) :],
    )


def _merge_step_status(old_steps: list[dict], new_steps: list[dict]) -> list[dict]:
    status_by_order = {s.get("order"): s.get("status") for s in old_steps if s.get("order")}
    for step in new_steps:
        order = step.get("order")
        prev = status_by_order.get(order)
        if prev == "done":
            step["status"] = "done"
    return new_steps


def _default_steps(
    user_id: str,
    resources: list[dict],
    weak: list[str],
    resource_ids: list[str],
    ids1: list[str],
    ids2: list[str],
    ids3: list[str],
) -> list[dict]:
    weak_label = "、".join(weak[:3]) if weak else "综合练习"
    return [
        {
            "order": 1,
            "title": "导论与数学基础",
            "objective": "理解机器学习问题定义与基本术语",
            "resource_ids": ids1 or resource_ids[:1],
            "estimated_minutes": 45,
            "status": "in_progress" if resource_ids else "pending",
        },
        {
            "order": 2,
            "title": f"薄弱点强化：{weak_label}",
            "objective": f"针对薄弱点：{weak}",
            "resource_ids": ids2 or resource_ids[1:3],
            "estimated_minutes": 60,
            "status": "pending",
        },
        {
            "order": 3,
            "title": "模型评估与巩固",
            "objective": "完成练习并复盘",
            "resource_ids": ids3 or resource_ids[3:],
            "estimated_minutes": 40,
            "status": "pending",
        },
    ]


async def _llm_plan_steps(
    profile: dict,
    resources: list[dict],
    weak: list[str],
    *,
    deep: bool,
) -> list[dict] | None:
    if not resources:
        return None
    llm = get_primary_llm()
    if llm.use_mock:
        return None
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": path_planning_system(deep)},
                {
                    "role": "user",
                    "content": path_planning_user_payload(
                        profile=profile, resources=resources, weak_topics=weak
                    ),
                },
            ],
            temperature=0.35 if deep else 0.5,
            deep_thinking=deep,
        )
        match = re.search(r"\[[\s\S]*\]", raw)
        if not match:
            return None
        steps = json.loads(match.group())
        if not isinstance(steps, list) or len(steps) < 1:
            return None
        valid_ids = {r.get("id") for r in resources if r.get("id")}
        normalized: list[dict] = []
        for i, step in enumerate(steps[:3], start=1):
            if not isinstance(step, dict):
                continue
            rids = [x for x in (step.get("resource_ids") or []) if x in valid_ids]
            normalized.append(
                {
                    "order": int(step.get("order") or i),
                    "title": str(step.get("title") or f"阶段 {i}")[:32],
                    "objective": str(step.get("objective") or "按资源推进学习")[:200],
                    "resource_ids": rids or list(valid_ids)[: max(1, i)],
                    "estimated_minutes": int(step.get("estimated_minutes") or 45),
                    "status": "in_progress" if i == 1 and rids else "pending",
                }
            )
        return normalized or None
    except Exception:
        return None


async def path_node(state: AgentState) -> dict:
    user_id = state.get("user_id", "demo")
    profile = state.get("profile") or {}
    resources = state.get("resources") or []
    weak = list(profile.get("error_prone_topics") or [])
    old_path = await get_path(user_id)
    old_steps = (old_path or {}).get("steps") or []
    deep = bool(state.get("deep_thinking"))

    chunk1, chunk2, chunk3 = _partition_resources(resources, weak)
    ids1 = [r.get("id", "") for r in chunk1 if r.get("id")]
    ids2 = [r.get("id", "") for r in chunk2 if r.get("id")]
    ids3 = [r.get("id", "") for r in chunk3 if r.get("id")]
    resource_ids = [r.get("id", "") for r in resources if r.get("id")]

    steps = await _llm_plan_steps(profile, resources, weak, deep=deep)
    if not steps:
        steps = _default_steps(user_id, resources, weak, resource_ids, ids1, ids2, ids3)

    steps = _merge_step_status(old_steps, steps)
    if resource_ids and not any(s.get("status") == "in_progress" for s in steps):
        for s in steps:
            if s.get("status") != "done":
                s["status"] = "in_progress"
                break

    path = {"user_id": user_id, "steps": steps, "version": (old_path or {}).get("version", 0) + 1}
    await save_path(path)

    if not resource_ids:
        reply = (
            chat_reply_hint("path", deep)
            + "\n\n当前为路径框架（尚未关联资源）；请先在「资源库」生成学习资料，再点击「重新规划」。"
        )
    else:
        reply = (
            chat_reply_hint("path", deep)
            + f"\n\n已规划 **{len(steps)}** 个学习阶段，关联 **{len(resource_ids)}** 项资源；第 1 步已设为进行中。"
        )
    return {"path": path, "reply": reply}
