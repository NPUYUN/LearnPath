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
    path_replan_refine_system,
    path_replan_refine_user_payload,
)
from app.db.repository import get_path, save_path
from app.services.path_utils import (
    all_resource_ids,
    finalize_path_steps,
    flatten_steps,
    merge_step_status,
    normalize_step_tree,
)

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


def _parse_steps_json(raw: str) -> list[dict] | None:
    match = re.search(r"\[[\s\S]*\]", raw)
    if not match:
        return None
    steps = json.loads(match.group())
    if not isinstance(steps, list) or len(steps) < 1:
        return None
    return steps


def _estimate_stage_count(topic: str, resources: list[dict], weak: list[str], *, topic_only: bool) -> int:
    """LLM 不可用时的阶段数启发式（不再固定为 3）。"""
    if topic_only:
        base = 2 + min(len(weak), 3)
        if len(topic) > 12:
            base += 1
        return min(8, max(2, base))
    n = len(resources)
    if n <= 1:
        return 1
    if n <= 3:
        return 2
    if n <= 6:
        return 3 + (1 if weak else 0)
    if n <= 10:
        return 4 + min(2, len(weak))
    return min(10, 5 + (n - 10 + 2) // 3)


def _split_resources(resources: list[dict], num_stages: int) -> list[list[dict]]:
    if not resources:
        return [[] for _ in range(max(1, num_stages))]
    num_stages = max(1, min(num_stages, len(resources), 10))
    n = len(resources)
    chunks: list[list[dict]] = []
    base, rem = divmod(n, num_stages)
    idx = 0
    for i in range(num_stages):
        size = base + (1 if i < rem else 0)
        chunks.append(resources[idx : idx + size])
        idx += size
    return chunks


def _make_substeps_from_chunk(chunk: list[dict], *, label: str) -> list[dict]:
    if len(chunk) <= 1:
        return []
    substeps: list[dict] = []
    for j, r in enumerate(chunk, start=1):
        substeps.append(
            {
                "order": j,
                "title": (r.get("title") or f"{label} · 第{j}项")[:36],
                "objective": f"学习「{r.get('title', '配套资源')}」并完成相关练习",
                "resource_ids": [r.get("id", "")] if r.get("id") else [],
                "estimated_minutes": 25,
                "status": "pending",
                "substeps": [],
            }
        )
    return substeps


def _default_steps(
    topic: str,
    weak: list[str],
    resources: list[dict],
    *,
    activate_first: bool = True,
) -> list[dict]:
    weak_label = "、".join(weak[:3]) if weak else "重点难点"
    label = topic if topic and topic != "综合学习" else "核心知识"
    resource_ids = [r.get("id", "") for r in resources if r.get("id")]
    topic_only = not resource_ids
    num_stages = _estimate_stage_count(topic, resources, weak, topic_only=topic_only)

    weak_related: list[dict] = []
    other: list[dict] = []
    for r in resources:
        if any(_topic_in_resource(w, r) for w in weak):
            weak_related.append(r)
        else:
            other.append(r)
    ordered = weak_related + other if resources else []
    chunks = _split_resources(ordered, num_stages) if ordered else [[] for _ in range(num_stages)]

    steps: list[dict] = []
    for i in range(num_stages):
        order = i + 1
        chunk = chunks[i] if i < len(chunks) else []
        ids = [r.get("id", "") for r in chunk if r.get("id")]
        if not ids and resource_ids:
            slice_ids = resource_ids[
                (i * len(resource_ids)) // num_stages : ((i + 1) * len(resource_ids)) // num_stages
            ]
            ids = slice_ids or resource_ids[i : i + 1]

        if order == 1:
            title = f"{label}：入门与框架"
            objective = f"建立{label}的基本概念，明确后续章节的学习顺序"
            minutes = 45
        elif order == num_stages:
            title = "综合复盘与自测"
            objective = "串联各章要点，完成练习并整理薄弱项"
            minutes = 40
        elif order == 2 and weak:
            title = f"专项突破：{weak_label}"
            objective = f"针对{weak_label}进行分节练习与错题复盘"
            minutes = 55
        else:
            title = f"{label} · 第{order}章"
            objective = f"按章节深化{label}，完成本节阅读与练习"
            minutes = 50

        substeps = _make_substeps_from_chunk(chunk, label=title) if len(chunk) > 1 else []

        steps.append(
            {
                "order": order,
                "title": title[:40],
                "objective": objective[:320],
                "resource_ids": [] if substeps else ids,
                "estimated_minutes": minutes,
                "status": "pending",
                "substeps": substeps,
            }
        )
    return finalize_path_steps(steps, activate_first=activate_first)


def _analysis_brief(state: AgentState) -> str:
    analysis = state.get("learner_analysis") or {}
    return str(analysis.get("ai_context_brief") or "").strip()


def collect_plan_quality_issues(steps: list[dict], resource_ids: list[str]) -> list[str]:
    issues: list[str] = []
    flat = flatten_steps(steps)
    if not flat:
        issues.append("路径为空，至少应包含 1 个学习阶段")
        return issues

    for step in flat:
        title = str(step.get("title") or "").strip()
        objective = str(step.get("objective") or "").strip()
        if len(objective) < 8:
            issues.append(f"步骤「{title or step.get('id', '')}」的 objective 过于简略，需更可执行")
        if title in ("入门与框架", "综合复盘与自测") and len(flat) <= 3:
            issues.append(f"标题「{title}」过于模板化，请结合用户真实主题重写")

    if resource_ids:
        assigned = all_resource_ids(steps)
        missing = [rid for rid in resource_ids if rid not in assigned]
        if len(missing) == len(resource_ids):
            issues.append("尚未将任何已有学习资源分配到路径节点")
        elif missing:
            issues.append(f"以下资源尚未分配：{', '.join(missing[:6])}")

    weak_objectives = sum(1 for s in flat if len(str(s.get("objective") or "")) < 12)
    if weak_objectives >= max(2, len(flat) // 2):
        issues.append("过半步骤目标不够具体，请补充可检验的学习产出")

    return issues[:8]


async def _llm_refine_plan(
    draft_steps: list[dict],
    *,
    user_request: str,
    topic: str,
    profile: dict,
    resources: list[dict],
    weak: list[str],
    learner_analysis_brief: str,
    quality_issues: list[str],
    activate_first: bool,
) -> list[dict] | None:
    llm = get_primary_llm()
    if llm.use_mock or not draft_steps:
        return None
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": path_replan_refine_system()},
                {
                    "role": "user",
                    "content": path_replan_refine_user_payload(
                        user_request=user_request,
                        topic=topic,
                        profile=profile,
                        resources=resources,
                        weak_topics=weak,
                        learner_analysis_brief=learner_analysis_brief,
                        draft_steps=draft_steps,
                        quality_issues=quality_issues,
                    ),
                },
            ],
            temperature=0.28,
            deep_thinking=True,
            task="path",
        )
        steps = _parse_steps_json(raw)
        if not steps:
            return None
        valid_ids = {r.get("id") for r in resources if r.get("id")}
        resource_id_list = [r.get("id", "") for r in resources if r.get("id")]
        normalized = normalize_step_tree(
            steps,
            valid_ids=valid_ids,
            default_resource_ids=resource_id_list,
            activate_first=activate_first,
        )
        return finalize_path_steps(normalized, activate_first=activate_first) if normalized else None
    except Exception:
        return None


async def _llm_plan_with_resources(
    user_request: str,
    topic: str,
    profile: dict,
    resources: list[dict],
    weak: list[str],
    *,
    deep: bool,
    learner_analysis_brief: str = "",
    activate_first: bool = True,
    quality_replan: bool = False,
) -> list[dict] | None:
    llm = get_primary_llm()
    if llm.use_mock:
        return None
    planning_deep = deep or quality_replan
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": path_planning_system(planning_deep, quality_replan=quality_replan)},
                {
                    "role": "user",
                    "content": path_planning_user_payload(
                        user_request=user_request,
                        topic=topic,
                        profile=profile,
                        resources=resources,
                        weak_topics=weak,
                        learner_analysis_brief=learner_analysis_brief,
                    ),
                },
            ],
            temperature=0.3 if quality_replan else (0.35 if planning_deep else 0.5),
            deep_thinking=planning_deep,
            task="path",
        )
        steps = _parse_steps_json(raw)
        if not steps:
            return None
        valid_ids = {r.get("id") for r in resources if r.get("id")}
        resource_ids = [r.get("id", "") for r in resources if r.get("id")]
        normalized = normalize_step_tree(
            steps,
            valid_ids=valid_ids,
            default_resource_ids=resource_ids,
            activate_first=activate_first,
        )
        return finalize_path_steps(normalized, activate_first=activate_first) if normalized else None
    except Exception:
        return None


async def _llm_plan_by_topic(
    user_request: str,
    topic: str,
    profile: dict,
    weak: list[str],
    *,
    deep: bool,
    learner_analysis_brief: str = "",
    activate_first: bool = True,
    quality_replan: bool = False,
) -> list[dict] | None:
    llm = get_primary_llm()
    if llm.use_mock:
        return None
    planning_deep = deep or quality_replan
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": path_planning_topic_system(planning_deep, quality_replan=quality_replan)},
                {
                    "role": "user",
                    "content": path_planning_topic_user_payload(
                        user_request=user_request,
                        topic=topic,
                        profile=profile,
                        weak_topics=weak,
                        learner_analysis_brief=learner_analysis_brief,
                    ),
                },
            ],
            temperature=0.3 if quality_replan else (0.35 if planning_deep else 0.5),
            deep_thinking=planning_deep,
            task="path",
        )
        steps = _parse_steps_json(raw)
        if not steps:
            return None
        normalized = normalize_step_tree(
            steps,
            valid_ids=set(),
            default_resource_ids=[],
            activate_first=activate_first,
        )
        return finalize_path_steps(normalized, activate_first=activate_first) if normalized else None
    except Exception:
        return None


async def _apply_quality_replan_passes(
    steps: list[dict],
    *,
    user_request: str,
    topic: str,
    profile: dict,
    resources: list[dict],
    weak: list[str],
    learner_analysis_brief: str,
    resource_ids: list[str],
    activate_first: bool,
) -> list[dict]:
    if not steps:
        return steps

    issues = collect_plan_quality_issues(steps, resource_ids)
    refined = await _llm_refine_plan(
        steps,
        user_request=user_request,
        topic=topic,
        profile=profile,
        resources=resources,
        weak=weak,
        learner_analysis_brief=learner_analysis_brief,
        quality_issues=issues or ["请整体优化路径质量、阶段递进与目标可执行性"],
        activate_first=activate_first,
    )
    if refined:
        steps = refined

    remaining = collect_plan_quality_issues(steps, resource_ids)
    if remaining:
        refined2 = await _llm_refine_plan(
            steps,
            user_request=user_request,
            topic=topic,
            profile=profile,
            resources=resources,
            weak=weak,
            learner_analysis_brief=learner_analysis_brief,
            quality_issues=remaining,
            activate_first=activate_first,
        )
        if refined2:
            steps = refined2

    return steps


def _fallback_narrative(topic: str, steps: list[dict], *, has_resources: bool) -> str:
    flat = flatten_steps(steps)
    lines = [f"已为你规划 **{topic}** 的分层学习路径（共 {len(flat)} 个节点，{len(steps)} 个主阶段）：\n"]
    for step in steps:
        mins = step.get("estimated_minutes") or 45
        lines.append(
            f"### {step.get('title')}\n"
            f"- **目标**：{step.get('objective')}\n"
            f"- **建议用时**：约 {mins} 分钟\n"
        )
        for sub in step.get("substeps") or []:
            lines.append(
                f"  - **{sub.get('title')}**（约 {sub.get('estimated_minutes', 20)} 分钟）："
                f"{sub.get('objective', '')}\n"
            )
    if not has_resources:
        lines.append(
            "\n> 当前路径为 AI 规划框架，尚未关联资源库资料。"
            "可在「资源库」生成相关文档/题库后，再次对话「重新规划」以自动关联。"
        )
    else:
        lines.append("\n> 详细步骤已同步至「学习路径」页，可按主阶段与子步骤推进。")
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
    fresh_path = bool(state.get("fresh_path"))
    quality_replan = bool(state.get("quality_replan"))
    skip_narrative = bool(state.get("skip_narrative"))
    old_path = None if fresh_path else await get_path(user_id)
    old_steps = (old_path or {}).get("steps") or []
    deep = bool(state.get("deep_thinking")) or quality_replan

    user_request = _user_message(state)
    topic = _infer_topic(user_request, str(state.get("topic") or ""))
    analysis_brief = _analysis_brief(state)

    resource_ids = [r.get("id", "") for r in resources if r.get("id")]

    activate_first = not fresh_path

    if resource_ids:
        steps = await _llm_plan_with_resources(
            user_request,
            topic,
            profile,
            resources,
            weak,
            deep=deep,
            learner_analysis_brief=analysis_brief,
            activate_first=activate_first,
            quality_replan=quality_replan,
        )
    else:
        steps = await _llm_plan_by_topic(
            user_request,
            topic,
            profile,
            weak,
            deep=deep,
            learner_analysis_brief=analysis_brief,
            activate_first=activate_first,
            quality_replan=quality_replan,
        )

    if not steps:
        steps = _default_steps(topic, weak, resources, activate_first=activate_first)

    if quality_replan:
        steps = await _apply_quality_replan_passes(
            steps,
            user_request=user_request,
            topic=topic,
            profile=profile,
            resources=resources,
            weak=weak,
            learner_analysis_brief=analysis_brief,
            resource_ids=resource_ids,
            activate_first=activate_first,
        )

    if not fresh_path:
        steps = merge_step_status(old_steps, steps)
    steps = finalize_path_steps(steps, activate_first=activate_first)

    version = 1 if fresh_path else (old_path or {}).get("version", 0) + 1
    path = {"user_id": user_id, "steps": steps, "version": version}
    await save_path(path)

    flat = flatten_steps(steps)
    if skip_narrative:
        reply = filter_sensitive(
            f"已生成 **{len(steps)}** 个主阶段（共 **{len(flat)}** 个学习节点）的高质量学习路径。"
        )
        return {"path": path, "reply": reply}

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
            f"\n\n---\n📌 已在「学习路径」保存 **{len(steps)}** 个主阶段（共 **{len(flat)}** 个学习节点），"
            f"关联 **{len(resource_ids)}** 项资源。"
        )
    else:
        reply += (
            f"\n\n---\n📌 路径框架（**{len(steps)}** 个主阶段、**{len(flat)}** 个节点）"
            f"已保存至「学习路径」页，可按章节与子步骤标记进度。"
        )

    return {"path": path, "reply": reply}
