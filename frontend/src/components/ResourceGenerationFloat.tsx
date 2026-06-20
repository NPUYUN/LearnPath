"use client";

import { useEffect, useRef } from "react";
import { Button, Progress, Tag, message } from "antd";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import CloseOutlined from "@ant-design/icons/CloseOutlined";
import EyeInvisibleOutlined from "@ant-design/icons/EyeInvisibleOutlined";
import LoadingOutlined from "@ant-design/icons/LoadingOutlined";
import ShrinkOutlined from "@ant-design/icons/ShrinkOutlined";
import WarningOutlined from "@ant-design/icons/WarningOutlined";
import { getPath, getResourceGenerationJob, listResources } from "@/lib/api";
import { clientNavigate } from "@/lib/clientNav";
import { useAppStore } from "@/store/appStore";

const STORAGE_KEY = "learnpath-active-resource-generation-job";

function formatElapsed(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const rest = Math.max(0, seconds) % 60;
  return minutes ? `${minutes} 分 ${String(rest).padStart(2, "0")} 秒` : `${rest} 秒`;
}

export default function ResourceGenerationFloat() {
  const userId = useAppStore((s) => s.userId);
  const job = useAppStore((s) => s.activeResourceGenerationJob);
  const mode = useAppStore((s) => s.resourceGenerationPanelMode);
  const setJob = useAppStore((s) => s.setActiveResourceGenerationJob);
  const setMode = useAppStore((s) => s.setResourceGenerationPanelMode);
  const clearJob = useAppStore((s) => s.clearResourceGenerationJob);
  const setResources = useAppStore((s) => s.setResources);
  const setLearningPath = useAppStore((s) => s.setLearningPath);
  const reminded = useRef<string | null>(null);

  useEffect(() => {
    if (job?.id || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    void getResourceGenerationJob(saved)
      .then((restored) => {
        setJob(restored);
        setMode("minimized");
      })
      .catch(() => window.localStorage.removeItem(STORAGE_KEY));
  }, [job?.id, setJob, setMode]);

  useEffect(() => {
    if (!job?.id || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, job.id);
  }, [job?.id]);

  useEffect(() => {
    if (!job?.id || ["done", "error"].includes(job.status)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await getResourceGenerationJob(job.id);
        if (!cancelled) setJob(next);
      } catch {
        /* 保留最近状态，下一轮继续 */
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status, setJob]);

  useEffect(() => {
    if (!job?.id || job.status !== "done" || reminded.current === job.id) return;
    reminded.current = job.id;
    void Promise.all([listResources(userId), getPath(userId)])
      .then(([resources, path]) => {
        setResources(resources);
        if (path) setLearningPath(path);
      })
      .catch(() => {});
    message.success(`已生成 ${job.result?.generated_count || 0} 项学习资源`);
    setMode("open");
  }, [job, setLearningPath, setMode, setResources, userId]);

  if (!job || mode === "hidden") return null;
  const running = job.status === "queued" || job.status === "running";
  const done = job.status === "done";
  const error = job.status === "error";
  const result = job.result;

  const dismiss = () => {
    if (running) {
      setMode("minimized");
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
    clearJob();
  };

  if (mode === "minimized") {
    return (
      <button
        type="button"
        className={`lp-resource-regen-float-pill${done ? " is-done" : error ? " is-error" : " is-running"}`}
        onClick={() => setMode("open")}
      >
        {error ? <WarningOutlined /> : done ? <CheckCircleOutlined /> : <LoadingOutlined spin />}
        <span>{done ? "资源已生成" : error ? "生成失败" : `资源生成 ${job.progress}%`}</span>
      </button>
    );
  }

  return (
    <aside className={`lp-resource-regen-float${done ? " is-done" : error ? " is-error" : " is-running"}`}>
      <div className="lp-resource-regen-float-head">
        <div>
          <span>{done ? "资源生成完成" : error ? "资源生成失败" : "学习资源后台生成中"}</span>
          <strong>{job.title}</strong>
        </div>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={dismiss} />
      </div>
      <div className="lp-resource-regen-float-status">
        <Tag color={error ? "red" : done ? "green" : "processing"}>
          {job.current_resource_type || (done ? "已完成" : "后台任务")}
        </Tag>
        <span>{error ? job.error || job.sub_stage : `${job.stage}${job.sub_stage ? ` · ${job.sub_stage}` : ""}`}</span>
      </div>
      <Progress percent={Math.max(0, Math.min(100, job.progress))} showInfo={false} status={error ? "exception" : "active"} />
      <div className="lp-resource-job-elapsed">已耗时 {formatElapsed(job.elapsed_seconds || 0)}</div>
      {done && result ? (
        <div className="lp-resource-job-summary">
          <span>生成 {result.generated_count} 项</span>
          <span>资料库 {result.library_resource_count} 项</span>
          <span>路径 {result.path_attached_count} 项</span>
          <span>课堂可用 {result.classroom_ready_count} 项</span>
          {result.rewritten_count > 0 && <span>重写 {result.rewritten_count} 项</span>}
          {result.draft_count > 0 && <span>草稿 {result.draft_count} 项</span>}
        </div>
      ) : null}
      <div className="lp-resource-regen-float-actions">
        {done && <Button type="primary" size="small" onClick={() => clientNavigate("/resources")}>查看资源库</Button>}
        <Button size="small" icon={<ShrinkOutlined />} onClick={() => setMode("minimized")}>缩小</Button>
        {running && <Button size="small" icon={<EyeInvisibleOutlined />} onClick={() => setMode("minimized")}>后台继续</Button>}
      </div>
    </aside>
  );
}
