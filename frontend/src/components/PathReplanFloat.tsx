"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent, type SyntheticEvent } from "react";
import { Button, Progress, Tag } from "antd";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import CloseOutlined from "@ant-design/icons/CloseOutlined";
import ExpandAltOutlined from "@ant-design/icons/ExpandAltOutlined";
import EyeInvisibleOutlined from "@ant-design/icons/EyeInvisibleOutlined";
import LoadingOutlined from "@ant-design/icons/LoadingOutlined";
import ShrinkOutlined from "@ant-design/icons/ShrinkOutlined";
import WarningOutlined from "@ant-design/icons/WarningOutlined";
import { PATH_REFRESH_STEPS } from "@/components/PathRefreshOverlay";
import { clientNavigate } from "@/lib/clientNav";
import { formatElapsed } from "@/lib/pathRefreshProgress";
import { dismissPathReplanFloat } from "@/lib/pathReplanActive";
import { useFreeDrag } from "@/hooks/useFreeDrag";
import { usePathReplanElapsed } from "@/hooks/usePathReplanElapsed";
import { useAppStore } from "@/store/appStore";

const FLOAT_POSITION_KEY = "learnpath-path-replan-float-pos";

function stopShellDrag(event: SyntheticEvent) {
  event.stopPropagation();
}

export default function PathReplanFloat() {
  const job = useAppStore((s) => s.pathReplanJob);
  const mode = useAppStore((s) => s.pathReplanPanelMode);
  const setMode = useAppStore((s) => s.setPathReplanPanelMode);
  const clearPathReplan = useAppStore((s) => s.clearPathReplan);
  const elapsedSec = usePathReplanElapsed(job);

  const snapMinimizedRef = useRef(false);
  const {
    shellRef,
    shellStyle,
    dragging,
    measureAndPlace,
    resetPosition,
    shellProps,
    consumeClickIfDragged,
    wasPointerDragged,
  } = useFreeDrag({
    storageKey: FLOAT_POSITION_KEY,
    initialYOffset: 72,
  });

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

  if (!job || mode === "fullscreen" || mode === "hidden") return null;

  const running = job.status === "queued" || job.status === "running";
  const done = job.status === "done";
  const error = job.status === "error";
  const progress = Math.max(0, Math.min(100, job.progress || 0));
  const stepLabel =
    PATH_REFRESH_STEPS[Math.min(job.step_index, PATH_REFRESH_STEPS.length - 1)]?.label ||
    job.step_label;

  const hidePanel = () => setMode("hidden");
  const dismissPanel = () => {
    dismissPathReplanFloat(job.id);
    setMode("hidden");
  };
  const minimizePanel = () => {
    snapMinimizedRef.current = true;
    setMode("minimized");
  };
  const expandFullscreen = () => setMode("fullscreen");
  const goToPath = () => {
    setMode("minimized");
    clientNavigate("/path");
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
        className={`lp-path-replan-float-shell${dragging ? " is-dragging" : ""}`}
        style={shellStyle}
        {...dragShellProps}
      >
        <div
          role="button"
          tabIndex={0}
          className={`lp-path-replan-float-pill${done ? " is-done" : error ? " is-error" : " is-running"}`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setMode("open");
            }
          }}
          aria-label="打开重规划进度"
        >
          {error ? (
            <WarningOutlined />
          ) : done ? (
            <CheckCircleOutlined />
          ) : (
            <LoadingOutlined spin />
          )}
          <span>
            {done
              ? "规划已完成"
              : error
                ? "规划失败"
                : `规划中 ${progress}% · ${stepLabel}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`lp-path-replan-float-shell${dragging ? " is-dragging" : ""}`}
      style={shellStyle}
      {...dragShellProps}
    >
      <aside
        className={`lp-path-replan-float${done ? " is-done" : error ? " is-error" : " is-running"}`}
      >
        <div className="lp-path-replan-float-head">
          <div className="lp-path-replan-float-head-copy">
            <span>{done ? "规划已完成" : error ? "规划失败" : "学习路径重规划中"}</span>
            <strong>
              <ApartmentOutlined /> {stepLabel}
            </strong>
          </div>
          <Button
            type="text"
            size="small"
            className="lp-path-replan-float-close"
            icon={<CloseOutlined />}
            onPointerDown={actionPointerDown}
            onClick={actionClick(dismissPanel)}
          />
        </div>

        <div className="lp-path-replan-float-status">
          <Tag color={error ? "red" : done ? "green" : "processing"}>
            {done ? "已完成" : error ? "失败" : `第 ${job.step_index + 1}/6 步`}
          </Tag>
          <span>{error ? job.error || "执行失败" : job.stage || job.result_summary || "处理中…"}</span>
        </div>

        {done ? (
          <div className="lp-path-replan-float-done-banner">
            <CheckCircleOutlined />
            <span>{job.result_summary || "可以查看新的学习路径了"}</span>
          </div>
        ) : (
          <div className="lp-path-replan-float-progress">
            <Progress percent={progress} showInfo={false} status={error ? "exception" : "active"} />
          </div>
        )}

        <p className="lp-path-replan-float-hint">
          {running ? (
            <>
              <span className="lp-path-replan-float-hint-time">已用时 {formatElapsed(elapsedSec)}</span>
              <span className="lp-path-replan-float-hint-tip">可切换页面，请勿关闭此标签页</span>
            </>
          ) : (
            "任务已在服务端执行完毕"
          )}
        </p>

        <div className={`lp-path-replan-float-actions${done ? " is-done" : ""}`}>
          {done ? (
            <>
              <Button
                type="primary"
                size="small"
                block
                icon={<ExpandAltOutlined />}
                onPointerDown={actionPointerDown}
                onClick={actionClick(goToPath)}
              >
                查看路径
              </Button>
              <div className="lp-path-replan-float-actions-secondary">
                <Button size="small" icon={<ShrinkOutlined />} onClick={actionClick(minimizePanel)}>
                  缩小
                </Button>
                <Button
                  size="small"
                  icon={<EyeInvisibleOutlined />}
                  onClick={actionClick(hidePanel)}
                >
                  隐藏
                </Button>
                <Button size="small" onClick={actionClick(clearPathReplan)}>
                  关闭
                </Button>
              </div>
            </>
          ) : error ? (
            <div className="lp-path-replan-float-actions-secondary">
              <Button size="small" onClick={actionClick(goToPath)}>
                返回路径
              </Button>
              <Button size="small" onClick={actionClick(clearPathReplan)}>
                关闭
              </Button>
            </div>
          ) : (
            <div className="lp-path-replan-float-actions-secondary">
              <Button size="small" icon={<ExpandAltOutlined />} onClick={actionClick(expandFullscreen)}>
                全屏
              </Button>
              <Button size="small" icon={<ShrinkOutlined />} onClick={actionClick(minimizePanel)}>
                缩小
              </Button>
              <Button size="small" icon={<EyeInvisibleOutlined />} onClick={actionClick(hidePanel)}>
                隐藏
              </Button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
