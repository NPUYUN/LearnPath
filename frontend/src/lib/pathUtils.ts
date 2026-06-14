import type { PathStep } from "@/lib/api";

export function flattenPathSteps(steps: PathStep[] | undefined): PathStep[] {
  if (!steps?.length) return [];
  const out: PathStep[] = [];
  const walk = (nodes: PathStep[]) => {
    for (const node of nodes) {
      out.push(node);
      if (node.substeps?.length) walk(node.substeps);
    }
  };
  walk(steps);
  return out;
}

export function getStepKey(step: PathStep): string {
  return step.id || String(step.order);
}

export function pathProgressPercent(steps: PathStep[] | undefined): number {
  const flat = flattenPathSteps(steps);
  if (!flat.length) return 0;
  const score = flat.reduce((sum, st) => {
    if (st.status === "done" || st.status === "completed") return sum + 100;
    return sum;
  }, 0);
  return Math.round(score / flat.length);
}

export function countStepResources(step: PathStep): number {
  let n = step.resource_ids?.length ?? 0;
  for (const sub of step.substeps ?? []) {
    n += countStepResources(sub);
  }
  return n;
}

export function collectStepResourceIds(step: PathStep): string[] {
  const ids = [...(step.resource_ids ?? [])];
  for (const sub of step.substeps ?? []) {
    ids.push(...collectStepResourceIds(sub));
  }
  return ids;
}
