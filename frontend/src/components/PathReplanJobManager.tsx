"use client";

import { useEffect, useRef } from "react";
import { message } from "antd";
import {
  getPath,
  getPathReplanJob,
  listResources,
  type PathReplanJob,
} from "@/lib/api";
import {
  isPathReplanDoneReminded,
  isPathReplanFloatDismissed,
  loadPersistedActivePathReplan,
  markPathReplanDoneReminded,
  persistActivePathReplan,
} from "@/lib/pathReplanActive";
import PathReplanFloat from "@/components/PathReplanFloat";
import PathReplanProgressHost from "@/components/PathReplanProgressHost";
import { pathReplanJobSnapshotEqual } from "@/lib/pathReplanJobUtils";
import { useAppStore } from "@/store/appStore";

async function applyReplanCompletion(job: PathReplanJob, userId: string) {
  const setLearningPath = useAppStore.getState().setLearningPath;
  const setResources = useAppStore.getState().setResources;
  const setResourceTitles = useAppStore.getState().setResourceTitles;

  try {
    const [path, resources] = await Promise.all([getPath(userId), listResources(userId)]);
    if (path) setLearningPath(path);
    setResources(resources);
    const titles: Record<string, string> = {};
    resources.forEach((r) => {
      if (r.id) titles[r.id] = r.title;
    });
    setResourceTitles(titles);
  } catch {
    /* 轮询 job 已完成，拉取失败时保留 store 现状 */
  }

  const r = job.result;
  const warnHint =
    r?.warnings?.length ? `（提示：${r.warnings.slice(0, 2).join("；")}）` : "";

  if (!isPathReplanDoneReminded(job.id)) {
    markPathReplanDoneReminded(job.id);
    if (r?.fallback_count && r.fallback_count > 0) {
      message.warning(
        `有 ${r.fallback_count} 项资源回退到模板生成，请检查 API Key 或稍后重试`,
        6,
      );
    }
    message.success(
      job.result_summary ||
        `重新规划完成：${r?.stage_count ?? 0} 个主阶段，${r?.linked_resource_count ?? 0} 项资源已关联` +
          warnHint,
      8,
    );
  }
}

export default function PathReplanJobManager() {
  const userId = useAppStore((s) => s.userId);
  const job = useAppStore((s) => s.pathReplanJob);
  const setJob = useAppStore((s) => s.setPathReplanJob);
  const setPanelMode = useAppStore((s) => s.setPathReplanPanelMode);
  const setFading = useAppStore((s) => s.setPathReplanFading);
  const clearPathReplan = useAppStore((s) => s.clearPathReplan);
  const lastJobId = useRef<string | null>(null);
  const completionHandled = useRef<string | null>(null);

  useEffect(() => {
    if (job?.id || typeof window === "undefined") return;
    const saved = loadPersistedActivePathReplan();
    if (!saved || saved.userId !== userId) return;

    let cancelled = false;
    void getPathReplanJob(saved.jobId)
      .then((restored) => {
        if (cancelled) return;
        if (restored.status === "queued" || restored.status === "running") {
          useAppStore.setState({
            learningPath: null,
            resources: [],
            resourceTitles: {},
          });
        }
        setJob(restored);
        if (restored.status === "done" || restored.status === "error") {
          setPanelMode(isPathReplanFloatDismissed(restored.id) ? "hidden" : "open");
        } else {
          setPanelMode("open");
        }
      })
      .catch(() => {
        clearPathReplan();
      });

    return () => {
      cancelled = true;
    };
  }, [clearPathReplan, job?.id, setJob, setPanelMode, userId]);

  useEffect(() => {
    if (!job?.id) return;
    persistActivePathReplan({ jobId: job.id, userId, libraryId: job.library_id || null });
  }, [job?.id, job?.library_id, userId]);

  useEffect(() => {
    if (!job?.id) return;
    if (job.status !== "queued" && job.status !== "running") return;

    const jobId = job.id;
    let cancelled = false;

    async function poll() {
      try {
        const next = await getPathReplanJob(jobId);
        if (cancelled) return;
        const prev = useAppStore.getState().pathReplanJob;
        if (prev && pathReplanJobSnapshotEqual(prev, next)) return;
        setJob(next);
      } catch {
        /* 保留最近状态 */
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 1600);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status, setJob]);

  useEffect(() => {
    if (!job?.id || job.id === lastJobId.current) return;
    lastJobId.current = job.id;
    completionHandled.current = null;
  }, [job?.id]);

  useEffect(() => {
    if (!job?.id || job.status !== "done") return;
    if (completionHandled.current === job.id) return;
    completionHandled.current = job.id;

    const jobId = job.id;
    const snapshot = useAppStore.getState().pathReplanJob;
    if (!snapshot) return;

    void (async () => {
      setFading(true);
      await new Promise((r) => window.setTimeout(r, 380));
      await applyReplanCompletion(snapshot, userId);
      setFading(false);
      if (!isPathReplanFloatDismissed(jobId)) {
        setPanelMode("open");
      }
    })();
  }, [job?.id, job?.status, setFading, setPanelMode, userId]);

  useEffect(() => {
    if (!job?.id || job.status !== "error") return;
    if (completionHandled.current === job.id) return;
    completionHandled.current = job.id;
    if (!isPathReplanDoneReminded(job.id)) {
      markPathReplanDoneReminded(job.id);
      message.error(job.error || "重新规划失败");
    }
    if (!isPathReplanFloatDismissed(job.id)) setPanelMode("open");
  }, [job?.id, job?.status, job?.error, setPanelMode]);

  return (
    <>
      <PathReplanProgressHost />
      <PathReplanFloat />
    </>
  );
}
