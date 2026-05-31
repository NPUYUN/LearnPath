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
import NodeIndexOutlined from "@ant-design/icons/NodeIndexOutlined";
import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import ReadOutlined from "@ant-design/icons/ReadOutlined";
import CodeOutlined from "@ant-design/icons/CodeOutlined";
import FileTextOutlined from "@ant-design/icons/FileTextOutlined";
import VideoCameraOutlined from "@ant-design/icons/VideoCameraOutlined";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import DatabaseOutlined from "@ant-design/icons/DatabaseOutlined";
import CloudOutlined from "@ant-design/icons/CloudOutlined";
import { useAppStore } from "@/store/appStore";

const WORKFLOW = [
  {
    step: "01",
    title: "对话建画像",
    desc: "自然语言描述背景与目标，7 维学情自动抽取，雷达图即时可视化",
    icon: <UserOutlined />,
    accent: "#a855f7",
    detail: "ProfileAgent · 随学随新",
  },
  {
    step: "02",
    title: "多 Agent 生成",
    desc: "文档、导图、题库、分镜、代码等 9 类资源按主题协同产出",
    icon: <BookOutlined />,
    accent: "#f59e0b",
    detail: "RAG grounding · SSE 进度",
  },
  {
    step: "03",
    title: "路径与推送",
    desc: "薄弱点驱动分阶段计划，侧栏与对话页推荐下一步资源",
    icon: <ApartmentOutlined />,
    accent: "#2bc0b4",
    detail: "PathAgent · 步骤 PATCH",
  },
  {
    step: "04",
    title: "评估闭环",
    desc: "测验提交后更新画像、重规划路径，评估页追踪成长轨迹",
    icon: <BarChartOutlined />,
    accent: "#ef4444",
    detail: "EvalAgent · 事件时间线",
  },
];

const BENTO_FEATURES = [
  {
    id: "chat",
    size: "hero" as const,
    icon: <MessageOutlined />,
    title: "AI 导师对话",
    desc: "流式答疑 + 资源库 RAG 优先检索，支持深度思考与联网补充",
    tags: ["SSE 流式", "附件解析", "多模态回答"],
    color: "#4f8ef7",
    glow: "rgba(79,142,247,0.25)",
  },
  {
    id: "resources",
    size: "wide" as const,
    icon: <BookOutlined />,
    title: "多媒体资源生成",
    desc: "讲解文档 · 思维导图 · 习题 · 分镜 · 代码 · 课件 · 实践项目",
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.2)",
  },
  {
    id: "profile",
    size: "tall" as const,
    icon: <UserOutlined />,
    title: "学习画像",
    desc: "雷达图可视化 7 维学情，随对话与测验动态更新",
    color: "#a855f7",
    glow: "rgba(168,85,247,0.22)",
  },
  {
    id: "path",
    size: "sm" as const,
    icon: <ApartmentOutlined />,
    title: "智能路径",
    desc: "分阶段目标与资源关联",
    color: "#2bc0b4",
    glow: "rgba(43,192,180,0.2)",
  },
  {
    id: "eval",
    size: "sm" as const,
    icon: <BarChartOutlined />,
    title: "效果评估",
    desc: "雷达对比与学习事件时间线",
    color: "#ef4444",
    glow: "rgba(239,68,68,0.18)",
  },
  {
    id: "rag",
    size: "sm" as const,
    icon: <NodeIndexOutlined />,
    title: "知识图谱 RAG",
    desc: "课程库 + 上传资料双向检索",
    color: "#10b981",
    glow: "rgba(16,185,129,0.2)",
  },
];

const SHOWCASE_ROWS = [
  {
    id: "profile",
    tag: "学习画像",
    title: "七维雷达，一眼看懂学情",
    desc: "知识基础、认知风格、薄弱点、偏好模态等维度自动抽取，对话与测验持续刷新，告别冗长表单。",
    bullets: ["雷达图 + 维度卡片", "薄弱点自动写入路径", "与账号资料分离"],
    accent: "#a855f7",
    visual: "radar" as const,
  },
  {
    id: "resources",
    tag: "资源库",
    title: "九类资源，一次生成",
    desc: "选择资料库或全网检索作为上下文，Doc / Quiz / Media 等 Agent 串行协作并经过质检。",
    bullets: ["按阶段 + 类型浏览", "Markdown 预览与下载", "收藏与完成埋点"],
    accent: "#f59e0b",
    visual: "resources" as const,
    reverse: true,
  },
  {
    id: "path",
    tag: "学习路径",
    title: "动态规划，步步可执行",
    desc: "结合画像与已生成资源输出 3+ 阶段计划，每步关联具体资源 ID，支持标记完成与重新规划。",
    bullets: ["总进度环 + 步骤卡", "测验后自动调整", "侧栏今日推荐"],
    accent: "#2bc0b4",
    visual: "path" as const,
  },
];

const TECH_STACK = [
  { icon: <NodeIndexOutlined />, name: "LangGraph", desc: "多智能体编排", color: "#a855f7" },
  { icon: <DatabaseOutlined />, name: "ChromaDB", desc: "向量检索 RAG", color: "#10b981" },
  { icon: <ThunderboltOutlined />, name: "FastAPI", desc: "SSE 流式 API", color: "#4f8ef7" },
  { icon: <CloudOutlined />, name: "星火 / Kimi", desc: "大模型推理", color: "#36cfc9" },
  { icon: <RocketOutlined />, name: "Next.js 14", desc: "Keep-alive 前端", color: "#f59e0b" },
  { icon: <BarChartOutlined />, name: "ECharts", desc: "画像与评估可视化", color: "#ef4444" },
];

const AGENTS = [
  { name: "Supervisor", role: "意图路由", x: 50, y: 8 },
  { name: "Profile", role: "画像", x: 18, y: 38 },
  { name: "Doc", role: "文档", x: 38, y: 62 },
  { name: "Quiz", role: "题库", x: 58, y: 62 },
  { name: "Path", role: "路径", x: 78, y: 38 },
  { name: "Tutor", role: "辅导", x: 82, y: 78 },
  { name: "Eval", role: "评估", x: 50, y: 88 },
  { name: "Media", role: "分镜", x: 18, y: 78 },
];

const MARQUEE_ITEMS = [
  "LangGraph 多智能体",
  "Chroma RAG",
  "讯飞星火 / Kimi",
  "9 类资源生成",
  "SSE 流式交互",
  "个性化推荐",
  "学习闭环",
  "Keep-alive 前端",
];

const PREVIEW_NAV = [
  { id: "chat" as const, label: "智能对话", short: "对话", icon: <MessageOutlined />, accent: "#1677ff" },
  { id: "profile" as const, label: "学习画像", short: "画像", icon: <UserOutlined />, accent: "#722ed1" },
  { id: "path" as const, label: "学习路径", short: "路径", icon: <ApartmentOutlined />, accent: "#13c2c2" },
  { id: "resources" as const, label: "资源库", short: "资源", icon: <ReadOutlined />, accent: "#fa8c16" },
  { id: "evaluation" as const, label: "学习评估", short: "评估", icon: <BarChartOutlined />, accent: "#52c41a" },
];

type PreviewPageId = (typeof PREVIEW_NAV)[number]["id"];

const RESOURCE_MOCK = [
  { type: "doc", title: "线性回归讲义", icon: <FileTextOutlined /> },
  { type: "quiz", title: "巩固练习 ×3", icon: <BookOutlined /> },
  { type: "code", title: "Python 拟合案例", icon: <CodeOutlined /> },
  { type: "media", title: "分镜讲解脚本", icon: <VideoCameraOutlined /> },
];

const PATH_MOCK = [
  { title: "导论与数学基础", status: "done", pct: 100 },
  { title: "薄弱点：线性回归", status: "active", pct: 45 },
  { title: "模型评估与巩固", status: "pending", pct: 0 },
];

function useTypewriter(text: string, delay = 48) {
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

function LandingBackground() {
  return (
    <div className="lp-bg-layers" aria-hidden>
      <div className="lp-bg-aurora" />
      <div className="lp-bg-grid" />
      <div className="lp-bg-dots" />
      <div className="lp-bg-noise" />
      <div className="lp-bg-vignette" />
    </div>
  );
}

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

    const colors = ["100,160,255", "168,85,247", "43,192,180", "245,158,11"];
    const N = 64;
    const particles = Array.from({ length: N }, (_, idx) => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.3,
      vx: (Math.random() - 0.5) * 0.32,
      vy: (Math.random() - 0.5) * 0.32,
      alpha: Math.random() * 0.5 + 0.1,
      color: colors[idx % colors.length],
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
        ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
        ctx.fill();
      }
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(100,160,255,${0.07 * (1 - dist / 110)})`;
            ctx.lineWidth = 0.5;
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

  return <canvas ref={canvasRef} className="lp-canvas" aria-hidden />;
}

function PreviewRadarChart() {
  const points = "50,14 76,34 70,66 30,66 24,34";
  return (
    <svg viewBox="0 0 100 80" className="lp-mock-radar">
      {[18, 32, 46].map((r) => (
        <polygon
          key={r}
          points={`50,${50 - r * 0.58} ${50 + r * 0.52},${50 - r * 0.18} ${50 + r * 0.34},${50 + r * 0.42} ${50 - r * 0.34},${50 + r * 0.42} ${50 - r * 0.52},${50 - r * 0.18}`}
          fill="none"
          stroke="rgba(114,46,209,0.22)"
          strokeWidth="0.6"
        />
      ))}
      <polygon points={points} fill="rgba(114,46,209,0.28)" stroke="#722ed1" strokeWidth="1.2" />
    </svg>
  );
}

function PreviewPageChat() {
  return (
    <div className="lp-mock-page lp-mock-page--chat">
      <div className="lp-mock-chat-list">
        <div className="lp-mock-bubble lp-mock-bubble--user">
          我是计算机专业，线性回归比较薄弱，希望偏实践学习
        </div>
        <div className="lp-mock-bubble lp-mock-bubble--assistant">
          已根据你的描述更新学习画像，薄弱点包含<strong>线性回归</strong>与<strong>梯度下降</strong>。需要我现在为你生成配套学习资源吗？
        </div>
      </div>
      <div className="lp-mock-composer">
        <span>输入消息，或上传课件…</span>
        <em>发送</em>
      </div>
    </div>
  );
}

function PreviewPageProfile() {
  const dims = [
    { label: "知识基础", val: "入门偏上", pct: 68 },
    { label: "认知风格", val: "偏实践", pct: 74 },
    { label: "偏好模态", val: "文档+练习", pct: 72 },
  ];
  return (
    <div className="lp-mock-page lp-mock-page--profile">
      <div className="lp-mock-profile-grid">
        <div className="lp-mock-radar-wrap">
          <PreviewRadarChart />
          <p className="lp-mock-radar-caption">七维学情雷达</p>
        </div>
        <div className="lp-mock-dim-list">
          {dims.map((d) => (
            <div key={d.label} className="lp-mock-dim-row">
              <div className="lp-mock-dim-head">
                <span>{d.label}</span>
                <small>{d.val}</small>
              </div>
              <div className="lp-mock-dim-bar">
                <i style={{ width: `${d.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewPageResources() {
  return (
    <div className="lp-mock-page lp-mock-page--resources">
      <div className="lp-mock-res-toolbar">
        <span className="lp-mock-chip lp-mock-chip--active">全部</span>
        <span className="lp-mock-chip">文档</span>
        <span className="lp-mock-chip">练习</span>
        <span className="lp-mock-chip">代码</span>
      </div>
      <ul className="lp-mock-res-list">
        {RESOURCE_MOCK.map((r) => (
          <li key={r.title}>
            <span className="lp-mock-res-icon">{r.icon}</span>
            <div>
              <strong>{r.title}</strong>
              <small>机器学习导论 · 线性回归</small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewPagePath() {
  return (
    <div className="lp-mock-page lp-mock-page--path">
      <div className="lp-mock-path-progress">
        <span>总进度</span>
        <div className="lp-mock-path-bar">
          <i style={{ width: "48%" }} />
        </div>
        <strong>48%</strong>
      </div>
      <ul className="lp-mock-path-list">
        {PATH_MOCK.map((s, i) => (
          <li key={s.title} className={`lp-mock-path-item lp-mock-path-item--${s.status}`}>
            <span className="lp-mock-path-order">{i + 1}</span>
            <div>
              <strong>{s.title}</strong>
              <small>
                {s.status === "done" ? "已完成" : s.status === "active" ? "进行中" : "待开始"}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewPageEvaluation() {
  const stats = [
    { label: "学习资源", value: "12" },
    { label: "画像完整度", value: "86%" },
    { label: "学习天数", value: "5" },
    { label: "路径步骤", value: "3" },
  ];
  return (
    <div className="lp-mock-page lp-mock-page--eval">
      <div className="lp-mock-eval-grid">
        {stats.map((s) => (
          <div key={s.label} className="lp-mock-eval-stat">
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="lp-mock-eval-chart">
        <PreviewRadarChart />
        <p>学习前后能力对比</p>
      </div>
    </div>
  );
}

const PREVIEW_PAGE_CONTENT: Record<PreviewPageId, () => React.ReactNode> = {
  chat: PreviewPageChat,
  profile: PreviewPageProfile,
  path: PreviewPagePath,
  resources: PreviewPageResources,
  evaluation: PreviewPageEvaluation,
};

function AppPreviewCarousel() {
  const [pageIdx, setPageIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setFade(false);
      window.setTimeout(() => {
        setPageIdx((i) => (i + 1) % PREVIEW_NAV.length);
        setFade(true);
      }, 220);
    }, 4800);
    return () => clearInterval(id);
  }, []);

  const page = PREVIEW_NAV[pageIdx];
  const PageBody = PREVIEW_PAGE_CONTENT[page.id];

  return (
    <div className="lp-app-preview" aria-hidden>
      <div className="lp-app-preview-chrome">
        <span className="lp-preview-dot lp-preview-dot--r" />
        <span className="lp-preview-dot lp-preview-dot--y" />
        <span className="lp-preview-dot lp-preview-dot--g" />
        <span className="lp-preview-url">learnpath · {page.short}</span>
        <span className="lp-preview-live">
          <i /> 在线
        </span>
      </div>
      <div className="lp-app-preview-shell">
        <aside className="lp-app-preview-sider">
          <div className="lp-app-preview-brand">
            <BulbOutlined /> 学径
          </div>
          <nav className="lp-app-preview-nav">
            {PREVIEW_NAV.map((item) => {
              const active = item.id === page.id;
              return (
                <div
                  key={item.id}
                  className={`lp-app-preview-nav-item ${active ? "lp-app-preview-nav-item--active" : ""}`}
                  style={
                    active
                      ? ({ "--nav-accent": item.accent } as React.CSSProperties)
                      : undefined
                  }
                >
                  {item.icon}
                  <span>{item.short}</span>
                </div>
              );
            })}
          </nav>
          <div className="lp-app-preview-sider-foot">
            <small>演示学生</small>
            <span>机器学习导论</span>
          </div>
        </aside>
        <div className="lp-app-preview-main">
          <header className="lp-app-preview-header">
            <div>
              <h3>{page.label}</h3>
              <p>与登录后主界面一致 · 自动轮播预览</p>
            </div>
            <span className="lp-app-preview-step">{String(pageIdx + 1).padStart(2, "0")} / {PREVIEW_NAV.length}</span>
          </header>
          <div className={`lp-app-preview-content ${fade ? "lp-app-preview-content--in" : "lp-app-preview-content--out"}`}>
            <PageBody />
          </div>
          <div className="lp-app-preview-dots">
            {PREVIEW_NAV.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={`lp-app-preview-dot ${i === pageIdx ? "lp-app-preview-dot--active" : ""}`}
                style={i === pageIdx ? ({ "--nav-accent": item.accent } as React.CSSProperties) : undefined}
                aria-label={item.label}
                onClick={() => {
                  setFade(false);
                  window.setTimeout(() => {
                    setPageIdx(i);
                    setFade(true);
                  }, 180);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShowcaseVisual({ type, accent }: { type: string; accent: string }) {
  if (type === "radar") {
    return (
      <div className="lp-showcase-visual lp-showcase-visual--radar" style={{ "--sv-accent": accent } as React.CSSProperties}>
        <div className="lp-mock-radar-wrap">
          <PreviewRadarChart />
        </div>
        <div className="lp-showcase-dim-grid">
          {["知识基础", "认知风格", "薄弱点", "偏好模态", "学习节奏", "近期进度"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      </div>
    );
  }
  if (type === "resources") {
    return (
      <div className="lp-showcase-visual lp-showcase-visual--grid" style={{ "--sv-accent": accent } as React.CSSProperties}>
        {RESOURCE_MOCK.map((r, i) => (
          <div key={r.title} className="lp-showcase-res-card" style={{ animationDelay: `${i * 0.08}s` }}>
            <span className="lp-showcase-res-icon">{r.icon}</span>
            <span>{r.title}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="lp-showcase-visual lp-showcase-visual--path" style={{ "--sv-accent": accent } as React.CSSProperties}>
      <PreviewPagePath />
    </div>
  );
}

function AgentHub() {
  return (
    <div className="lp-agent-hub">
      <svg className="lp-agent-hub-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="50" y1="12" x2="18" y2="38" stroke="rgba(168,85,247,0.3)" strokeWidth="0.4" />
        <line x1="50" y1="12" x2="78" y2="38" stroke="rgba(168,85,247,0.3)" strokeWidth="0.4" />
        <line x1="50" y1="12" x2="38" y2="62" stroke="rgba(79,142,247,0.25)" strokeWidth="0.4" />
        <line x1="50" y1="12" x2="58" y2="62" stroke="rgba(79,142,247,0.25)" strokeWidth="0.4" />
        <line x1="38" y1="62" x2="50" y2="88" stroke="rgba(43,192,180,0.25)" strokeWidth="0.4" />
        <line x1="58" y1="62" x2="50" y2="88" stroke="rgba(43,192,180,0.25)" strokeWidth="0.4" />
        <line x1="78" y1="38" x2="82" y2="78" stroke="rgba(245,158,11,0.25)" strokeWidth="0.4" />
        <line x1="18" y1="38" x2="18" y2="78" stroke="rgba(245,158,11,0.25)" strokeWidth="0.4" />
      </svg>
      {AGENTS.map((a, i) => (
        <div
          key={a.name}
          className={`lp-agent-hub-node ${a.name === "Supervisor" ? "lp-agent-hub-node--core" : ""}`}
          style={{ left: `${a.x}%`, top: `${a.y}%`, animationDelay: `${i * 0.06}s` }}
        >
          <strong>{a.name}</strong>
          <small>{a.role}</small>
        </div>
      ))}
    </div>
  );
}

export default function LandingContent() {
  const setShowLanding = useAppStore((s) => s.setShowLanding);
  const typed = useTypewriter("对话 · 画像 · 资源 · 路径 —— 一条完整的 AI 学习链路");

  const goLogin = () => setShowLanding(false);

  return (
    <div className="lp-root">
      <LandingBackground />
      <ParticleCanvas />
      <div className="lp-orb lp-orb-1" />
      <div className="lp-orb lp-orb-2" />
      <div className="lp-orb lp-orb-3" />
      <div className="lp-orb lp-orb-4" />
      <div className="lp-orb lp-orb-5" />

      <nav className="lp-nav">
        <div className="lp-nav-brand">
          <div className="lp-nav-icon">
            <BulbOutlined style={{ fontSize: 18, color: "#4f8ef7" }} />
          </div>
          <span className="lp-nav-name">学径</span>
          <span className="lp-nav-sub">LearnPath</span>
        </div>
        <div className="lp-nav-actions">
          <button
            type="button"
            className="lp-nav-link"
            onClick={() => document.getElementById("lp-showcase")?.scrollIntoView({ behavior: "smooth" })}
          >
            产品预览
          </button>
          <button
            type="button"
            className="lp-nav-link"
            onClick={() => document.getElementById("lp-workflow")?.scrollIntoView({ behavior: "smooth" })}
          >
            如何工作
          </button>
          <Button type="primary" size="middle" className="lp-login-btn" onClick={goLogin}>
            登录 / 注册 →
          </Button>
        </div>
      </nav>

      <section className="lp-hero-split lp-fade-in">
        <div className="lp-hero-copy">
          <div className="lp-hero-badge">
            <RocketOutlined style={{ marginRight: 6 }} />
            个性化学习多智能体系统
          </div>
          <h1 className="lp-hero-title lp-hero-title--left">
            不是又一个
            <br />
            <span className="lp-gradient-text">聊天机器人</span>
          </h1>
          <p className="lp-hero-typed lp-hero-typed--left">{typed}</p>
          <p className="lp-hero-sub lp-hero-sub--left">
            学径用 LangGraph 编排 9 类专业 Agent，结合课程 RAG 与学情画像，
            为每位学习者生成可 grounding 的多模态资源，并动态规划学习路径。
          </p>
          <div className="lp-hero-actions lp-hero-actions--left">
            <button type="button" className="lp-btn-primary" onClick={goLogin}>
              <ThunderboltOutlined style={{ marginRight: 8 }} />
              开始学习之旅
            </button>
            <button type="button" className="lp-btn-ghost" onClick={goLogin}>
              一键 Demo 体验
            </button>
          </div>
          <div className="lp-hero-metrics">
            <div className="lp-hero-metric">
              <strong>9</strong>
              <span>资源 Agent</span>
            </div>
            <div className="lp-hero-metric-divider" />
            <div className="lp-hero-metric">
              <strong>7</strong>
              <span>画像维度</span>
            </div>
            <div className="lp-hero-metric-divider" />
            <div className="lp-hero-metric">
              <strong>RAG</strong>
              <span>知识 grounding</span>
            </div>
          </div>
        </div>
        <AppPreviewCarousel />
      </section>

      <div className="lp-marquee-wrap lp-fade-in-1" aria-hidden>
        <div className="lp-marquee">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={`${item}-${i}`} className="lp-marquee-item">
              {item}
            </span>
          ))}
        </div>
      </div>

      <section id="lp-workflow" className="lp-workflow lp-section-band lp-fade-in-1">
        <div className="lp-section-header lp-section-header--split">
          <div>
            <div className="lp-section-tag">学习闭环</div>
            <h2 className="lp-section-title">四步完成个性化学习</h2>
            <p className="lp-section-desc">从第一次对话到路径调整，数据在各模块间自动流转</p>
          </div>
          <div className="lp-workflow-legend">
            <span><i className="lp-legend-dot lp-legend-dot--purple" /> 画像</span>
            <span><i className="lp-legend-dot lp-legend-dot--amber" /> 生成</span>
            <span><i className="lp-legend-dot lp-legend-dot--teal" /> 路径</span>
            <span><i className="lp-legend-dot lp-legend-dot--red" /> 评估</span>
          </div>
        </div>
        <div className="lp-workflow-track">
          {WORKFLOW.map((w, i) => (
            <article
              key={w.step}
              className="lp-workflow-step"
              style={{ "--wf-accent": w.accent, animationDelay: `${0.1 * i}s` } as React.CSSProperties}
            >
              <div className="lp-workflow-step-head">
                <span className="lp-workflow-num">{w.step}</span>
                <span className="lp-workflow-icon">{w.icon}</span>
              </div>
              <h3 className="lp-workflow-title">{w.title}</h3>
              <p className="lp-workflow-desc">{w.desc}</p>
              <span className="lp-workflow-detail">{w.detail}</span>
              {i < WORKFLOW.length - 1 && <span className="lp-workflow-arrow" aria-hidden>→</span>}
            </article>
          ))}
        </div>
      </section>

      <section id="lp-showcase" className="lp-showcase-rows lp-section-band lp-section-band--glow lp-fade-in-2">
        {SHOWCASE_ROWS.map((row, i) => (
          <article
            key={row.id}
            className={`lp-showcase-row ${row.reverse ? "lp-showcase-row--reverse" : ""}`}
            style={{ animationDelay: `${0.1 * i}s` }}
          >
            <div className="lp-showcase-copy">
              <div className="lp-section-tag" style={{ borderColor: `${row.accent}55`, color: row.accent }}>
                {row.tag}
              </div>
              <h3 className="lp-showcase-title">{row.title}</h3>
              <p className="lp-showcase-desc">{row.desc}</p>
              <ul className="lp-showcase-bullets">
                {row.bullets.map((b) => (
                  <li key={b}>
                    <CheckCircleOutlined style={{ color: row.accent }} /> {b}
                  </li>
                ))}
              </ul>
            </div>
            <ShowcaseVisual type={row.visual} accent={row.accent} />
          </article>
        ))}
      </section>

      <section className="lp-bento-section lp-section-band lp-fade-in-2">
        <div className="lp-section-header">
          <div className="lp-section-tag">能力矩阵</div>
          <h2 className="lp-section-title">核心模块一览</h2>
          <p className="lp-section-desc">Bento 栅格与下方技术栈，覆盖对话、画像、资源、路径与评估等核心能力</p>
        </div>
        <div className="lp-bento">
          {BENTO_FEATURES.map((f, i) => (
            <article
              key={f.id}
              className={`lp-bento-card lp-bento-card--${f.size}`}
              style={
                {
                  "--card-color": f.color,
                  "--card-glow": f.glow,
                  animationDelay: `${0.06 * i}s`,
                } as React.CSSProperties
              }
            >
              <div className="lp-bento-icon" style={{ background: f.glow, color: f.color }}>
                {f.icon}
              </div>
              <h3 className="lp-bento-title">{f.title}</h3>
              <p className="lp-bento-desc">{f.desc}</p>
              {"tags" in f && f.tags && (
                <div className="lp-bento-tags">
                  {f.tags.map((t) => (
                    <span key={t} className="lp-bento-tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {f.id === "resources" && (
                <div className="lp-bento-mini-icons" aria-hidden>
                  <CodeOutlined />
                  <ReadOutlined />
                  <BookOutlined />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="lp-tech-section lp-fade-in-2">
        <div className="lp-section-header">
          <div className="lp-section-tag">技术栈</div>
          <h2 className="lp-section-title">工程化实现</h2>
        </div>
        <div className="lp-tech-mosaic">
          {TECH_STACK.map((t, i) => (
            <div
              key={t.name}
              className="lp-tech-tile"
              style={{ "--tech-color": t.color, animationDelay: `${0.05 * i}s` } as React.CSSProperties}
            >
              <span className="lp-tech-icon" style={{ color: t.color }}>
                {t.icon}
              </span>
              <strong>{t.name}</strong>
              <span>{t.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-agents-section lp-section-band lp-fade-in-2">
        <div className="lp-section-header">
          <div className="lp-section-tag">多智能体</div>
          <h2 className="lp-section-title">LangGraph 协作拓扑</h2>
          <p className="lp-section-desc">Supervisor 意图路由，专项 Agent 分工生成与规划</p>
        </div>
        <AgentHub />
      </section>

      <section className="lp-cta lp-fade-in-3">
        <div className="lp-cta-card">
          <div className="lp-cta-glow" aria-hidden />
          <h2 className="lp-cta-title">3 分钟看见完整链路</h2>
          <p className="lp-cta-sub">登录 → 对话建画像 → 生成资源 → 规划路径，答辩演示即可复现</p>
          <div className="lp-cta-actions">
            <button type="button" className="lp-btn-primary lp-btn-lg" onClick={goLogin}>
              立即免费体验
            </button>
            <button type="button" className="lp-btn-ghost" onClick={goLogin}>
              查看 Demo 数据
            </button>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        © 2026 学径 LearnPath · 个性化 AI 学习平台
      </footer>
    </div>
  );
}
