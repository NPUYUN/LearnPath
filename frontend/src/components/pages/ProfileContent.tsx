"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { clientNavigate } from "@/lib/clientNav";
import { Button, Tag, Progress, Spin, Empty, message } from "antd";
import {
  UserOutlined,
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
  refreshProfile,
  type ProfileRefreshResult,
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
        radius: "62%",
        center: ["50%", "52%"],
        axisName: { color: palette.text, fontSize: 12, fontWeight: 500 },
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

  const chartRef = useEcharts(chartOption, [profile?.user_id, dimensions.length, refreshing]);

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
        <div className="lp-profile-top-grid">
          <section className="lp-profile-panel lp-profile-panel--chart">
            <h2 className="lp-profile-panel-title">能力雷达</h2>
            <div ref={chartRef} className="lp-profile-chart" />
          </section>

          <section className="lp-profile-panel lp-profile-panel--summary">
            <h2 className="lp-profile-panel-title">综合评价</h2>
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
            <div className="lp-profile-score-tags">
              {dimensions.map((d) => (
                <Tag key={d.key} className="lp-profile-score-tag">
                  {d.label} {d.score}
                </Tag>
              ))}
            </div>
            <div className="lp-profile-cta-row">
              <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => clientNavigate("/path")}>
                查看学习路径
              </Button>
              <Button icon={<EditOutlined />} onClick={() => clientNavigate("/chat")}>
                继续对话优化
              </Button>
            </div>
          </section>
        </div>

        <h2 className="lp-profile-section-label">维度详情</h2>
        <div className="lp-profile-dim-grid">
          {dimensions.map((d) => {
            const Icon = d.icon;
            return (
              <article key={d.key} className="lp-profile-dim-card" style={{ "--dim-color": d.color } as CSSProperties}>
                <div className="lp-profile-dim-head">
                  <span className="lp-profile-dim-icon" style={{ background: d.grad }}>
                    <Icon />
                  </span>
                  <div>
                    <h3>{d.label}</h3>
                    <span className="lp-profile-dim-score">{d.score} 分</span>
                  </div>
                </div>
                <Progress
                  percent={d.score}
                  showInfo={false}
                  strokeColor={d.color}
                  trailColor="rgba(0,0,0,0.06)"
                  size="small"
                />
                <p className="lp-profile-dim-detail">{d.detail}</p>
                <div className="lp-profile-dim-tags">
                  {d.tags.filter(Boolean).map((t, i) => (
                    <Tag key={`${d.key}-${i}`} bordered={false}>
                      {t}
                    </Tag>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
