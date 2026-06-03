import json
import re

from app.agents.state import AgentState
from app.core.guardrails import filter_sensitive
from app.core.llm import get_primary_llm
from app.core.prompts import (
    path_narrative_system,
    path_narrative_user_payload,
    path_planning_system,
    path_planning_topic_system,
    path_planning_topic_user_payload,
    path_planning_user_payload,
)
from app.db.repository import get_path, save_path

_TOPIC_NOISE = (
    "请帮我",
    "帮我",
    "请",
    "规划",
    "复习计划",
    "学习计划",
    "学习路径",
    "学习路线",
    "路径",
    "计划",
    "下一步",
    "学什么",
    "安排",
    "制定",
)


def _user_message(state: AgentState) -> str:
    for m in reversed(state.get("messages") or []):
        if m.get("role") == "user":
            return (m.get("content") or "").strip()
    return ""


def _infer_topic(user_text: str, state_topic: str) -> str:
    text = user_text.strip()
    for noise in _TOPIC_NOISE:
        text = text.replace(noise, "")
    text = text.strip("，。！？,.!? \t\n")
    if len(text) >= 2:
        return text[:48]
    if state_topic and state_topic not in ("综合学习", ""):
        return state_topic[:48]
    return "综合学习"


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


def _parse_steps_json(raw: str) -> list[dict] | None:
    match = re.search(r"\[[\s\S]*\]", raw)
    if not match:
        return None
    steps = json.loads(match.group())
    if not isinstance(steps, list) or len(steps) < 1:
        return None
    return steps


def _normalize_steps(
    steps: list,
    *,
    valid_ids: set[str],
    default_resource_ids: list[str],
) -> list[dict] | None:
    normalized: list[dict] = []
    for i, step in enumerate(steps[:3], start=1):
        if not isinstance(step, dict):
            continue
        rids = [x for x in (step.get("resource_ids") or []) if x in valid_ids]
        if valid_ids and not rids:
            rids = default_resource_ids[: max(1, min(i, len(default_resource_ids)))]
        normalized.append(
            {
                "order": int(step.get("order") or i),
                "title": str(step.get("title") or f"阶段 {i}")[:32],
                "objective": str(step.get("objective") or "按阶段推进学习")[:240],
                "resource_ids": rids,
                "estimated_minutes": int(step.get("estimated_minutes") or 45),
                "status": "in_progress" if i == 1 else "pending",
            }
        )
    return normalized or None


def _default_steps(
    topic: str,
    weak: list[str],
    resource_ids: list[str],
    ids1: list[str],
    ids2: list[str],
    ids3: list[str],
) -> list[dict]:
    weak_label = "、".join(weak[:3]) if weak else "重点难点"
    label = topic if topic and topic != "综合学习" else "核心知识"
    return [
        {
            "order": 1,
            "title": f"{label}：基础梳理",
            "objective": f"系统梳理{label}的核心概念与知识框架，建立复习提纲",
            "resource_ids": ids1 or resource_ids[:1],
            "estimated_minutes": 45,
            "status": "in_progress" if resource_ids else "pending",
        },
        {
            "order": 2,
            "title": f"强化突破：{weak_label}",
            "objective": f"针对{weak_label}进行专项练习与错题复盘",
            "resource_ids": ids2 or resource_ids[1:3],
            "estimated_minutes": 60,
            "status": "pending",
        },
        {
            "order": 3,
            "title": "模拟冲刺与总结",
            "objective": "完成模拟测试，整理易错点与考前清单",
            "resource_ids": ids3 or resource_ids[3:],
            "estimated_minutes": 40,
            "status": "pending",
        },
    ]


async def _llm_plan_with_resources(
    user_request: str,
    topic: str,
    profile: dict,
    resources: list[dict],
    weak: list[str],
    *,
    deep: bool,
) -> list[dict] | None:
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
                        user_request=user_request,
                        topic=topic,
                        profile=profile,
                        resources=resources,
                        weak_topics=weak,
                    ),
                },
            ],
            temperature=0.35 if deep else 0.5,
            deep_thinking=deep,
            task="path",
        )
        steps = _parse_steps_json(raw)
        if not steps:
            return None
        valid_ids = {r.get("id") for r in resources if r.get("id")}
        resource_ids = [r.get("id", "") for r in resources if r.get("id")]
        return _normalize_steps(steps, valid_ids=valid_ids, default_resource_ids=resource_ids)
    except Exception:
        return None


async def _llm_plan_by_topic(
    user_request: str,
    topic: str,
    profile: dict,
    weak: list[str],
    *,
    deep: bool,
) -> list[dict] | None:
    llm = get_primary_llm()
    if llm.use_mock:
        return None
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": path_planning_topic_system(deep)},
                {
                    "role": "user",
                    "content": path_planning_topic_user_payload(
                        user_request=user_request,
                        topic=topic,
                        profile=profile,
                        weak_topics=weak,
                    ),
                },
            ],
            temperature=0.35 if deep else 0.5,
            deep_thinking=deep,
            task="path",
        )
        steps = _parse_steps_json(raw)
        if not steps:
            return None
        return _normalize_steps(steps, valid_ids=set(), default_resource_ids=[])
    except Exception:
        return None


def _fallback_narrative(topic: str, steps: list[dict], *, has_resources: bool) -> str:
    lines = [f"已为你规划 **{topic}** 的分阶段学习路径：\n"]
    for step in steps:
        mins = step.get("estimated_minutes") or 45
        lines.append(
            f"### 阶段 {step.get('order')}：{step.get('title')}\n"
            f"- **目标**：{step.get('objective')}\n"
            f"- **建议用时**：约 {mins} 分钟\n"
        )
    if not has_resources:
        lines.append(
            "\n> 当前路径为 AI 规划框架，尚未关联资源库资料。"
            "可在「资源库」生成相关文档/题库后，再次对话「重新规划」以自动关联。"
        )
    else:
        lines.append("\n> 详细步骤已同步至「学习路径」页，可按阶段推进并完成配套资源。")
    return "\n".join(lines)


async def _llm_path_narrative(
    user_request: str,
    topic: str,
    steps: list[dict],
    profile: dict,
    *,
    has_resources: bool,
    deep: bool,
) -> str:
    llm = get_primary_llm()
    if llm.use_mock:
        return _fallback_narrative(topic, steps, has_resources=has_resources)
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": path_narrative_system(deep)},
                {
                    "role": "user",
                    "content": path_narrative_user_payload(
                        user_request=user_request,
                        topic=topic,
                        steps=steps,
                        profile=profile,
                        has_resources=has_resources,
                    ),
                },
            ],
            temperature=0.45 if deep else 0.55,
            deep_thinking=deep,
            task="path",
        )
        text = filter_sensitive((raw or "").strip())
        return text if len(text) >= 80 else _fallback_narrative(topic, steps, has_resources=has_resources)
    except Exception:
        return _fallback_narrative(topic, steps, has_resources=has_resources)


async def path_node(state: AgentState) -> dict:
    user_id = state.get("user_id", "demo")
    profile = state.get("profile") or {}
    resources = state.get("resources") or []
    weak = list(profile.get("error_prone_topics") or [])
    old_path = await get_path(user_id)
    old_steps = (old_path or {}).get("steps") or []
    deep = bool(state.get("deep_thinking"))

    user_request = _user_message(state)
    topic = _infer_topic(user_request, str(state.get("topic") or ""))

    chunk1, chunk2, chunk3 = _partition_resources(resources, weak)
    ids1 = [r.get("id", "") for r in chunk1 if r.get("id")]
    ids2 = [r.get("id", "") for r in chunk2 if r.get("id")]
    ids3 = [r.get("id", "") for r in chunk3 if r.get("id")]
    resource_ids = [r.get("id", "") for r in resources if r.get("id")]

    if resource_ids:
        steps = await _llm_plan_with_resources(
            user_request, topic, profile, resources, weak, deep=deep
        )
    else:
        steps = await _llm_plan_by_topic(user_request, topic, profile, weak, deep=deep)

    if not steps:
        steps = _default_steps(topic, weak, resource_ids, ids1, ids2, ids3)

    steps = _merge_step_status(old_steps, steps)
    if resource_ids and not any(s.get("status") == "in_progress" for s in steps):
        for s in steps:
            if s.get("status") != "done":
                s["status"] = "in_progress"
                break
    elif not resource_ids and steps and steps[0].get("status") == "pending":
        steps[0]["status"] = "in_progress"

    path = {"user_id": user_id, "steps": steps, "version": (old_path or {}).get("version", 0) + 1}
    await save_path(path)

    narrative = await _llm_path_narrative(
        user_request,
        topic,
        steps,
        profile,
        has_resources=bool(resource_ids),
        deep=deep,
    )
    if deep:
        narrative += "\n\n（本次启用深度思考，推理过程更完整，响应可能略慢。）"

    reply = filter_sensitive(narrative)
    if resource_ids:
        reply += (
            f"\n\n---\n📌 已在「学习路径」保存 **{len(steps)}** 个阶段，"
            f"关联 **{len(resource_ids)}** 项资源；第 1 步已设为进行中。"
        )
    else:
        reply += "\n\n---\n📌 路径框架已保存至「学习路径」页，可在该页逐步标记完成进度。"

    return {"path": path, "reply": reply}
