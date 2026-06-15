import {
  EXTENDED_RESOURCE_TYPES,
  GENERATABLE_RESOURCE_TYPES,
  STANDARD_RESOURCE_TYPES,
} from "@/lib/resourceConfig";

export const MAX_RESOURCE_GEN_PER_TYPE = 3;

export type ResourceGenTypeCounts = Record<string, number>;

export function emptyGenTypeCounts(): ResourceGenTypeCounts {
  return Object.fromEntries(GENERATABLE_RESOURCE_TYPES.map(({ api }) => [api, 0]));
}

export function buildGenTypeCounts(
  preset: Partial<ResourceGenTypeCounts>
): ResourceGenTypeCounts {
  const base = emptyGenTypeCounts();
  for (const [key, value] of Object.entries(preset)) {
    if (!(key in base)) continue;
    base[key] = clampGenTypeCount(value);
  }
  return base;
}

export function standardGenTypeCounts(): ResourceGenTypeCounts {
  return buildGenTypeCounts(
    Object.fromEntries(STANDARD_RESOURCE_TYPES.map((api) => [api, 1]))
  );
}

export function allGenTypeCounts(count = 1): ResourceGenTypeCounts {
  return buildGenTypeCounts(
    Object.fromEntries(EXTENDED_RESOURCE_TYPES.map((api) => [api, count]))
  );
}

export function clampGenTypeCount(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_RESOURCE_GEN_PER_TYPE, Math.round(n)));
}

export function normalizeGenTypeCounts(counts: ResourceGenTypeCounts): ResourceGenTypeCounts {
  const next = emptyGenTypeCounts();
  for (const { api } of GENERATABLE_RESOURCE_TYPES) {
    const value = clampGenTypeCount(counts[api]);
    if (value > 0) next[api] = value;
  }
  return next;
}

export function totalGenCount(counts: ResourceGenTypeCounts): number {
  return Object.values(normalizeGenTypeCounts(counts)).reduce((sum, n) => sum + n, 0);
}

export function expandGenTypeCounts(counts: ResourceGenTypeCounts): string[] {
  const jobs: string[] = [];
  for (const { api } of GENERATABLE_RESOURCE_TYPES) {
    const n = clampGenTypeCount(counts[api]);
    for (let i = 0; i < n; i += 1) jobs.push(api);
  }
  return jobs;
}

export function buildGenProgressStages(
  counts: ResourceGenTypeCounts,
  webMode: boolean,
  deepThinking: boolean
): string[] {
  const stages = ["context"];
  if (webMode) stages.push("web_research");
  stages.push(deepThinking ? "deep_thinking" : "fast_resource");
  for (const { api } of GENERATABLE_RESOURCE_TYPES) {
    const total = clampGenTypeCount(counts[api]);
    for (let variant = 1; variant <= total; variant += 1) {
      stages.push(total > 1 ? `${api}:${variant}` : api);
    }
  }
  stages.push("reviewer");
  return stages;
}

export function formatGenStageLabel(
  stage: string,
  labels: Record<string, string>,
  meta?: { resource_type?: string; variant?: number; variant_total?: number }
): string {
  const resourceType = meta?.resource_type || stage.split(":")[0];
  const base = labels[resourceType] || resourceType;
  const variant = meta?.variant;
  const variantTotal = meta?.variant_total;
  if (variantTotal && variantTotal > 1 && variant) {
    return `${base}（${variant}/${variantTotal}）`;
  }
  if (stage.includes(":")) {
    const [, suffix] = stage.split(":");
    return `${base}（${suffix}）`;
  }
  return base;
}
