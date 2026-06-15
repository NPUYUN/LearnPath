"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Progress } from "antd";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import BarChartOutlined from "@ant-design/icons/BarChartOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import LoadingOutlined from "@ant-design/icons/LoadingOutlined";
import MessageOutlined from "@ant-design/icons/MessageOutlined";
import SafetyCertificateOutlined from "@ant-design/icons/SafetyCertificateOutlined";
import SettingOutlined from "@ant-design/icons/SettingOutlined";
import TeamOutlined from "@ant-design/icons/TeamOutlined";
import TrophyOutlined from "@ant-design/icons/TrophyOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import DatabaseOutlined from "@ant-design/icons/DatabaseOutlined";
import LineChartOutlined from "@ant-design/icons/LineChartOutlined";
import DashboardOutlined from "@ant-design/icons/DashboardOutlined";
import { BRAND_CN, BRAND_TITLE } from "@/lib/brand";

export type RouteLoadingVariant = "init" | "admin" | "insights" | "default";

type StepItem = {
  key: string;
  label: string;
  desc: string;
  icon: ReactNode;
};

const VARIANTS: Record<
  RouteLoadingVariant,
  { title: string; subtitle: string; logo: ReactNode; steps: StepItem[]; tips: string[] }
> = {
  init: {
    title: BRAND_TITLE,
    subtitle: "个性化学习多智能体系统",
    logo: <BulbOutlined />,
    steps: [
      { key: "chat", label: "智能对话", desc: "加载对话与流式模块", icon: <MessageOutlined /> },
      { key: "profile", label: "学习画像", desc: "同步学习者画像数据", icon: <UserOutlined /> },
      { key: "path", label: "学习路径", desc: "构建个性化路径规划", icon: <ApartmentOutlined /> },
      { key: "resources", label: "资源库", desc: "索引多模态学习资源", icon: <BookOutlined /> },
      { key: "eval", label: "学习评估", desc: "准备评估与图表引擎", icon: <BarChartOutlined /> },
      { key: "account", label: "个人主页", desc: "加载账号与设置模块", icon: <UserOutlined /> },
      { key: "settings", label: "系统设置", desc: "应用主题与偏好", icon: <SettingOutlined /> },
    ],
    tips: [
      "多智能体正在协同初始化…",
      "正在连接本地知识库与 SQLite…",
      "预热 ECharts 可视化引擎…",
      "即将进入你的专属学习空间",
    ],
  },
  admin: {
    title: `${BRAND_CN}管理台`,
    subtitle: "Platform Console · 平台运营控制台",
    logo: <SafetyCertificateOutlined />,
    steps: [
      { key: "dashboard", label: "数据总览", desc: "聚合平台核心运营指标", icon: <DashboardOutlined /> },
      { key: "users", label: "用户管理", desc: "加载用户列表与管理模块", icon: <TeamOutlined /> },
      { key: "resources", label: "资源汇总", desc: "索引全站学习资源分布", icon: <DatabaseOutlined /> },
      { key: "activity", label: "行为分析", desc: "预热统计图表与事件流", icon: <LineChartOutlined /> },
    ],
    tips: [
      "正在连接平台数据库…",
      "同步用户与资源统计数据…",
      "预热管理台可视化引擎…",
      "即将进入平台管理控制台",
    ],
  },
  insights: {
    title: "学习成就馆",
    subtitle: "正在打开你的专属数据空间",
    logo: <TrophyOutlined />,
    steps: [
      { key: "data", label: "学习数据", desc: "聚合统计与成长记录", icon: <TrophyOutlined /> },
      { key: "charts", label: "可视化引擎", desc: "预热图表与动效渲染", icon: <BarChartOutlined /> },
      { key: "badges", label: "成就系统", desc: "计算等级与徽章进度", icon: <TrophyOutlined /> },
    ],
    tips: ["正在读取你的学习轨迹…", "构建能力雷达与学力指数…", "成就徽章即将揭晓…"],
  },
  default: {
    title: BRAND_TITLE,
    subtitle: "页面加载中",
    logo: <BulbOutlined />,
    steps: [{ key: "page", label: "加载页面", desc: "请稍候…", icon: <BulbOutlined /> }],
    tips: ["正在切换页面…", "马上就好…"],
  },
};

/** 登录后统一加载屏（登录表单除外），复用 init-screen 视觉 */
export type RouteLoadingScreenProps = {
  progress: number;
  fading?: boolean;
  variant?: RouteLoadingVariant;
};

export default function RouteLoadingScreen({
  progress,
  fading,
  variant = "default",
}: RouteLoadingScreenProps) {
  const config = VARIANTS[variant];
  const [tipIndex, setTipIndex] = useState(0);
  const progressStroke =
    variant === "admin"
      ? { "0%": "#7c3aed", "100%": "#6366f1" }
      : variant === "insights"
        ? { "0%": "#f59e0b", "100%": "#1677ff" }
        : { "0%": "#1677ff", "100%": "#36cfc9" };
  const progressTrail =
    variant === "admin" ? "rgba(167,139,250,0.18)" : "rgba(22,119,255,0.12)";
  const activeStep = Math.min(
    config.steps.length - 1,
    Math.floor((progress / 100) * config.steps.length)
  );

  useEffect(() => {
    const t = setInterval(() => setTipIndex((i) => (i + 1) % config.tips.length), 2400);
    return () => clearInterval(t);
  }, [config.tips.length]);

  return (
    <div
      className={`init-screen lp-route-loader lp-route-loader--${variant}${fading ? " init-screen--fade" : ""}`}
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
          <div className="init-logo">{config.logo}</div>
        </div>

        <h1 className="init-title">{config.title}</h1>
        <p className="init-subtitle">{config.subtitle}</p>

        <ul className="init-steps">
          {config.steps.map((step, idx) => {
            const done = progress >= ((idx + 1) / config.steps.length) * 100;
            const active = idx === activeStep && !done && progress < 100;
            return (
              <li
                key={step.key}
                className={`init-step${done ? " init-step--done" : ""}${active ? " init-step--active" : ""}`}
                style={{ animationDelay: `${idx * 0.08}s` }}
              >
                <span className="init-step-icon">{step.icon}</span>
                <span className="init-step-body">
                  <span className="init-step-label">{step.label}</span>
                  <span className="init-step-desc">{step.desc}</span>
                </span>
                <span className="init-step-status">
                  {done ? (
                    <CheckCircleOutlined />
                  ) : active ? (
                    <LoadingOutlined spin />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="init-progress-wrap">
          <Progress
            percent={progress}
            strokeColor={progressStroke}
            trailColor={progressTrail}
            showInfo={false}
            strokeWidth={8}
          />
          <div className="init-progress-meta">
            <span className="init-tip init-tip--animate" key={tipIndex}>
              {progress >= 100 ? "加载完成，正在进入…" : config.tips[tipIndex]}
            </span>
            <span className="init-percent">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
