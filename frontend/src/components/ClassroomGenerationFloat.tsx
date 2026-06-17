"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent, type SyntheticEvent } from "react";
import { usePathname } from "next/navigation";
import { Button, Progress, Tag, message } from "antd";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import CloseOutlined from "@ant-design/icons/CloseOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import ExpandAltOutlined from "@ant-design/icons/ExpandAltOutlined";
import LoadingOutlined from "@ant-design/icons/LoadingOutlined";
import ShrinkOutlined from "@ant-design/icons/ShrinkOutlined";
import EyeInvisibleOutlined from "@ant-design/icons/EyeInvisibleOutlined";
import WarningOutlined from "@ant-design/icons/WarningOutlined";
import { getClassroomGenerationJob } from "@/lib/api";
import {
  dismissFloatPanel,
  isFloatDismissed,
  isFloatDoneReminded,
  loadPersistedActiveClassroom,
  markFloatDoneReminded,
  persistActiveClassroom,
} from "@/lib/classroomActive";
import { clientNavigate } from "@/lib/clientNav";
import { useFreeDrag } from "@/hooks/useFreeDrag";
import { useAppStore } from "@/store/appStore";

const FLOAT_POSITION_KEY = "learnpath-classroom-float-pos";

function formatElapsed(seconds?: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${rest} 秒`;
  return `${minutes} 分 ${String(rest).padStart(2, "0")} 秒`;
}

function stopShellDrag(event: SyntheticEvent) {
  event.stopPropagation();
}

export default function ClassroomGenerationFloat() {
  const pathname = usePathname();
  const job = useAppStore((s) => s.activeClassroomJob);
  const seed = useAppStore((s) => s.activeClassroomSeed);
  const result = useAppStore((s) => s.activeClassroomResult);
  const mode = useAppStore((s) => s.classroomJobPanelMode);
  const setJob = useAppStore((s) => s.setActiveClassroomJob);
  const setSeed = useAppStore((s) => s.setActiveClassroomSeed);
  const setResult = useAppStore((s) => s.setActiveClassroomResult);
  const setPending = useAppStore((s) => s.setPendingClassroomSession);
  const setMode = useAppStore((s) => s.setClassroomJobPanelMode);
  const clearActiveClassroom = useAppStore((s) => s.clearActiveClassroom);
  const lastJobId = useRef<string | null>(null);
  const snapMinimizedRef = useRef(false);
  const suppressedForClassroom = useRef(false);
  const prevPathname = useRef(pathname);
  const {
    shellRef,
    shellStyle,
    dragging,
    resetPosition,
    measureAndPlace,
    shellProps,
    consumeClickIfDragged,
    wasPointerDragged,
  } = useFreeDrag({
    storageKey: FLOAT_POSITION_KEY,
  });

  useEffect(() => {
    if (job?.id || typeof window === "undefined") return;
    const saved = loadPersistedActiveClassroom();
    if (!saved) return;
    let cancelled = false;
    setSeed(saved.seed);
    void getClassroomGenerationJob(saved.jobId)
      .then((savedJob) => {
        if (cancelled) return;
        setJob(savedJob);
        if (savedJob.status === "done" && savedJob.result) setResult(savedJob.result);
      })
      .catch(() => {
        clearActiveClassroom();
      });
    return () => {
      cancelled = true;
    };
  }, [clearActiveClassroom, job?.id, setJob, setResult, setSeed]);

  useEffect(() => {
    if (!job?.id || !seed?.stepKey || typeof window === "undefined") return;
    persistActiveClassroom({ jobId: job.id, seed });
  }, [job?.id, seed]);

  useEffect(() => {
    if (!job?.id) return;
    if (job.status === "done" || job.status === "error") return;
    const jobId = job.id;

    let cancelled = false;
    async function poll() {
      try {
        const next = await getClassroomGenerationJob(jobId);
        if (cancelled) return;
        setJob(next);
        if (next.status === "done" && next.result) setResult(next.result);
      } catch {
        /* keep the latest visible state */
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 1600);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status, setJob, setResult]);

  useEffect(() => {
    if (!job?.id || job.id === lastJobId.current) return;
    lastJobId.current = job.id;
    if (isFloatDismissed(job.id)) return;
    if (job.status === "done" || job.status === "error") return;

    setMode("open");
    const frame = window.requestAnimationFrame(() => resetPosition());
    return () => window.cancelAnimationFrame(frame);
  }, [job?.id, job?.status, resetPosition, setMode]);

  useEffect(() => {
    if (!job?.id || typeof window === "undefined") return;
    if (isFloatDismissed(job.id)) return;
    if (job.status !== "done") return;
    if (isFloatDoneReminded(job.id)) return;

    markFloatDoneReminded(job.id);
    setMode("open");
    message.success("课堂已生成，可以进入学习");
  }, [job?.id, job?.status, setMode]);

  useEffect(() => {
    if (mode === "hidden" || typeof window === "undefined") return;
    if (mode === "minimized" && snapMinimizedRef.current) {
      snapMinimizedRef.current = false;
      const frame = window.requestAnimationFrame(() => resetPosition());
      return () => window.cancelAnimationFrame(frame);
    }
    const frame = window.requestAnimationFrame(() => measureAndPlace());
    return () => window.cancelAnimationFrame(frame);
  }, [mode, measureAndPlace, resetPosition]);

  useEffect(() => {
    const wasClassroom = prevPathname.current === "/classroom";
    const nowClassroom = pathname === "/classroom";

    if (!wasClassroom && nowClassroom && job) {
      suppressedForClassroom.current = mode !== "hidden";
    }

    if (
      wasClassroom &&
      !nowClassroom &&
      job &&
      suppressedForClassroom.current &&
      !isFloatDismissed(job.id)
    ) {
      suppressedForClassroom.current = false;
      if (mode === "hidden") {
        snapMinimizedRef.current = true;
        setMode("minimized");
      }
    }

    prevPathname.current = pathname;
  }, [pathname, job, mode, setMode]);

  if (!job) return null;
  if (isFloatDismissed(job.id)) return null;

  const isOnClassroom = pathname === "/classroom";
  const done = job.status === "done";
  const error = job.status === "error";
  const progress = Math.max(0, Math.min(100, job.progress || 0));
  const subStage = job.sub_stage || "";
  const elapsed = job.elapsed_seconds || 0;

  const hidePanel = () => {
    suppressedForClassroom.current = false;
    setMode("hidden");
  };

  const dismissPanel = () => {
    dismissFloatPanel(job.id);
    suppressedForClassroom.current = false;
    setMode("hidden");
  };

  const minimizePanel = () => {
    snapMinimizedRef.current = true;
    setMode("minimized");
  };

  const enterClassroom = () => {
    if (seed) setPending(seed);
    if (job.result && !result) setResult(job.result);
    suppressedForClassroom.current = true;
    setMode("hidden");
    clientNavigate("/classroom");
  };

  const deleteClassroom = () => {
    clearActiveClassroom();
    message.success("已删除当前课堂");
  };

  const shellPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const dragged = wasPointerDragged();
    shellProps.onPointerUp(event);
    if (dragged) {
      consumeClickIfDragged();
      return;
    }
    if (mode === "minimized") setMode("open");
  };

  const actionPointerDown = (event: PointerEvent<HTMLElement>) => {
    stopShellDrag(event);
  };

  const actionClick =
    (handler: () => void) => (event: MouseEvent<HTMLElement>) => {
      stopShellDrag(event);
      handler();
    };

  if (mode === "hidden" || isOnClassroom) return null;

  const dragShellProps = {
    onPointerDown: shellProps.onPointerDown,
    onPointerMove: shellProps.onPointerMove,
    onPointerUp: shellPointerUp,
    onPointerCancel: shellProps.onPointerCancel,
  };

  if (mode === "minimized") {
    return (
      <div
        ref={shellRef}
        className={`lp-classroom-float-shell${dragging ? " is-dragging" : ""}`}
        style={shellStyle}
        {...dragShellProps}
      >
        <div
          role="button"
          tabIndex={0}
          className={`lp-classroom-float-pill${done ? " is-done" : error ? " is-error" : " is-generating"}`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setMode("open");
            }
          }}
          aria-label="打开课堂生成进度"
        >
          {error ? (
            <WarningOutlined />
          ) : done ? (
            <CheckCircleOutlined />
          ) : (
            <LoadingOutlined spin />
          )}
          <span>{done ? "课堂已生成" : error ? "生成失败" : `生成中 ${progress}%`}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`lp-classroom-float-shell${dragging ? " is-dragging" : ""}`}
      style={shellStyle}
      {...dragShellProps}
    >
      <aside
        className={`lp-classroom-float${done ? " is-done" : error ? " is-error" : " is-generating"}`}
      >
        <div className="lp-classroom-float-head">
          <div>
            <span>{done ? "课堂已就绪" : error ? "生成失败" : "AI 课堂生成中"}</span>
            <strong>{job.title || seed?.title || "课堂内容"}</strong>
          </div>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onPointerDown={actionPointerDown}
            onClick={actionClick(dismissPanel)}
          />
        </div>

        <div className="lp-classroom-float-status">
          <Tag color={error ? "red" : done ? "green" : "processing"}>
            {done ? "已完成" : error ? "失败" : "生成中"}
          </Tag>
          <span>{error ? job.error || "生成失败" : job.stage || "准备生成"}</span>
        </div>

        {!done && !error && (
          <div className="lp-classroom-float-substage">
            <span>{subStage || "仍在生成，请稍候"}</span>
            <em>{progress}% · 已耗时 {formatElapsed(elapsed)}</em>
          </div>
        )}

        {done ? (
          <div className="lp-classroom-float-done-banner">
            <CheckCircleOutlined />
            <span>课堂内容已生成，可以进入学习</span>
          </div>
        ) : (
          <Progress percent={progress} showInfo={false} status={error ? "exception" : "active"} />
        )}

        <div className={`lp-classroom-float-actions${done ? " is-done" : ""}`}>
          {done ? (
            <>
              <Button
                type="primary"
                size="small"
                block
                className="lp-classroom-float-enter-btn"
                icon={<ExpandAltOutlined />}
                onPointerDown={actionPointerDown}
                onClick={actionClick(enterClassroom)}
              >
                进入课堂
              </Button>
              <div className="lp-classroom-float-actions-secondary">
                <Button
                  size="small"
                  icon={<ShrinkOutlined />}
                  onPointerDown={actionPointerDown}
                  onClick={actionClick(minimizePanel)}
                >
                  缩小
                </Button>
                <Button
                  size="small"
                  icon={<EyeInvisibleOutlined />}
                  onPointerDown={actionPointerDown}
                  onClick={actionClick(hidePanel)}
                >
                  隐藏
                </Button>
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onPointerDown={actionPointerDown}
                  onClick={actionClick(deleteClassroom)}
                >
                  删除
                </Button>
              </div>
            </>
          ) : error ? (
            <>
              <Button
                size="small"
                icon={<EyeInvisibleOutlined />}
                onPointerDown={actionPointerDown}
                onClick={actionClick(hidePanel)}
              >
                隐藏
              </Button>
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                onPointerDown={actionPointerDown}
                onClick={actionClick(deleteClassroom)}
              >
                删除
              </Button>
            </>
          ) : (
            <>
              <Button
                size="small"
                icon={<ShrinkOutlined />}
                onPointerDown={actionPointerDown}
                onClick={actionClick(minimizePanel)}
              >
                缩小
              </Button>
              <Button
                size="small"
                icon={<EyeInvisibleOutlined />}
                onPointerDown={actionPointerDown}
                onClick={actionClick(hidePanel)}
              >
                隐藏
              </Button>
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                onPointerDown={actionPointerDown}
                onClick={actionClick(deleteClassroom)}
              >
                删除
              </Button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
