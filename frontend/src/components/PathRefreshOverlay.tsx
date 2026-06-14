"use client";

import type { ReactNode } from "react";
import { Button, Progress } from "antd";
import ShrinkOutlined from "@ant-design/icons/ShrinkOutlined";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import ClearOutlined from "@ant-design/icons/ClearOutlined";
import ClockCircleOutlined from "@ant-design/icons/ClockCircleOutlined";
import LoadingOutlined from "@ant-design/icons/LoadingOutlined";
import SafetyCertificateOutlined from "@ant-design/icons/SafetyCertificateOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import type { RefreshSubPhase } from "@/lib/pathRefreshProgress";
import { formatElapsed } from "@/lib/pathRefreshProgress";

export const PATH_REFRESH_STEPS = [
  {
    key: "clear-path",
    label: "清除当前规划",
    desc: "清空旧版学习路径与步骤进度",
    icon: <ClearOutlined />,
  },
  {
    key: "clear-resources",
    label: "清除资源库",
    desc: "删除未收藏资源，保留收藏条目",
    icon: <BookOutlined />,
  },
  {
    key: "profile",
    label: "分析画像",
    desc: "综合画像、实时状态与学习行为",
    icon: <UserOutlined />,
  },
  {
    key: "replan",
    label: "重新规划路线",
    desc: "规划主阶段与子步骤结构",
    icon: <ApartmentOutlined />,
  },
  {
    key: "regen-resources",
    label: "重新生成配套资源",
    desc: "按阶段生成讲解、练习与阅读",
    icon: <BookOutlined />,
  },
  {
    key: "confirm",
    label: "最终确认",
    desc: "校验完整性并写入系统",
    icon: <SafetyCertificateOutlined />,
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  desc: string;
  icon: ReactNode;
}>;

export type PathRefreshOverlayProps = {
  progress: number;
  stepIndex: number;
  fading?: boolean;
  /** 当前主步骤下的子阶段清单（替代轮播文案） */
  subPhases?: RefreshSubPhase[];
  /** 已用秒数 */
  elapsedSec?: number;
  /** 当前步骤完成后的结果摘要 */
  resultSummary?: string;
  onMinimize?: () => void;
  showMinimize?: boolean;
};

export default function PathRefreshOverlay({
  progress,
  stepIndex,
  fading = false,
  subPhases,
  elapsedSec = 0,
  resultSummary,
  onMinimize,
  showMinimize = true,
}: PathRefreshOverlayProps) {
  const current = PATH_REFRESH_STEPS[Math.min(stepIndex, PATH_REFRESH_STEPS.length - 1)];
  const activePhase = subPhases?.find((p) => p.status === "active");
  const donePhaseCount = subPhases?.filter((p) => p.status === "done").length ?? 0;
  const phaseTotal = subPhases?.length ?? 0;

  const headline = resultSummary
    ? resultSummary
    : activePhase?.label || current.desc;

  return (
    <div
      className={`init-screen lp-path-refresh-overlay${fading ? " init-screen--fade" : ""}`}
      aria-live="polite"
      aria-busy={!fading}
    >
      <div className="init-orb init-orb-1" />
      <div className="init-orb init-orb-2" />
      <div className="init-orb init-orb-3" />
      <div className="init-grid" />

      <div className="init-card">
        <div className="init-logo-wrap">
          <div className="init-logo-ring" />
          <div className="init-logo">
            <ApartmentOutlined />
          </div>
        </div>

        <h1 className="init-title">重新规划学习路径</h1>
        <p className="init-subtitle">
          多智能体正在协同为你定制新的学习主线
          {showMinimize && onMinimize && progress < 100 ? (
            <span className="lp-path-refresh-minimize-wrap">
              <Button
                type="link"
                size="small"
                icon={<ShrinkOutlined />}
                onClick={onMinimize}
                className="lp-path-refresh-minimize-btn"
              >
                收起到后台
              </Button>
            </span>
          ) : null}
        </p>

        <div className="lp-path-refresh-current">
          <LoadingOutlined spin className="lp-path-refresh-current-icon" />
          <div className="lp-path-refresh-current-body">
            <p className="lp-path-refresh-current-step">
              第 {stepIndex + 1} / {PATH_REFRESH_STEPS.length} 步 · {current.label}
              {phaseTotal > 0 && !resultSummary ? (
                <span className="lp-path-refresh-phase-count">
                  {" "}
                  （{donePhaseCount}/{phaseTotal}）
                </span>
              ) : null}
            </p>
            <p className="lp-path-refresh-current-detail">{headline}</p>
          </div>
        </div>

        {subPhases && subPhases.length > 0 ? (
          <ul className="lp-path-refresh-phases" aria-label="当前步骤子进度">
            {subPhases.map((phase) => (
              <li
                key={phase.label}
                className={`lp-path-refresh-phase lp-path-refresh-phase--${phase.status}`}
              >
                <span className="lp-path-refresh-phase-marker" aria-hidden>
                  {phase.status === "done" ? (
                    <CheckCircleOutlined />
                  ) : phase.status === "active" ? (
                    <LoadingOutlined spin />
                  ) : (
                    <span className="lp-path-refresh-phase-dot" />
                  )}
                </span>
                <span className="lp-path-refresh-phase-label">{phase.label}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <ul className="init-steps">
          {PATH_REFRESH_STEPS.map((step, idx) => {
            const done = idx < stepIndex || (idx === stepIndex && progress >= 100);
            const active = idx === stepIndex && progress < 100;
            return (
              <li
                key={step.key}
                className={`init-step${done ? " init-step--done" : ""}${active ? " init-step--active" : ""}`}
                style={{ animationDelay: `${idx * 0.06}s` }}
              >
                <span className="init-step-icon">{step.icon}</span>
                <span className="init-step-body">
                  <span className="init-step-label">{step.label}</span>
                </span>
                <span className="init-step-status">
                  {done ? <CheckCircleOutlined /> : active ? <LoadingOutlined spin /> : null}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="init-progress-wrap">
          <Progress
            percent={progress}
            strokeColor={{ "0%": "#1677ff", "100%": "#36cfc9" }}
            trailColor="rgba(22,119,255,0.12)"
            showInfo={false}
            size={8}
          />
          <div className="init-progress-meta">
            <span className="init-tip">
              {progress >= 100 ? (
                "规划完成，正在刷新页面…"
              ) : (
                <span className="lp-path-refresh-meta-row">
                  <ClockCircleOutlined />
                  <span>已用时 {formatElapsed(elapsedSec)}</span>
                </span>
              )}
            </span>
            <span className="init-percent">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
