import type { EvalStats, LearningPath, LearningResource } from "@/lib/api";
import { flattenPathSteps, getStepKey } from "@/lib/pathUtils";

export type DailyMinimumTask = {
  key: "path" | "review" | "quiz";
  label: string;
  title: string;
  subtitle: string;
  done: boolean;
  resourceId?: string;
  stepKey?: string;
  fallbackRoute?: "/resources" | "/path";
};

export function buildDailyMinimumTasks(
  path: LearningPath | null,
  resources: LearningResource[],
  evalStats?: EvalStats | null,
): DailyMinimumTask[] {
  const steps = flattenPathSteps(path?.steps);
  const pressureMode = evalStats?.pressure_balance?.mode || "balanced";
  const activeStep =
    steps.find((s) => s.status === "in_progress") ??
    (pressureMode === "review_heavy" ? undefined : steps.find((s) => s.status === "pending")) ??
    steps.find((s) => s.status === "pending") ??
    steps[0];

  // 保留原“1 个路径步骤 + 1 份复习 + 1 组小测”的结构，只把资源优先级改成当前节点优先。
  const activeResourceIds = new Set(activeStep?.resource_ids || []);
  const stageResources = resources.filter((r) => activeResourceIds.has(r.id));
  const reviewCard =
    stageResources.find((r) => r.type === "review_card") ??
    resources.find((r) => r.type === "review_card");
  const quiz =
    stageResources.find((r) => r.type === "quiz" || r.type === "mcq") ??
    resources.find((r) => r.type === "quiz" || r.type === "mcq");

  return [
    {
      key: "path",
      label: "路径步骤",
      title:
        pressureMode === "review_heavy"
          ? activeStep?.title || "先清待复习，再开启新内容"
          : activeStep?.title || "继续学习路径",
      subtitle: activeStep
        ? activeStep.status === "done"
          ? "本节点已完成，可进入下一步"
          : pressureMode === "review_heavy"
            ? "今日复习压力较高，建议先完成复习与小测"
            : pressureMode === "new_learning"
              ? "今日适合推进新内容"
              : "推进当前学习节点"
        : pressureMode === "review_heavy"
          ? "今日建议以复习为主"
          : "暂无路径节点",
      done: activeStep?.status === "done",
      stepKey: activeStep ? getStepKey(activeStep) : undefined,
    },
    {
      key: "review",
      label: "复习资源",
      title: reviewCard?.title || "去资源库生成复习卡",
      subtitle:
        pressureMode === "review_heavy"
          ? `建议优先完成${evalStats?.pressure_balance?.recommended_review_minutes || 15}分钟复习`
          : reviewCard?.topic
            ? `主题：${reviewCard.topic}`
            : "巩固今日所学要点",
      done: false,
      resourceId: reviewCard?.id,
      fallbackRoute: "/resources",
    },
    {
      key: "quiz",
      label: "小测验",
      title: quiz?.title || "找一组练习测验",
      subtitle:
        quiz
          ? pressureMode === "new_learning"
            ? "用小测检验新学内容是否真正掌握"
            : "完成快问快答检验掌握度"
          : "资源库中暂无测验资源",
      done: false,
      resourceId: quiz?.id,
      fallbackRoute: "/resources",
    },
  ];
}
