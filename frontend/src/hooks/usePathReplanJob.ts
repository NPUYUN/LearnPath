"use client";

import { message } from "antd";
import { createPathReplanJob } from "@/lib/api";
import { persistActivePathReplan } from "@/lib/pathReplanActive";
import { useAppStore } from "@/store/appStore";

export function usePathReplanJob() {
  const userId = useAppStore((s) => s.userId);
  const job = useAppStore((s) => s.pathReplanJob);
  const isRunning =
    job?.status === "queued" || job?.status === "running";

  const startPathReplan = async (options?: {
    libraryId?: string | null;
    conversationId?: string | null;
    learningGoal?: string | null;
  }) => {
    if (isRunning) {
      message.warning("已有重规划任务进行中");
      return false;
    }

    try {
      const created = await createPathReplanJob(userId, options);
      persistActivePathReplan({ jobId: created.id, userId, libraryId: options?.libraryId });
      useAppStore.setState({
        learningPath: null,
        resources: [],
        resourceTitles: {},
        pathReplanJob: created,
        pathReplanPanelMode: "fullscreen",
        pathReplanFading: false,
      });
      return true;
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "启动重规划失败");
      return false;
    }
  };

  return { job, isRunning, startPathReplan };
}
