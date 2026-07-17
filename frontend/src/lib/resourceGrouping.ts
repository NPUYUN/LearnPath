import type { LearningPath, LearningResource, PathStep } from "@/lib/api";
import {
  RESOURCE_CONFIG,
  mapApiType,
  type UiResourceType,
} from "@/lib/resourceConfig";

export type StageStatus = "done" | "in_progress" | "pending";

export type ResourceCategoryGroup = {
  type: UiResourceType;
  label: string;
  color: string;
  resources: LearningResource[];
};

export type ResourceStageGroup = {
  id: string;
  kind: "path" | "topic" | "archive";
  order: number;
  title: string;
  objective: string;
  status: StageStatus;
  estimatedMinutes: number;
  categories: ResourceCategoryGroup[];
  resourceCount: number;
};

export type GroupedResources = {
  stages: ResourceStageGroup[];
  unassigned: LearningResource[];
};

function mapStepStatus(status: string): StageStatus {
  if (status === "done") return "done";
  if (status === "in_progress") return "in_progress";
  return "pending";
}

function buildCategoryGroups(resources: LearningResource[]): ResourceCategoryGroup[] {
  const byType = new Map<UiResourceType, LearningResource[]>();
  for (const r of resources) {
    const ui = mapApiType(r.type);
    const list = byType.get(ui) || [];
    list.push(r);
    byType.set(ui, list);
  }

  const typeOrder: UiResourceType[] = [
    "document",
    "mindmap",
    "ppt",
    "video",
    "reading",
    "quiz",
    "code",
    "design",
    "project",
  ];

  return typeOrder
    .filter((t) => byType.has(t))
    .map((type) => {
      const cfg = RESOURCE_CONFIG[type];
      return {
        type,
        label: cfg.label,
        color: cfg.color,
        resources: byType.get(type)!,
      };
    });
}

function topicMatchesStep(topic: string, step: PathStep): boolean {
  const t = topic.trim().toLowerCase();
  if (!t) return false;
  const title = step.title.toLowerCase();
  const objective = (step.objective || "").toLowerCase();
  return title.includes(t) || t.includes(title.slice(0, 4)) || objective.includes(t);
}

function collectStepResourceIds(step: PathStep): Set<string> {
  return new Set(
    [
      ...(step.resource_ids ?? []),
      ...(step.substeps ?? []).flatMap((substep) => [
        ...(substep.resource_ids ?? []),
        ...(substep.substeps ?? []).flatMap((nested) => nested.resource_ids ?? []),
      ]),
    ].filter(Boolean)
  );
}

function buildStageGroup(step: PathStep, resources: LearningResource[]): ResourceStageGroup {
  const unique = Array.from(new Map(resources.map((resource) => [resource.id, resource])).values());

  return {
    id: `step-${step.id ?? step.order}`,
    kind: "path",
    order: step.order,
    title: step.title,
    objective: step.objective,
    status: mapStepStatus(step.status),
    estimatedMinutes: step.estimated_minutes,
    categories: buildCategoryGroups(unique),
    resourceCount: unique.length,
  };
}

function synthesizeStagesFromTopics(resources: LearningResource[]): ResourceStageGroup[] {
  const byTopic = new Map<string, LearningResource[]>();
  for (const r of resources) {
    const key = r.topic?.trim() || "综合学习";
    const list = byTopic.get(key) || [];
    list.push(r);
    byTopic.set(key, list);
  }

  return Array.from(byTopic.entries()).map(([topic, list], idx) => ({
    id: `topic-${idx}`,
    kind: "topic" as const,
    order: idx + 1,
    title: topic,
    objective: "按主题自动归类的学习资源",
    status: "pending" as StageStatus,
    estimatedMinutes: 0,
    categories: buildCategoryGroups(list),
    resourceCount: list.length,
  }));
}

/** 按学习路径阶段 + 资源类别分组 */
export function groupResourcesByStage(
  resources: LearningResource[],
  learningPath: LearningPath | null
): GroupedResources {
  if (!resources.length) {
    return { stages: [], unassigned: [] };
  }

  let stages: ResourceStageGroup[] = [];
  let unassigned: LearningResource[] = [];

  if (learningPath?.steps?.length) {
    const steps = learningPath.steps;
    const explicitIds = steps.map(collectStepResourceIds);
    const stageResources = steps.map(() => [] as LearningResource[]);

    for (const resource of resources) {
      let stageIndex = explicitIds.findIndex((ids) => ids.has(resource.id));
      if (stageIndex < 0) {
        stageIndex = steps.findIndex((step) => topicMatchesStep(resource.topic, step));
      }
      if (stageIndex >= 0) {
        stageResources[stageIndex].push(resource);
      } else {
        unassigned.push(resource);
      }
    }

    stages = steps.map((step, index) => buildStageGroup(step, stageResources[index]));
  } else {
    stages = synthesizeStagesFromTopics(resources);
    unassigned = [];
  }

  if (unassigned.length && learningPath?.steps?.length) {
    stages.push({
      id: "unassigned",
      kind: "archive",
      order: 0,
      title: "历史资源",
      objective: "保留在资源库中，但尚未关联到当前学习路径",
      status: "pending",
      estimatedMinutes: 0,
      categories: buildCategoryGroups(unassigned),
      resourceCount: unassigned.length,
    });
    return { stages, unassigned: [] };
  }

  return { stages, unassigned };
}

export function filterGroupedResources(
  grouped: GroupedResources,
  opts: { search: string; category: string }
): GroupedResources {
  const q = opts.search.trim().toLowerCase();
  const cat = opts.category;

  const matchResource = (r: LearningResource) => {
    const ui = mapApiType(r.type);
    if (cat !== "all" && ui !== cat) return false;
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      r.topic.toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q)
    );
  };

  const stages = grouped.stages
    .map((stage) => {
      const categories = stage.categories
        .map((c) => ({
          ...c,
          resources: c.resources.filter(matchResource),
        }))
        .filter((c) => c.resources.length > 0);
      const resourceCount = categories.reduce((n, c) => n + c.resources.length, 0);
      return { ...stage, categories, resourceCount };
    })
    .filter((s) => s.resourceCount > 0);

  const unassigned = grouped.unassigned.filter(matchResource);

  return { stages, unassigned };
}

export const STAGE_STATUS_META: Record<
  StageStatus,
  { label: string; color: string; glow: string }
> = {
  done: { label: "已完成", color: "#52c41a", glow: "rgba(82, 196, 26, 0.35)" },
  in_progress: { label: "进行中", color: "#1677ff", glow: "rgba(22, 119, 255, 0.35)" },
  pending: { label: "待开始", color: "#94a3b8", glow: "rgba(148, 163, 184, 0.25)" },
};
