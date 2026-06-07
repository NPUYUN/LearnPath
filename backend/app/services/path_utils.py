"""学习路径树形结构：嵌套子路径、进度与状态合并。"""

from __future__ import annotations

from typing import Any, Literal

MAX_TOP_LEVEL_STEPS = 12
MAX_PATH_DEPTH = 4
MAX_PATH_NODES = 48

PathStatus = Literal["pending", "in_progress", "done"]


def assign_step_ids(steps: list[dict], prefix: str = "") -> None:
    for i, step in enumerate(steps, start=1):
        sid = f"{prefix}{i}" if prefix else str(i)
        step["id"] = sid
        substeps = step.get("substeps") or []
        if substeps:
            assign_step_ids(substeps, f"{sid}.")


def flatten_steps(steps: list[dict]) -> list[dict]:
    out: list[dict] = []

    def walk(nodes: list[dict]) -> None:
        for node in nodes:
            out.append(node)
            walk(node.get("substeps") or [])

    walk(steps)
    return out


def collect_status_map(steps: list[dict]) -> dict[str, str]:
    return {s["id"]: s.get("status", "pending") for s in flatten_steps(steps) if s.get("id")}


def find_step_by_id(steps: list[dict], step_id: str) -> dict | None:
    for step in steps:
        if step.get("id") == step_id:
            return step
        found = find_step_by_id(step.get("substeps") or [], step_id)
        if found:
            return found
    return None


def find_parent_steps(steps: list[dict], step_id: str) -> tuple[list[dict], dict] | None:
    for step in steps:
        if step.get("id") == step_id:
            return steps, step
        substeps = step.get("substeps") or []
        for child in substeps:
            if child.get("id") == step_id:
                return substeps, child
        deeper = find_parent_steps(substeps, step_id)
        if deeper:
            return deeper
    return None


def iter_steps_preorder(steps: list[dict]):
    for step in steps:
        yield step
        yield from iter_steps_preorder(step.get("substeps") or [])


def next_step_after(steps: list[dict], step_id: str) -> dict | None:
    flat = list(iter_steps_preorder(steps))
    ids = [s.get("id") for s in flat]
    if step_id not in ids:
        return None
    idx = ids.index(step_id)
    for candidate in flat[idx + 1 :]:
        if candidate.get("status") != "done":
            return candidate
    return None


def merge_step_status(old_steps: list[dict], new_steps: list[dict]) -> list[dict]:
    status_map = collect_status_map(old_steps)

    def apply(nodes: list[dict]) -> None:
        for node in nodes:
            sid = node.get("id")
            if sid and status_map.get(sid) == "done":
                node["status"] = "done"
            apply(node.get("substeps") or [])

    apply(new_steps)
    return new_steps


def compute_progress(steps: list[dict]) -> int:
    flat = flatten_steps(steps)
    if not flat:
        return 0
    score = 0
    for step in flat:
        st = step.get("status", "pending")
        if st == "done":
            score += 100
        elif st == "in_progress":
            score += 50
    return round(score / len(flat))


def all_resource_ids(steps: list[dict]) -> set[str]:
    ids: set[str] = set()

    def walk(nodes: list[dict]) -> None:
        for node in nodes:
            ids.update(x for x in (node.get("resource_ids") or []) if x)
            walk(node.get("substeps") or [])

    walk(steps)
    return ids


def remove_resource_from_steps(steps: list[dict], resource_id: str) -> bool:
    changed = False

    def walk(nodes: list[dict]) -> None:
        nonlocal changed
        for node in nodes:
            rids = node.get("resource_ids") or []
            if resource_id in rids:
                node["resource_ids"] = [x for x in rids if x != resource_id]
                changed = True
            walk(node.get("substeps") or [])

    walk(steps)
    return changed


def _coerce_substeps(raw: Any) -> list:
    if not isinstance(raw, list):
        return []
    return raw


def normalize_step_tree(
    raw_steps: list,
    *,
    valid_ids: set[str],
    default_resource_ids: list[str],
    depth: int = 0,
    node_budget: list[int] | None = None,
) -> list[dict] | None:
    """将 LLM 输出规范为带 substeps 的路径树。"""
    if node_budget is None:
        node_budget = [MAX_PATH_NODES]
    if depth >= MAX_PATH_DEPTH or node_budget[0] <= 0:
        return []

    normalized: list[dict] = []
    limit = MAX_TOP_LEVEL_STEPS if depth == 0 else 8

    for i, step in enumerate(raw_steps[:limit], start=1):
        if not isinstance(step, dict):
            continue
        if node_budget[0] <= 0:
            break
        node_budget[0] -= 1

        rids = [x for x in (step.get("resource_ids") or []) if x in valid_ids]
        substeps_raw = _coerce_substeps(step.get("substeps"))
        child_nodes = normalize_step_tree(
            substeps_raw,
            valid_ids=valid_ids,
            default_resource_ids=default_resource_ids,
            depth=depth + 1,
            node_budget=node_budget,
        )

        if valid_ids and not rids and not child_nodes:
            idx = min(i - 1, max(0, len(default_resource_ids) - 1))
            if default_resource_ids:
                rids = [default_resource_ids[idx]]

        normalized.append(
            {
                "order": i,
                "title": str(step.get("title") or f"阶段 {i}")[:40],
                "objective": str(step.get("objective") or "按阶段推进学习")[:320],
                "resource_ids": rids,
                "estimated_minutes": max(10, int(step.get("estimated_minutes") or 30)),
                "status": "pending",
                "substeps": child_nodes or [],
            }
        )

    if depth == 0 and normalized:
        normalized[0]["status"] = "in_progress"

    return normalized or None


def finalize_path_steps(steps: list[dict]) -> list[dict]:
    assign_step_ids(steps)
    if steps and not any(s.get("status") == "in_progress" for s in flatten_steps(steps)):
        for step in iter_steps_preorder(steps):
            if step.get("status") != "done":
                step["status"] = "in_progress"
                break
    return steps


def apply_step_status_update(steps: list[dict], step_id: str, status: PathStatus) -> bool:
    located = find_step_by_id(steps, step_id)
    if not located:
        return False
    located["status"] = status
    if status == "done":
        nxt = next_step_after(steps, step_id)
        if nxt and nxt.get("status") == "pending":
            nxt["status"] = "in_progress"
    elif status == "in_progress":
        for step in flatten_steps(steps):
            if step.get("id") != step_id and step.get("status") == "in_progress":
                step["status"] = "pending"
    return True


def slim_steps_for_prompt(steps: list[dict], *, max_depth: int = 3) -> list[dict]:
    def slim(node: dict, depth: int) -> dict:
        item: dict[str, Any] = {
            "id": node.get("id"),
            "order": node.get("order"),
            "title": node.get("title"),
            "objective": node.get("objective"),
            "estimated_minutes": node.get("estimated_minutes"),
        }
        if depth < max_depth:
            children = node.get("substeps") or []
            if children:
                item["substeps"] = [slim(c, depth + 1) for c in children]
        return item

    return [slim(s, 0) for s in steps]
