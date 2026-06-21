import type { LearningPath, LearningResource } from "@/lib/api";
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
): DailyMinimumTask[] {
  const steps = flattenPathSteps(path?.steps);
  const activeStep =
    steps.find((s) => s.status === "in_progress") ??
    steps.find((s) => s.status === "pending") ??
    steps[0];

  const reviewCard = resources.find((r) => r.type === "review_card");
  const quiz = resources.find((r) => r.type === "quiz" || r.type === "mcq");

  return [
    {
      key: "path",
      label: "路径步骤",
      title: activeStep?.title || "继续学习路径",
      subtitle: activeStep
        ? activeStep.status === "done"
          ? "本节点已完成，可进入下一步"
          : "推进当前学习节点"
        : "暂无路径节点",
      done: activeStep?.status === "done",
      stepKey: activeStep ? getStepKey(activeStep) : undefined,
    },
    {
      key: "review",
      label: "复习资源",
      title: reviewCard?.title || "去资源库生成复习卡",
      subtitle: reviewCard?.topic ? `主题：${reviewCard.topic}` : "巩固今日所学要点",
      done: false,
      resourceId: reviewCard?.id,
      fallbackRoute: "/resources",
    },
    {
      key: "quiz",
      label: "小测验",
      title: quiz?.title || "找一组练习测验",
      subtitle: quiz ? "完成快问快答检验掌握度" : "资源库中暂无测验资源",
      done: false,
      resourceId: quiz?.id,
      fallbackRoute: "/resources",
    },
  ];
}
