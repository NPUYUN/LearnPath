"use client";

import { useEffect, useState } from "react";
import { Progress } from "antd";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import MessageOutlined from "@ant-design/icons/MessageOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import BarChartOutlined from "@ant-design/icons/BarChartOutlined";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import LoadingOutlined from "@ant-design/icons/LoadingOutlined";

const STEPS = [
  { key: "chat", label: "智能对话", icon: <MessageOutlined />, desc: "加载对话与流式模块" },
  { key: "profile", label: "学习画像", icon: <UserOutlined />, desc: "同步学习者画像数据" },
  { key: "path", label: "学习路径", icon: <ApartmentOutlined />, desc: "构建个性化路径规划" },
  { key: "resources", label: "资源库", icon: <BookOutlined />, desc: "索引多模态学习资源" },
  { key: "eval", label: "学习评估", icon: <BarChartOutlined />, desc: "准备评估与图表引擎" },
];

const TIPS = [
  "多智能体正在协同初始化…",
  "正在连接本地知识库与 SQLite…",
  "预热 ECharts 可视化引擎…",
  "即将进入你的专属学习空间",
];

type InitLoadingScreenProps = {
  progress: number;
  fading?: boolean;
};

export default function InitLoadingScreen({ progress, fading }: InitLoadingScreenProps) {
  const [tipIndex, setTipIndex] = useState(0);
  const activeStep = Math.min(
    STEPS.length - 1,
    Math.floor((progress / 100) * STEPS.length)
  );

  useEffect(() => {
    const t = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className={`init-screen${fading ? " init-screen--fade" : ""}`}
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
            <BulbOutlined />
          </div>
        </div>

        <h1 className="init-title">学径 LearnPath</h1>
        <p className="init-subtitle">个性化学习多智能体系统</p>

        <ul className="init-steps">
          {STEPS.map((step, idx) => {
            const done = progress >= ((idx + 1) / STEPS.length) * 100;
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
            strokeColor={{ "0%": "#1677ff", "100%": "#36cfc9" }}
            trailColor="rgba(22,119,255,0.12)"
            showInfo={false}
            strokeWidth={8}
          />
          <div className="init-progress-meta">
            <span className="init-tip init-tip--animate" key={tipIndex}>
              {progress >= 100 ? "加载完成，正在进入…" : TIPS[tipIndex]}
            </span>
            <span className="init-percent">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
