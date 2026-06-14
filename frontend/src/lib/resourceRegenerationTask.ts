"use client";

import { message } from "antd";
import { regenerateResource, type LearningResource } from "@/lib/api";
import { useAppStore } from "@/store/appStore";

const PROGRESS_STAGES = [
  { progress: 16, stage: "读取原资源与路径上下文" },
  { progress: 30, stage: "分析修改要求" },
  { progress: 48, stage: "生成新版资源内容" },
  { progress: 64, stage: "补齐例题与讲解结构" },
  { progress: 78, stage: "检查资源一致性" },
  { progress: 88, stage: "准备同步到资源库" },
];

function syncUpdatedResource(updated: LearningResource) {
  const store = useAppStore.getState();
  const exists = store.resources.some((item) => item.id === updated.id);
  const next = exists
    ? store.resources.map((item) => (item.id === updated.id ? updated : item))
    : [updated, ...store.resources];
  const titles: Record<string, string> = {};
  next.forEach((item) => {
    titles[item.id] = item.title;
  });
  store.setResources(next);
  store.setResourceTitles(titles);
}

export function startResourceRegenerationTask(params: {
  userId: string;
  resource: LearningResource;
  requirements: string;
  tags: string[];
}) {
  const store = useAppStore.getState();
  if (store.resourceRegenTask?.status === "running") {
    message.warning("已有资源正在后台重新生成，请稍后再试");
    return false;
  }

  const taskId = `${params.resource.id}-${Date.now()}`;
  store.setResourceRegenTask({
    id: taskId,
    resourceId: params.resource.id,
    title: params.resource.title,
    status: "running",
    progress: 8,
    stage: "已放入后台生成",
  });
  store.setResourceRegenPanelMode("open");
  message.success("已放到后台生成，你可以继续使用其他页面");

  let stageIndex = 0;
  const timer = window.setInterval(() => {
    const current = useAppStore.getState().resourceRegenTask;
    if (!current || current.id !== taskId || current.status !== "running") {
      window.clearInterval(timer);
      return;
    }
    const nextStage = PROGRESS_STAGES[Math.min(stageIndex, PROGRESS_STAGES.length - 1)];
    stageIndex += 1;
    useAppStore.getState().patchResourceRegenTask(nextStage);
    if (stageIndex >= PROGRESS_STAGES.length) {
      window.clearInterval(timer);
    }
  }, 1600);

  void regenerateResource(params.userId, params.resource.id, {
    requirements: params.requirements,
    tags: params.tags,
  })
    .then((updated) => {
      window.clearInterval(timer);
      syncUpdatedResource(updated);
      const current = useAppStore.getState().resourceRegenTask;
      if (!current || current.id !== taskId) return;
      useAppStore.getState().patchResourceRegenTask({
        status: "done",
        progress: 100,
        stage: "资源已同步到路径",
        updatedResource: updated,
      });
      message.success("资源已重新生成，路径引用已同步更新");
    })
    .catch((error: unknown) => {
      window.clearInterval(timer);
      const current = useAppStore.getState().resourceRegenTask;
      if (!current || current.id !== taskId) return;
      useAppStore.getState().patchResourceRegenTask({
        status: "error",
        progress: Math.max(current.progress, 12),
        stage: "重新生成失败",
        error: error instanceof Error ? error.message : "重新生成失败",
      });
      message.error(error instanceof Error ? error.message : "重新生成失败");
    });

  return true;
}
