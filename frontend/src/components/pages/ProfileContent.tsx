"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { clientNavigate } from "@/lib/clientNav";
import { Button, Tag, Progress, Spin, Empty, message } from "antd";
import {
  BookOutlined,
  ThunderboltOutlined,
  AimOutlined,
  ClockCircleOutlined,
  HeartOutlined,
  EditOutlined,
  SyncOutlined,
  MessageOutlined,
  FolderOpenOutlined,
  RiseOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import type { EChartsOption } from "echarts";
import {
  getProfile,
  getProfileSignals,
  getRealtimeState,
  refreshProfile,
  type ProfileRefreshResult,
  type RealtimeLearningState,
  type StudentProfile,
} from "@/lib/api";
import { useEcharts } from "@/lib/useEcharts";
import { getChartPalette, isDarkTheme } from "@/lib/chartTheme";
import { useAppStore } from "@/store/appStore";

function scoreFromText(text: string, base = 60): number {
  if (/进阶|熟练|良好|扎实|偏进阶/.test(text)) return Math.min(base + 25, 95);
  if (/入门|初学|一般/.test(text)) return Math.max(base - 5, 40);
  if (/未评估|未设定|待补充/.test(text)) return Math.max(base - 15, 30);
  return base;
}

const DIMENSION_META = [
  { key: "knowledge", label: "知识基础", icon: BookOutlined, color: "#3b82f6", grad: "linear-gradient(135deg,#3b82f6,#60a5fa)" },
  { key: "goal", label: "学习目标", icon: AimOutlined, color: "#f59e0b", grad: "linear-gradient(135deg,#f59e0b,#fbbf24)" },
  { key: "style", label: "认知风格", icon: HeartOutlined, color: "#8b5cf6", grad: "linear-gradient(135deg,#8b5cf6,#a78bfa)" },
  { key: "modality", label: "偏好模态", icon: ThunderboltOutlined, color: "#10b981", grad: "linear-gradient(135deg,#10b981,#34d399)" },
  { key: "time", label: "时间投入", icon: ClockCircleOutlined, color: "#06b6d4", grad: "linear-gradient(135deg,#06b6d4,#22d3ee)" },
  { key: "progress", label: "近期进度", icon: RiseOutlined, color: "#ec4899", grad: "linear-gradient(135deg,#ec4899,#f472b6)" },
] as const;

const EMOTION_LABEL: Record<RealtimeLearningState["emotion"], string> = {
  neutral: "平稳",
  confused: "困惑",
  frustrated: "受挫",
  excited: "兴奋",
  tired: "疲惫",
  anxious: "焦虑",
};

const ENGAGEMENT_LABEL: Record<RealtimeLearningState["engagement"], string> = {
  low: "偏低",
  medium: "中等",
  high: "较高",
};

const LOAD_LABEL: Record<RealtimeLearningState["cognitive_load"], string> = {
  low: "轻",
  medium: "适中",
  high: "偏高",
};

type ProfileView = "realtime" | "longterm";

function percentFromLevel(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function loadPercent(state: RealtimeLearningState): number {
  if (typeof state.cognitive_load_level === "number") {
    return percentFromLevel(state.cognitive_load_level);
  }
  return state.cognitive_load === "high" ? 78 : state.cognitive_load === "low" ? 28 : 52;
}

function levelDescriptor(
  value: number,
  bands: { high: string; mid: string; low: string },
): string {
  if (value >= 65) return bands.high;
  if (value >= 35) return bands.mid;
  return bands.low;
}

function confusionLevelHint(level: number): string {
  return levelDescriptor(percentFromLevel(level), {
    high: "需重点关注",
    mid: "有一定信号",
    low: "程度较轻",
  });
}

function curiosityLevelHint(level: number): string {
  return levelDescriptor(percentFromLevel(level), {
    high: "较高",
    mid: "中等",
    low: "偏低",
  });
}

function realtimeSummaryText(state: RealtimeLearningState): string {
  const stuck = state.stuck_topics[0];
  const curious = state.curiosity_topics[0];

  if ((state.frustration_level ?? 0) >= 0.65) {
    return stuck
      ? `语言里有明显受挫信号，适合先换一种讲法解释「${stuck}」。`
      : "语言里有明显受挫信号，可以说出具体哪里卡住了，方便换一种讲法。";
  }
  if (state.confusion_level >= 0.65) {
    return stuck
      ? `当前主要卡在「${stuck}」，适合先把一个关键点讲清楚。`
      : "有一定困惑信号，可以说出具体哪里没懂，方便针对性讲解。";
  }
  if (state.curiosity_level >= 0.65) {
    return curious
      ? `好奇心正集中在「${curious}」，可以顺着这个问题继续深入。`
      : "好奇度较高，不妨在对话里说出你想深挖的方向。";
  }
  if (loadPercent(state) >= 70) return "当前理解负荷偏高，适合放慢节奏、减少信息密度。";
  if (state.engagement === "high") return "当前投入度较高，可以安排更有挑战的小任务。";
  return "当前状态比较平稳，适合继续推进学习路径。";
}

function realtimeGauges(state: RealtimeLearningState) {
  return [
    {
      key: "confusion",
      label: "困惑",
      value: percentFromLevel(state.confusion_level),
      color: "#f59e0b",
      hint: confusionLevelHint(state.confusion_level),
    },
    {
      key: "curiosity",
      label: "好奇",
      value: percentFromLevel(state.curiosity_level),
      color: "#10b981",
      hint: curiosityLevelHint(state.curiosity_level),
    },
    {
      key: "load",
      label: "负荷",
      value: loadPercent(state),
      color: "#6366f1",
      hint: LOAD_LABEL[state.cognitive_load],
    },
  ];
}

function LiquidGauge({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: number;
  color: string;
  hint: string;
}) {
  return (
    <div
      className="lp-profile-liquid-card"
      style={
        {
          "--liquid-level": `${value}%`,
          "--liquid-color": color,
        } as CSSProperties
      }
    >
      <div className="lp-profile-liquid-orb" aria-label={`${label} ${value}%`}>
        <div className="lp-profile-liquid-fill" />
        <div className="lp-profile-liquid-gloss" />
        <strong>{value}%</strong>
      </div>
      <div className="lp-profile-liquid-copy">
        <span>{label}</span>
        <em>{hint}</em>
      </div>
    </div>
  );
}

function buildDimensions(p: StudentProfile) {
  const map: Record<string, { detail: string; tags: string[]; score: number }> = {
    knowledge: {
      detail: p.knowledge_level,
      tags: p.error_prone_topics?.slice(0, 3) || [],
      score: scoreFromText(p.knowledge_level, 55),
    },
    goal: {
      detail: p.learning_goal,
      tags: [p.learning_goal?.slice(0, 14) || "未设定"],
      score: scoreFromText(p.learning_goal, 75),
    },
    style: {
      detail: p.cognitive_style,
      tags: [p.cognitive_style],
      score: scoreFromText(p.cognitive_style, 68),
    },
    modality: {
      detail: p.preferred_modality,
      tags: p.preferred_modality?.split(/[+、,]/).filter(Boolean).slice(0, 4) || [],
      score: scoreFromText(p.preferred_modality, 72),
    },
    time: {
      detail: p.pace_and_time,
      tags: [p.pace_and_time?.slice(0, 12) || "—"],
      score: scoreFromText(p.pace_and_time, 58),
    },
    progress: {
      detail: p.recent_progress,
      tags: p.error_prone_topics?.length ? ["薄弱点待巩固"] : ["持续学习中"],
      score: scoreFromText(p.recent_progress, 52),
    },
  };
  return DIMENSION_META.map((m) => ({
    ...m,
    ...map[m.key],
  }));
}

export default function ProfileContent() {
  const userId = useAppStore((s) => s.userId);
  const storeProfile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const [profile, setLocal] = useState<StudentProfile | null>(storeProfile);
  const [realtimeState, setRealtimeState] = useState<RealtimeLearningState | null>(null);
  const [profileView, setProfileView] = useState<ProfileView>("realtime");
  const [loading, setLoading] = useState(!storeProfile);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMeta, setRefreshMeta] = useState<ProfileRefreshResult["sources"] | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getProfile(userId);
      if (p) {
        setLocal(p);
        setProfile(p);
        void getProfileSignals(userId).then(setRefreshMeta).catch(() => {});
        void getRealtimeState(userId).then(setRealtimeState).catch(() => setRealtimeState(null));
      } else {
        setLocal(null);
      }
    } catch {
      setLocal(null);
    } finally {
      setLoading(false);
    }
  }, [userId, setProfile]);

  useEffect(() => {
    if (storeProfile && storeProfile.user_id === userId) {
      setLocal(storeProfile);
      setLoading(false);
      void getProfileSignals(userId).then(setRefreshMeta).catch(() => {});
      void getRealtimeState(userId).then(setRealtimeState).catch(() => setRealtimeState(null));
      return;
    }
    void loadProfile();
  }, [userId, storeProfile, loadProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshProfile(userId);
      setLocal(result.profile);
      setProfile(result.profile);
      setRefreshMeta(result.sources);
      void getRealtimeState(userId).then(setRealtimeState).catch(() => setRealtimeState(null));
      message.success(result.message || "画像已根据学习行为更新");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "更新画像失败");
    } finally {
      setRefreshing(false);
    }
  };

  const dimensions = useMemo(() => (profile ? buildDimensions(profile) : []), [profile]);

  const chartOption: EChartsOption | null = useMemo(() => {
    if (!dimensions.length) return null;
    const palette = getChartPalette(isDarkTheme());
    return {
      radar: {
        indicator: dimensions.map((d) => ({ name: d.label, max: 100 })),
        radius: "52%",
        center: ["50%", "54%"],
        axisName: { color: palette.text, fontSize: 11, fontWeight: 500 },
        splitArea: { areaStyle: { color: palette.splitArea } },
        axisLine: { lineStyle: { color: palette.axisLine } },
        splitLine: { lineStyle: { color: palette.axisLine } },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: dimensions.map((d) => d.score),
              name: "综合能力",
              areaStyle: { color: "rgba(59,130,246,0.22)" },
              lineStyle: { color: "#3b82f6", width: 2 },
              itemStyle: { color: "#3b82f6" },
            },
          ],
        },
      ],
      tooltip: { trigger: "item" },
    };
  }, [dimensions]);

  const chartRef = useEcharts(chartOption, [profile?.user_id, dimensions.length, refreshing, profileView]);

  if (loading && !profile) {
    return (
      <div className="lp-profile-loading">
        <Spin size="large" />
        <p>加载学习画像…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="lp-profile-empty">
        <Empty description="尚未建立学习画像">
          <Button type="primary" size="large" onClick={() => void handleRefresh()}>
            从学习记录生成画像
          </Button>
          <Button style={{ marginLeft: 12 }} onClick={() => clientNavigate("/chat")}>
            去对话
          </Button>
        </Empty>
      </div>
    );
  }

  const avgScore = Math.round(
    dimensions.reduce((s, d) => s + d.score, 0) / Math.max(dimensions.length, 1)
  );

  return (
    <div className="lp-profile-page">
      <header className="lp-profile-hero">
        <div className="lp-profile-hero-bg" aria-hidden />
        <div className="lp-profile-hero-inner">
          <div className="lp-profile-hero-text">
            <span className="lp-profile-hero-badge">STEP 02 · 学习画像</span>
            <h1 className="lp-profile-hero-title">我的学习画像</h1>
            <p className="lp-profile-hero-sub">
              综合智能体对话、资源库浏览与测验表现，六维刻画你的学习特征
            </p>
            {refreshMeta && (
              <p className="lp-profile-hero-meta">
                本次依据 {refreshMeta.chat_turns ?? 0} 轮对话、{refreshMeta.resource_views ?? 0}{" "}
                次资源浏览更新
                {refreshMeta.topics?.length ? ` · 关注 ${refreshMeta.topics.join("、")}` : ""}
              </p>
            )}
          </div>
          <div className="lp-profile-hero-actions">
            <div className="lp-profile-hero-score">
              <span className="lp-profile-hero-score-num">{avgScore}</span>
              <span className="lp-profile-hero-score-label">综合指数</span>
            </div>
            <Button
              type="primary"
              size="large"
              icon={<SyncOutlined spin={refreshing} />}
              loading={refreshing}
              className="lp-profile-refresh-btn"
              onClick={() => void handleRefresh()}
            >
              更新画像
            </Button>
          </div>
        </div>
        <div className="lp-profile-stat-row">
          <div className="lp-profile-stat">
            <MessageOutlined />
            <span>{refreshMeta?.chat_turns ?? "—"}</span>
            <em>对话轮次</em>
          </div>
          <div className="lp-profile-stat">
            <FolderOpenOutlined />
            <span>{refreshMeta?.resource_views ?? "—"}</span>
            <em>资源浏览</em>
          </div>
          <div className="lp-profile-stat">
            <BookOutlined />
            <span>{refreshMeta?.resources_owned ?? "—"}</span>
            <em>拥有资源</em>
          </div>
        </div>
      </header>

      <div className="lp-profile-body">
        <section className="lp-profile-view-shell">
          <div className="lp-profile-view-top">
            <div>
              <span className="lp-profile-view-eyebrow">画像视图</span>
              <h2 className="lp-profile-view-title">
                {profileView === "realtime" ? "实时学习状态" : "长期学习画像"}
              </h2>
            </div>
            <div
              className="lp-profile-view-tabs"
              role="tablist"
              aria-label="切换画像视图"
              style={{ "--profile-view-index": profileView === "longterm" ? 1 : 0 } as CSSProperties}
            >
              <button
                type="button"
                role="tab"
                aria-selected={profileView === "realtime"}
                className={`lp-profile-view-tab${profileView === "realtime" ? " lp-profile-view-tab--active" : ""}`}
                onClick={() => setProfileView("realtime")}
              >
                实时画像
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={profileView === "longterm"}
                className={`lp-profile-view-tab${profileView === "longterm" ? " lp-profile-view-tab--active" : ""}`}
                onClick={() => setProfileView("longterm")}
              >
                长期画像
              </button>
            </div>
          </div>

          <div key={profileView} className={`lp-profile-view-stage lp-profile-view-stage--${profileView}`}>
            {profileView === "realtime" ? (
              <section className="lp-profile-realtime-panel" aria-label="实时画像">
                {realtimeState ? (
                  <>
                    <div className="lp-profile-realtime-hero">
                      <div className="lp-profile-realtime-copy">
                        <span className="lp-profile-realtime-kicker">本轮状态感知</span>
                        <h3>{realtimeSummaryText(realtimeState)}</h3>
                      </div>
                      <div className="lp-profile-realtime-tags">
                        <Tag color="blue">
                          {EMOTION_LABEL[realtimeState.emotion]} · {realtimeState.implicit_emotion || "平稳专注"}
                        </Tag>
                        <Tag color="purple">投入：{ENGAGEMENT_LABEL[realtimeState.engagement]}</Tag>
                      </div>
                    </div>

                    <div className="lp-profile-liquid-grid">
                      {realtimeGauges(realtimeState).map((g) => (
                        <LiquidGauge key={g.key} label={g.label} value={g.value} color={g.color} hint={g.hint} />
                      ))}
                    </div>

                    <div className="lp-profile-realtime-focus">
                      <div className="lp-profile-realtime-focus-block">
                        <span>当前卡点</span>
                        {realtimeState.stuck_topics.length ? (
                          <div className="lp-profile-realtime-chip-row">
                            {realtimeState.stuck_topics.map((t) => (
                              <Tag key={t}>{t}</Tag>
                            ))}
                          </div>
                        ) : (
                          <p>继续对话后，系统会自动识别你的困惑点</p>
                        )}
                      </div>
                      <div className="lp-profile-realtime-focus-block">
                        <span>当前好奇点</span>
                        {realtimeState.curiosity_topics.length ? (
                          <div className="lp-profile-realtime-chip-row">
                            {realtimeState.curiosity_topics.map((t) => (
                              <Tag key={t}>{t}</Tag>
                            ))}
                          </div>
                        ) : (
                          <p>说说你想深挖的方向，会显示在这里</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无实时画像，请先在智能对话中发送一条学习问题"
                  />
                )}
              </section>
            ) : (
              <section className="lp-profile-longterm-panel" aria-label="长期画像">
                <div className="lp-profile-longterm-grid">
                  <div className="lp-profile-chart-surface">
                    <div className="lp-profile-panel-head">
                      <h3>能力雷达</h3>
                      <span>{avgScore} 综合指数</span>
                    </div>
                    <div ref={chartRef} className="lp-profile-chart" />
                  </div>

                  <div className="lp-profile-summary-surface">
                    <h3>综合评价</h3>
                    <p className="lp-profile-summary-text">
                      当前基础为<strong>「{profile.knowledge_level}」</strong>，学习目标为
                      <strong>「{profile.learning_goal}」</strong>。学习偏好侧重
                      <strong> {profile.preferred_modality}</strong>，{profile.pace_and_time}。
                    </p>
                    {profile.error_prone_topics?.length > 0 && (
                      <p className="lp-profile-summary-warn">
                        建议巩固：{profile.error_prone_topics.join("、")}
                      </p>
                    )}
                    <p className="lp-profile-summary-progress">{profile.recent_progress}</p>
                    <div className="lp-profile-cta-row">
                      <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => clientNavigate("/path")}>
                        查看学习路径
                      </Button>
                      <Button icon={<EditOutlined />} onClick={() => clientNavigate("/chat")}>
                        继续对话优化
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="lp-profile-dim-compact-grid">
                  {dimensions.map((d) => {
                    const Icon = d.icon;
                    return (
                      <article key={d.key} className="lp-profile-dim-row" style={{ "--dim-color": d.color } as CSSProperties}>
                        <span className="lp-profile-dim-row-icon">
                          <Icon />
                        </span>
                        <div className="lp-profile-dim-row-main">
                          <div className="lp-profile-dim-row-head">
                            <strong>{d.label}</strong>
                            <em>{d.score} 分</em>
                          </div>
                          <Progress
                            percent={d.score}
                            showInfo={false}
                            strokeColor={d.color}
                            trailColor={isDarkTheme() ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)"}
                            size="small"
                          />
                          <p>{d.detail}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
