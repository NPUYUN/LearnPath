"use client";

import { useCallback, useEffect, useState } from "react";
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
import { BRAND_CN, BRAND_EN, BRAND_TITLE } from "@/lib/brand";

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
    desc: "知识基础、认知风格、薄弱点、偏好模态等维度自动抽取，对话与测验持续刷新。",
    bullets: ["雷达图 + 维度卡片", "薄弱点自动写入路径", "与账号资料分离"],
    accent: "#a855f7",
    visual: "radar" as const,
  },
  {
    id: "resources",
    tag: "资源库",
    title: "九类资源，一次生成",
    desc: "选择资料库或全网检索作为上下文，多 Agent 串行协作并经过质检。",
    bullets: ["按阶段 + 类型浏览", "Markdown 预览与下载", "收藏与完成埋点"],
    accent: "#f59e0b",
    visual: "resources" as const,
    reverse: true,
  },
  {
    id: "path",
    tag: "学习路径",
    title: "动态规划，步步可执行",
    desc: "结合画像与已生成资源输出阶段计划，每步关联具体资源，支持重规划。",
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

const AGENT_CHIPS = [
  { name: "Supervisor", role: "意图路由", color: "#4f8ef7" },
  { name: "Profile", role: "学习画像", color: "#a855f7" },
  { name: "Doc / Quiz", role: "内容生成", color: "#f59e0b" },
  { name: "Path", role: "路径规划", color: "#2bc0b4" },
  { name: "Tutor", role: "实时辅导", color: "#36cfc9" },
  { name: "Eval", role: "效果评估", color: "#ef4444" },
  { name: "Media", role: "分镜脚本", color: "#ec4899" },
];

const HERO_METRICS = [
  { value: "9+", label: "资源类型" },
  { value: "7", label: "学情维度" },
  { value: "5", label: "核心模块" },
  { value: "∞", label: "动态路径" },
];

const SYSTEM_LOOP = [
  {
    title: "智能对话",
    role: "入口",
    desc: "学生提问、暴露困惑、触发资源和课堂",
    icon: <MessageOutlined />,
    accent: "#4f8ef7",
  },
  {
    title: "学习画像",
    role: "大脑",
    desc: "长期画像与实时状态决定 AI 的讲法",
    icon: <UserOutlined />,
    accent: "#a855f7",
  },
  {
    title: "资源库",
    role: "素材",
    desc: "讲义、课件、练习和案例的内容来源",
    icon: <BookOutlined />,
    accent: "#f59e0b",
  },
  {
    title: "学习路径",
    role: "主线",
    desc: "安排下一节课、下一份资源和下一次练习",
    icon: <ApartmentOutlined />,
    accent: "#2bc0b4",
  },
  {
    title: "AI 课堂",
    role: "执行场景",
    desc: "在路径节点中开课，实时调整讲解与练习",
    icon: <VideoCameraOutlined />,
    accent: "#10b981",
  },
  {
    title: "学习评估",
    role: "校准",
    desc: "测验和作业结果反哺画像与路径",
    icon: <BarChartOutlined />,
    accent: "#ef4444",
  },
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

function LandingBackground() {
  return (
    <div className="lp-bg-layers" aria-hidden>
      <div className="lp-bg-aurora" />
      <div className="lp-bg-spotlight" />
      <div className="lp-bg-grid" />
      <div className="lp-bg-vignette" />
    </div>
  );
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
        <span className="lp-preview-url">{BRAND_EN} · {page.short}</span>
        <span className="lp-preview-live">
          <i /> 在线
        </span>
      </div>
      <div className="lp-app-preview-shell">
        <aside className="lp-app-preview-sider">
          <div className="lp-app-preview-brand">
            <BulbOutlined /> {BRAND_CN}
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

function SystemLoopMapContent() {
  return (
    <>
      <div className="lp-section-header lp-section-header--left">
        <div className="lp-section-tag">系统结构</div>
        <h2 className="lp-section-title">AI 课堂长在学习路径里，不额外制造孤岛</h2>
        <p className="lp-section-desc">
          五个模块分别承担入口、大脑、素材、主线和校准；课堂只是路径节点里的执行场景。
        </p>
      </div>
      <div className="lp-system-map-grid">
        {SYSTEM_LOOP.map((item, index) => (
          <article
            key={item.title}
            className={`lp-system-map-card ${item.title === "AI 课堂" ? "lp-system-map-card--classroom" : ""}`}
            style={{ "--loop-accent": item.accent, animationDelay: `${index * 0.05}s` } as React.CSSProperties}
          >
            <div className="lp-system-map-card-top">
              <span className="lp-system-map-icon">{item.icon}</span>
              <em>{item.role}</em>
            </div>
            <strong>{item.title}</strong>
            <p>{item.desc}</p>
          </article>
        ))}
      </div>
    </>
  );
}


function ShowcaseStack() {
  return (
    <div className="lp-showcase-stack">
      {SHOWCASE_ROWS.map((row) => (
        <article
          key={row.id}
          className={`lp-showcase-row ${row.reverse ? "lp-showcase-row--reverse" : ""}`}
        >
          <div className="lp-showcase-copy">
            <div
              className="lp-section-tag lp-section-tag--accent"
              style={{ "--tag-accent": row.accent } as React.CSSProperties}
            >
              {row.tag}
            </div>
            <h3 className="lp-showcase-title">{row.title}</h3>
            <p className="lp-showcase-desc">{row.desc}</p>
            <ul className="lp-showcase-bullets">
              {row.bullets.map((bullet) => (
                <li key={bullet}>
                  <CheckCircleOutlined style={{ color: row.accent }} />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
          <ShowcaseVisual type={row.visual} accent={row.accent} />
        </article>
      ))}
    </div>
  );
}

function AgentChipRow() {
  return (
    <div className="lp-agent-chips" aria-label="多智能体分工">
      {AGENT_CHIPS.map((agent, index) => (
        <article
          key={agent.name}
          className="lp-agent-chip"
          style={{ "--chip-color": agent.color, animationDelay: `${index * 0.05}s` } as React.CSSProperties}
        >
          <span className="lp-agent-chip-dot" />
          <div>
            <strong>{agent.name}</strong>
            <small>{agent.role}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function LandingContent() {
  const setShowLanding = useAppStore((s) => s.setShowLanding);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goLogin = () => setShowLanding(false);
  const goDocs = () => {
    window.location.href = "/docs";
  };
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="lp-root">
      <LandingBackground />

      <header className={`lp-nav${navScrolled ? " lp-nav--scrolled" : ""}`}>
        <div className="lp-container lp-nav-inner">
          <div className="lp-nav-brand">
            <div className="lp-nav-icon">
              <BulbOutlined style={{ fontSize: 18, color: "#4f8ef7" }} />
            </div>
            <span className="lp-nav-name">{BRAND_CN}</span>
            <span className="lp-nav-sub">{BRAND_EN}</span>
          </div>
          <div className="lp-nav-actions">
            <button type="button" className="lp-nav-link" onClick={() => scrollTo("lp-showcase")}>
              产品预览
            </button>
            <button type="button" className="lp-nav-link" onClick={() => scrollTo("lp-how")}>
              如何工作
            </button>
            <button type="button" className="lp-nav-link" onClick={goDocs}>
              项目文档
            </button>
            <button type="button" className="lp-btn-primary lp-btn-nav" onClick={goLogin}>
              登录 / 注册
            </button>
          </div>
        </div>
      </header>

      <section className="lp-hero-split lp-screen lp-fade-in">
          <div className="lp-hero-copy">
            <div className="lp-hero-badge">
              <RocketOutlined style={{ marginRight: 6 }} />
              个性化学习多智能体系统
            </div>
            <h1 className="lp-hero-title">
              你的
              <br />
              <span className="lp-gradient-text">AI 学习工作台</span>
            </h1>
            <p className="lp-hero-brand">{BRAND_CN} · {BRAND_EN}</p>
            <p className="lp-hero-tagline">
              说清正在学什么、哪里不会；答疑、资料、路径与评估整理到同一工作台。
            </p>
            <div className="lp-hero-actions">
              <button type="button" className="lp-btn-primary" onClick={goLogin}>
                <ThunderboltOutlined style={{ marginRight: 8 }} />
                开始使用
              </button>
              <button type="button" className="lp-btn-ghost" onClick={goLogin}>
                体验演示账号
              </button>
            </div>
            <div className="lp-hero-metrics">
              {HERO_METRICS.map((metric, index) => (
                <div key={metric.label} className="lp-hero-metric-wrap">
                  {index > 0 ? <span className="lp-hero-metric-divider" aria-hidden /> : null}
                  <div className="lp-hero-metric">
                    <strong>{metric.value}</strong>
                    <span>{metric.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="lp-hero-preview-col">
            <div className="lp-hero-preview-glow" aria-hidden />
            <AppPreviewCarousel />
          </div>
      </section>

      <section id="lp-how" className="lp-section lp-container">
          <SystemLoopMapContent />
          <div className="lp-block-gap" />
          <div className="lp-section-header lp-section-header--split">
            <div>
              <div className="lp-section-tag">学习闭环</div>
              <h2 className="lp-section-title">四步完成个性化学习</h2>
              <p className="lp-section-desc">从第一次对话到路径调整，数据在各模块间自动流转。</p>
            </div>
          </div>
          <div className="lp-workflow-track">
            {WORKFLOW.map((item, index) => (
              <article
                key={item.title}
                className="lp-workflow-step"
                style={{ "--wf-accent": item.accent, animationDelay: `${index * 0.06}s` } as React.CSSProperties}
              >
                <div className="lp-workflow-step-head">
                  <span className="lp-workflow-num">{item.step}</span>
                  <span className="lp-workflow-icon">{item.icon}</span>
                </div>
                <h3 className="lp-workflow-title">{item.title}</h3>
                <p className="lp-workflow-desc">{item.desc}</p>
                <span className="lp-workflow-detail">{item.detail}</span>
              </article>
            ))}
          </div>
      </section>

      <section id="lp-showcase" className="lp-section lp-container lp-panel--showcase">
          <div className="lp-section-header lp-section-header--center">
            <div className="lp-section-tag">产品预览</div>
            <h2 className="lp-section-title">核心场景一览</h2>
            <p className="lp-section-desc">画像、资源与路径在同一工作台里连贯呈现。</p>
          </div>
          <ShowcaseStack />
      </section>

      <section id="lp-capabilities" className="lp-section lp-container lp-panel--capabilities">
          <div className="lp-section-header lp-section-header--center">
            <div className="lp-section-tag">核心能力</div>
            <h2 className="lp-section-title">模块、工程与 Agent 协作</h2>
            <p className="lp-section-desc">从交互能力到技术栈，再到多智能体分工，一页看清全貌。</p>
          </div>
          <div className="lp-bento">
            {BENTO_FEATURES.map((feature, index) => (
              <article
                key={feature.id}
                className={`lp-bento-card lp-bento-card--${feature.size}`}
                style={
                  {
                    "--card-color": feature.color,
                    "--card-glow": feature.glow,
                    animationDelay: `${index * 0.05}s`,
                  } as React.CSSProperties
                }
              >
                <span className="lp-bento-icon" style={{ color: feature.color, background: feature.glow }}>
                  {feature.icon}
                </span>
                <h3 className="lp-bento-title">{feature.title}</h3>
                <p className="lp-bento-desc">{feature.desc}</p>
                {"tags" in feature && feature.tags ? (
                  <div className="lp-bento-tags">
                    {feature.tags.map((tag) => (
                      <span key={tag} className="lp-bento-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {feature.id === "resources" ? (
                  <div className="lp-bento-mini-icons" aria-hidden>
                    <FileTextOutlined />
                    <BookOutlined />
                    <CodeOutlined />
                    <VideoCameraOutlined />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          <div className="lp-block-gap" />
          <div className="lp-subsection-header lp-subsection-header--center">
            <div className="lp-section-tag">工程实现</div>
            <h3 className="lp-subsection-title">可解释、可扩展的多智能体学习系统</h3>
          </div>
          <div className="lp-tech-mosaic">
            {TECH_STACK.map((item, index) => (
              <article
                key={item.name}
                className="lp-tech-tile"
                style={{ "--tech-color": item.color, animationDelay: `${index * 0.05}s` } as React.CSSProperties}
              >
                <span className="lp-tech-icon" style={{ color: item.color }}>{item.icon}</span>
                <strong>{item.name}</strong>
                <span>{item.desc}</span>
              </article>
            ))}
          </div>
          <div className="lp-block-gap" />
          <div className="lp-subsection-header lp-subsection-header--center">
            <div className="lp-section-tag">Agent 协作</div>
            <h3 className="lp-subsection-title">分工明确，避免一个模型包办所有任务</h3>
          </div>
          <AgentChipRow />
      </section>

      <section id="lp-cta" className="lp-section lp-section--cta lp-container">
        <div className="lp-cta-card">
          <div className="lp-cta-glow" aria-hidden />
          <h2 className="lp-cta-title">把下一次复习整理成一条清楚路径</h2>
          <p className="lp-cta-sub">登录进入工作台，或查看项目文档了解模块与生成逻辑。</p>
          <div className="lp-cta-actions">
            <button type="button" className="lp-btn-primary lp-btn-lg" onClick={goLogin}>
              进入学习工作台
            </button>
            <button type="button" className="lp-btn-ghost" onClick={goDocs}>
              查看项目文档
            </button>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container">© 2026 {BRAND_TITLE} · 个性化 AI 学习平台</div>
      </footer>
    </div>
  );
}
