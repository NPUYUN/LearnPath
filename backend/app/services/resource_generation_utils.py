"""资源批量生成：类型数量解析与任务展开。"""

from __future__ import annotations

MAX_RESOURCE_GEN_PER_TYPE = 3

GENERATION_TYPE_ORDER = [
    "doc",
    "mindmap",
    "quiz",
    "reading",
    "media",
    "code",
    "ppt",
    "design",
    "project",
]

DEFAULT_RESOURCE_TYPE_COUNTS: dict[str, int] = {
    "doc": 1,
    "mindmap": 1,
    "quiz": 1,
    "reading": 1,
    "media": 1,
    "code": 1,
}


def clamp_type_count(value: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(MAX_RESOURCE_GEN_PER_TYPE, n))


def normalize_resource_type_counts(
    counts: dict[str, int] | None,
    types: list[str] | None = None,
) -> dict[str, int]:
    if counts:
        normalized = {
            str(k): clamp_type_count(v)
            for k, v in counts.items()
            if clamp_type_count(v) > 0
        }
        if normalized:
            return normalized
    if types:
        return {str(t): 1 for t in types if str(t).strip()}
    return dict(DEFAULT_RESOURCE_TYPE_COUNTS)


def expand_resource_jobs(counts: dict[str, int]) -> list[tuple[str, int]]:
    """返回 (resource_type, variant_index) 列表，variant_index 从 1 开始。"""
    order = [t for t in GENERATION_TYPE_ORDER if t in counts]
    order.extend(t for t in counts if t not in GENERATION_TYPE_ORDER)
    jobs: list[tuple[str, int]] = []
    for rt in order:
        total = clamp_type_count(counts.get(rt, 0))
        for variant in range(1, total + 1):
            jobs.append((rt, variant))
    return jobs


def resource_jobs_to_types(jobs: list[tuple[str, int]]) -> list[str]:
    return [rt for rt, _ in jobs]


def progress_stage_key(resource_type: str, variant: int, variant_total: int) -> str:
    if variant_total <= 1:
        return resource_type
    return f"{resource_type}:{variant}"


def resource_generation_stage_plan(
    gen_ctx: dict,
    jobs: list[tuple[str, int]],
    deep_thinking: bool,
) -> list[str]:
    stages: list[str] = ["context"]
    if gen_ctx.get("mode") == "web":
        stages.append("web_research")
    stages.append("deep_thinking" if deep_thinking else "fast_resource")
    for rt, variant in jobs:
        total = sum(1 for t, _ in jobs if t == rt)
        stages.append(progress_stage_key(rt, variant, total))
    stages.append("reviewer")
    return stages
