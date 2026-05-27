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

function buildStageGroup(step: PathStep, resources: LearningResource[]): ResourceStageGroup {
  const idSet = new Set(step.resource_ids.filter(Boolean));
  const matched = resources.filter(
    (r) => idSet.has(r.id) || topicMatchesStep(r.topic, step)
  );
  const unique = Array.from(new Map(matched.map((r) => [r.id, r])).values());

  return {
    id: `step-${step.order}`,
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

  const assignedIds = new Set<string>();
  let stages: ResourceStageGroup[] = [];

  if (learningPath?.steps?.length) {
    stages = learningPath.steps.map((step) => {
      const group = buildStageGroup(step, resources);
      group.categories.forEach((cat) =>
        cat.resources.forEach((r) => assignedIds.add(r.id))
      );
      return group;
    });
  } else {
    stages = synthesizeStagesFromTopics(resources);
    stages.forEach((s) =>
      s.categories.forEach((cat) => cat.resources.forEach((r) => assignedIds.add(r.id)))
    );
  }

  const unassigned = resources.filter((r) => !assignedIds.has(r.id));

  if (unassigned.length && learningPath?.steps?.length) {
    stages.push({
      id: "unassigned",
      order: stages.length + 1,
      title: "待规划资源",
      objective: "尚未关联到学习路径，可在对话中请求更新路径",
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
