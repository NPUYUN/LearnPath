"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import MessageOutlined from "@ant-design/icons/MessageOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import BarChartOutlined from "@ant-design/icons/BarChartOutlined";
import RocketOutlined from "@ant-design/icons/RocketOutlined";
import { useAppStore } from "@/store/appStore";

// ─── 数据 ─────────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: <MessageOutlined />,
    title: "AI 导师对话",
    desc: "基于大语言模型的智能问答，随时解答学习疑惑，像真正的导师一样陪伴你成长",
    color: "#4f8ef7",
    glow: "rgba(79,142,247,0.2)",
  },
  {
    icon: <UserOutlined />,
    title: "个性化学习画像",
    desc: "深度分析学习行为与知识掌握情况，精准构建专属学习画像",
    color: "#a855f7",
    glow: "rgba(168,85,247,0.2)",
  },
  {
    icon: <ApartmentOutlined />,
    title: "智能路径规划",
    desc: "根据画像自动生成个性化学习路径，循序渐进、科学高效地达成目标",
    color: "#2bc0b4",
    glow: "rgba(43,192,180,0.2)",
  },
  {
    icon: <BookOutlined />,
    title: "多媒体资源生成",
    desc: "自动生成讲义、思维导图、代码示例、习题等多种形式的学习材料",
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.2)",
  },
  {
    icon: <BarChartOutlined />,
    title: "学习评估追踪",
    desc: "可视化学习进度，雷达图多维度展示能力分布，持续追踪成长轨迹",
    color: "#ef4444",
    glow: "rgba(239,68,68,0.2)",
  },
  {
    icon: <BulbOutlined />,
    title: "知识图谱可视化",
    desc: "将抽象知识网络化呈现，帮助建立系统化、结构化的知识体系",
    color: "#10b981",
    glow: "rgba(16,185,129,0.2)",
  },
];

const STATS = [
  { value: "5+", label: "智能 Agent", color: "#4f8ef7" },
  { value: "RAG", label: "知识库增强", color: "#a855f7" },
  { value: "多模态", label: "资源生成", color: "#2bc0b4" },
  { value: "实时", label: "个性推荐", color: "#f59e0b" },
];

// ─── 打字机 Hook ──────────────────────────────────────────────────────────────
function useTypewriter(text: string, delay = 55) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, delay);
    return () => clearInterval(id);
  }, [text, delay]);
  return displayed;
}

// ─── 粒子背景 ─────────────────────────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // 粒子
    const N = 60;
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.4,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      alpha: Math.random() * 0.5 + 0.15,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100,160,255,${p.alpha})`;
        ctx.fill();
      }
      // 连线
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(100,160,255,${0.12 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function LandingContent() {
  const setShowLanding = useAppStore((s) => s.setShowLanding);
  const typed = useTypewriter("为每位学习者量身定制专属 AI 导师");

  const goLogin = () => setShowLanding(false);

  return (
    <div className="lp-root">
      {/* 粒子画布 */}
      <ParticleCanvas />

      {/* 光晕 orbs */}
      <div className="lp-orb lp-orb-1" />
      <div className="lp-orb lp-orb-2" />
      <div className="lp-orb lp-orb-3" />

      {/* ── 顶部导航 ── */}
      <nav className="lp-nav">
        <div className="lp-nav-brand">
          <div className="lp-nav-icon">
            <BulbOutlined style={{ fontSize: 18, color: "#4f8ef7" }} />
          </div>
          <span className="lp-nav-name">学径</span>
          <span className="lp-nav-sub">LearnPath</span>
        </div>
        <Button
          type="primary"
          size="middle"
          className="lp-login-btn"
          onClick={goLogin}
        >
          登录 / 注册 →
        </Button>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero lp-fade-in">
        <div className="lp-hero-badge">
          <RocketOutlined style={{ marginRight: 6 }} />
          2026 软件杯 A3 · 个性化学习多智能体系统
        </div>

        <h1 className="lp-hero-title">
          让学习更<span className="lp-gradient-text">智能</span>
          <br />
          让成长更<span className="lp-gradient-text">高效</span>
        </h1>

        <p className="lp-hero-typed">{typed}</p>

        <p className="lp-hero-sub">
          学径融合多 Agent 协作、RAG 知识检索与个性化推荐，
          <br />
          从对话到画像，从路径到资源，全程 AI 陪伴
        </p>

        <div className="lp-hero-actions">
          <button className="lp-btn-primary" onClick={goLogin}>
            开始学习之旅
          </button>
          <button className="lp-btn-ghost" onClick={goLogin}>
            快速体验 Demo
          </button>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="lp-stats lp-fade-in-1">
        {STATS.map((s) => (
          <div className="lp-stat-card" key={s.label}>
            <div className="lp-stat-value" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="lp-stat-label">{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Features ── */}
      <section className="lp-features lp-fade-in-2">
        <div className="lp-section-header">
          <div className="lp-section-tag">核心功能</div>
          <h2 className="lp-section-title">一站式智能学习体验</h2>
          <p className="lp-section-desc">
            六大核心模块，覆盖学习全生命周期
          </p>
        </div>

        <div className="lp-features-grid">
          {FEATURES.map((f, i) => (
            <div
              className="lp-feature-card"
              key={f.title}
              style={
                {
                  "--card-color": f.color,
                  "--card-glow": f.glow,
                  animationDelay: `${0.08 * i}s`,
                } as React.CSSProperties
              }
            >
              <div
                className="lp-feature-icon"
                style={{ background: f.glow, color: f.color }}
              >
                {f.icon}
              </div>
              <div className="lp-feature-title">{f.title}</div>
              <div className="lp-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 底部 CTA ── */}
      <section className="lp-cta lp-fade-in-3">
        <h2 className="lp-cta-title">准备好开始了吗？</h2>
        <p className="lp-cta-sub">加入学径，体验 AI 驱动的下一代学习方式</p>
        <button className="lp-btn-primary lp-btn-lg" onClick={goLogin}>
          立即免费体验
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        © 2026 学径 LearnPath · 2026 全国软件创新大赛 A3 赛题作品
      </footer>
    </div>
  );
}
