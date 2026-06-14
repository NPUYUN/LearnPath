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
    return round(score / len(flat))


def all_resource_ids(steps: list[dict]) -> set[str]:
    ids: set[str] = set()

    def walk(nodes: list[dict]) -> None:
        for node in nodes:
            ids.update(x for x in (node.get("resource_ids") or []) if x)
            walk(node.get("substeps") or [])

    walk(steps)
    return ids


def _collect_leaf_steps(nodes: list[dict]) -> list[dict]:
    """收集可挂载资源的叶子子步骤。"""
    leaves: list[dict] = []
    for node in nodes:
        children = node.get("substeps") or []
        if children:
            leaves.extend(_collect_leaf_steps(children))
        else:
            leaves.append(node)
    return leaves


def clear_step_resources(node: dict) -> None:
    node["resource_ids"] = []
    for child in node.get("substeps") or []:
        clear_step_resources(child)


def redistribute_resources_to_substeps(steps: list[dict]) -> None:
    """将父步骤上的 resource_ids 下沉到子步骤（就地修改）。"""
    for step in steps:
        substeps = step.get("substeps") or []
        for sub in substeps:
            redistribute_resources_to_substeps([sub])

        if not substeps:
            continue

        pooled = [rid for rid in (step.get("resource_ids") or []) if rid]
        step["resource_ids"] = []
        if not pooled:
            continue

        targets = _collect_leaf_steps(substeps) or substeps
        for i, rid in enumerate(pooled):
            target = targets[i % len(targets)]
            existing = [x for x in (target.get("resource_ids") or []) if x]
            if rid not in existing:
                existing.append(rid)
                target["resource_ids"] = existing


def ensure_substeps_for_resources(stage: dict, items: list[dict]) -> bool:
    """主阶段无子步骤时，按配套资源自动生成子步骤。"""
    if stage.get("substeps"):
        return False
    if not items:
        return False

    parent_id = str(stage.get("id") or stage.get("order") or "").strip()
    prefix = f"{parent_id}." if parent_id else ""
    substeps: list[dict] = []
    for j, item in enumerate(items, start=1):
        title = str(item.get("title") or f"配套资源 {j}")[:36]
        substeps.append(
            {
                "id": f"{prefix}{j}" if prefix else str(j),
                "order": j,
                "title": title,
                "objective": f"学习「{title}」并完成相关练习",
                "resource_ids": [],
                "estimated_minutes": 25,
                "status": "pending",
                "substeps": [],
            }
        )
    stage["substeps"] = substeps
    return True


def assign_resources_to_stage(stage: dict, resource_ids: list[str]) -> list[dict[str, Any]]:
    """把资源挂到子步骤；无子步骤时挂到主阶段。返回各节点分配摘要。"""
    normalized = [rid for rid in resource_ids if rid]
    clear_step_resources(stage)
    if not normalized:
        return []

    substeps = stage.get("substeps") or []
    if not substeps:
        stage["resource_ids"] = normalized
        sid = str(stage.get("id") or "")
        return [{"step_id": sid, "resource_ids": normalized}]

    targets = _collect_leaf_steps(substeps) or substeps
    by_step: dict[str, list[str]] = {}
    for i, rid in enumerate(normalized):
        target = targets[i % len(targets)]
        existing = [x for x in (target.get("resource_ids") or []) if x]
        if rid not in existing:
            existing.append(rid)
            target["resource_ids"] = existing
        sid = str(target.get("id") or f"sub-{i + 1}")
        by_step[sid] = list(target.get("resource_ids") or [])

    return [{"step_id": sid, "resource_ids": rids} for sid, rids in by_step.items()]


def set_resource_ids_to_step(steps: list[dict], step_id: str, resource_ids: list[str]) -> bool:
    located = find_step_by_id(steps, step_id)
    if not located:
        return False
    normalized = [rid for rid in resource_ids if rid]
    if located.get("resource_ids") == normalized:
        return False
    located["resource_ids"] = normalized
    return True


def append_resource_ids_to_step(steps: list[dict], step_id: str, resource_ids: list[str]) -> bool:
    located = find_step_by_id(steps, step_id)
    if not located:
        return False
    existing = list(located.get("resource_ids") or [])
    changed = False
    for rid in resource_ids:
        if rid and rid not in existing:
            existing.append(rid)
            changed = True
    if changed:
        located["resource_ids"] = existing
    return changed


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
    activate_first: bool = True,
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
            activate_first=activate_first,
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

    if depth == 0 and normalized and activate_first:
        normalized[0]["status"] = "in_progress"

    return normalized or None


def finalize_path_steps(steps: list[dict], *, activate_first: bool = True) -> list[dict]:
    assign_step_ids(steps)
    redistribute_resources_to_substeps(steps)
    if (
        activate_first
        and steps
        and not any(s.get("status") == "in_progress" for s in flatten_steps(steps))
    ):
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
