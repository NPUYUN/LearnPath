"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Col,
  Empty,
  Progress,
  Row,
  Space,
  Tag,
  Timeline,
  Typography,
} from "antd";
import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import CrownOutlined from "@ant-design/icons/CrownOutlined";
import FireOutlined from "@ant-design/icons/FireOutlined";
import LineChartOutlined from "@ant-design/icons/LineChartOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import RocketOutlined from "@ant-design/icons/RocketOutlined";
import StarOutlined from "@ant-design/icons/StarOutlined";
import TrophyOutlined from "@ant-design/icons/TrophyOutlined";
import type { EChartsOption } from "echarts";
import InsightsArenaBackground from "@/components/InsightsArenaBackground";
import { clientNavigate } from "@/lib/clientNav";
import { computeInsights } from "@/lib/insightsCompute";
import { getChartPalette, isDarkTheme } from "@/lib/chartTheme";
import { getChatHistory, getEvalStats, type EvalStats } from "@/lib/api";
import { useEcharts } from "@/lib/useEcharts";
import { displayCourseName, useAppStore } from "@/store/appStore";

const { Text, Title, Paragraph } = Typography;

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  doc: "文档",
  mindmap: "思维导图",
  quiz: "测验",
  reading: "阅读材料",
  media: "多媒体",
  code: "代码示例",
};

const PIE_COLORS = ["#1677ff", "#722ed1", "#13c2c2", "#fa8c16", "#52c41a", "#eb2f96"];

function InsightsStandaloneShell({
  children,
  onRefresh,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
}) {
  return (
    <div className="lp-insights-arena">
      <InsightsArenaBackground />
      <header className="lp-insights-arena-topbar">
        <button
          type="button"
          className="lp-insights-arena-back"
          onClick={() => clientNavigate("/account")}
        >
          <ArrowLeftOutlined />
          <span>返回个人主页</span>
        </button>
        <div className="lp-insights-arena-topbar-brand">
          <span className="lp-insights-arena-topbar-icon">
            <TrophyOutlined />
          </span>
          <div>
            <span className="lp-insights-arena-topbar-title">学习成就馆</span>
            <span className="lp-insights-arena-topbar-sub">Achievement Arena</span>
          </div>
        </div>
        {onRefresh ? (
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            className="lp-insights-arena-refresh"
          >
            刷新
          </Button>
        ) : (
          <span className="lp-insights-arena-refresh" aria-hidden />
        )}
      </header>
      <main className="lp-insights-arena-main">{children}</main>
    </div>
  );
}

export default function DataInsightsContent() {
  const userId = useAppStore((s) => s.userId);
  const userName = useAppStore((s) => s.userName);
  const courseName = useAppStore((s) => s.courseName);
  const profile = useAppStore((s) => s.profile);
  const learningPath = useAppStore((s) => s.learningPath);
  const storeStats = useAppStore((s) => s.evalStats);
  const insightsChat = useAppStore((s) => s.insightsChat);
  const setEvalStats = useAppStore((s) => s.setEvalStats);
  const setInsightsChat = useAppStore((s) => s.setInsightsChat);

  const [stats, setStats] = useState<EvalStats | null>(storeStats);
  const [chatCount, setChatCount] = useState(insightsChat?.chatCount ?? 0);
  const [userMsgCount, setUserMsgCount] = useState(insightsChat?.userMsgCount ?? 0);
  const [loading, setLoading] = useState(!storeStats || !insightsChat);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(isDarkTheme());
    const obs = new MutationObserver(() => setIsDark(isDarkTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [evalData, history] = await Promise.all([
        getEvalStats(userId),
        getChatHistory(userId).catch(() => []),
      ]);
      setStats(evalData);
      setEvalStats(evalData);
      const nextChatCount = history.length;
      const nextUserMsgCount = history.filter((m) => m.role === "user").length;
      setChatCount(nextChatCount);
      setUserMsgCount(nextUserMsgCount);
      setInsightsChat({ chatCount: nextChatCount, userMsgCount: nextUserMsgCount });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [userId, setEvalStats, setInsightsChat]);

  useEffect(() => {
    if (storeStats) setStats(storeStats);
    if (insightsChat) {
      setChatCount(insightsChat.chatCount);
      setUserMsgCount(insightsChat.userMsgCount);
    }
    if (storeStats && insightsChat) {
      setLoading(false);
      return;
    }
    void load();
  }, [storeStats, insightsChat, load]);

  const insight = useMemo(
    () =>
      computeInsights({
        stats,
        learningPath,
        profile,
        chatCount,
        userMsgCount,
      }),
    [stats, learningPath, profile, chatCount, userMsgCount]
  );

  const palette = useMemo(() => getChartPalette(isDark), [isDark]);

  const radarOption: EChartsOption = stats
    ? {
        legend: {
          data: ["起点", "当前"],
          bottom: 0,
          textStyle: { color: palette.legendText },
        },
        radar: {
          indicator: stats.radar.dimensions.map((d) => ({ name: d, max: 100 })),
          radius: "62%",
          axisName: { fontSize: 11, color: palette.text },
          splitArea: { areaStyle: { color: palette.splitArea } },
          axisLine: { lineStyle: { color: palette.axisLine } },
          splitLine: { lineStyle: { color: palette.axisLine } },
        },
        series: [
          {
            type: "radar",
            data: [
              {
                value: stats.radar.before,
                name: "起点",
                areaStyle: { color: isDark ? "rgba(100,116,139,0.18)" : "rgba(100,100,100,0.08)" },
                lineStyle: { color: palette.beforeLine, type: "dashed" },
                itemStyle: { color: palette.beforeLine },
              },
              {
                value: stats.radar.after,
                name: "当前",
                areaStyle: { color: isDark ? "rgba(64,150,255,0.25)" : "rgba(22,119,255,0.18)" },
                lineStyle: { color: palette.primary, width: 2 },
                itemStyle: { color: palette.primary },
              },
            ],
          },
        ],
      }
    : {};

  const pieOption: EChartsOption = stats
    ? {
        tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
        series: [
          {
            type: "pie",
            radius: ["48%", "72%"],
            center: ["50%", "46%"],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 6, borderColor: isDark ? "#1a2332" : "#fff", borderWidth: 2 },
            label: { color: palette.text, fontSize: 11 },
            data: Object.entries(stats.resources_by_type).map(([k, v], i) => ({
              name: RESOURCE_TYPE_LABELS[k] ?? k,
              value: v,
              itemStyle: { color: PIE_COLORS[i % PIE_COLORS.length] },
            })),
          },
        ],
      }
    : {};

  const gaugeOption: EChartsOption = {
    series: [
      {
        type: "gauge",
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        radius: "90%",
        center: ["50%", "58%"],
        axisLine: {
          lineStyle: {
            width: 14,
            color: [
              [0.3, "#ff7875"],
              [0.6, "#ffc069"],
              [0.85, "#69b1ff"],
              [1, "#95de64"],
            ],
          },
        },
        pointer: { show: true, length: "58%", width: 5 },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: true,
          fontSize: 28,
          fontWeight: 800,
          color: palette.text,
          offsetCenter: [0, "18%"],
          formatter: "{value}",
        },
        data: [{ value: Math.min(100, Math.round(insight.xp / 8)) }],
      },
    ],
  };

  const radarRef = useEcharts(radarOption, [stats, isDark]);
  const pieRef = useEcharts(pieOption, [stats, isDark]);
  const gaugeRef = useEcharts(gaugeOption, [insight.xp, isDark]);

  const initial = userName?.charAt(0) || "学";
  const pathSteps = learningPath?.steps ?? [];

  if (loading) {
    return (
      <InsightsStandaloneShell>
        <div className="lp-insights-arena-loading">
          <div className="lp-insights-arena-loading-ring" />
          <Text className="lp-insights-arena-loading-text">同步最新成就数据…</Text>
        </div>
      </InsightsStandaloneShell>
    );
  }

  if (error) {
    return (
      <InsightsStandaloneShell onRefresh={() => void load()}>
        <div className="lp-page-body">
          <Empty description={error}>
            <Button onClick={() => void load()}>重试</Button>
          </Empty>
        </div>
      </InsightsStandaloneShell>
    );
  }

  return (
    <InsightsStandaloneShell onRefresh={() => void load()}>
      <div className="lp-insights-arena-body">
        <p className="lp-insights-arena-tagline">你的学习数据 · 可视化成长轨迹</p>
        <section className="lp-insights-hero lp-insights-arena-hero">
          <div className="lp-insights-hero-glow" aria-hidden />
          <div className="lp-insights-hero-main">
            <div className="lp-insights-avatar">{initial}</div>
            <div className="lp-insights-hero-text">
              <Tag className="lp-insights-level-tag" icon={<CrownOutlined />}>
                Lv.{insight.level} {insight.levelTitle}
              </Tag>
              <Title level={3} className="lp-insights-hero-name">
                {userName}
              </Title>
              <Text type="secondary">{displayCourseName(courseName, userId)}</Text>
              <div className="lp-insights-xp-bar">
                <Progress
                  percent={insight.levelProgress}
                  showInfo={false}
                  strokeColor={{ from: "#1677ff", to: "#36cfc9" }}
                  trailColor="var(--lp-border)"
                  size="small"
                />
                <Text className="lp-insights-xp-label">
                  学力值 {insight.xp} · 距下一级还需 {Math.max(0, insight.nextLevelXp - insight.xp)} XP
                </Text>
              </div>
            </div>
          </div>
          <div className="lp-insights-hero-stats">
            <div className="lp-insights-hero-stat">
              <span className="lp-insights-hero-stat-value">{insight.percentile}%</span>
              <span className="lp-insights-hero-stat-label">超越同期学习者</span>
            </div>
            <div className="lp-insights-hero-divider" aria-hidden />
            <div className="lp-insights-hero-stat">
              <span className="lp-insights-hero-stat-value">{insight.unlockedCount}</span>
              <span className="lp-insights-hero-stat-label">已解锁成就</span>
            </div>
            <div className="lp-insights-hero-divider" aria-hidden />
            <div className="lp-insights-hero-stat">
              <span className="lp-insights-hero-stat-value">
                {insight.avgGrowth > 0 ? `+${insight.avgGrowth}` : insight.avgGrowth}
              </span>
              <span className="lp-insights-hero-stat-label">综合能力成长</span>
            </div>
          </div>
        </section>

        <Row gutter={[16, 16]} className="lp-insights-metrics">
          {[
            { label: "累计学习", value: stats?.study_days ?? 0, suffix: "天", icon: <FireOutlined /> },
            { label: "生成资源", value: stats?.total_resources ?? 0, suffix: "个", icon: <StarOutlined /> },
            { label: "对话消息", value: insight.userMsgCount, suffix: "条", icon: <RocketOutlined /> },
            { label: "路径进度", value: insight.pathPct, suffix: "%", icon: <LineChartOutlined /> },
          ].map((m) => (
            <Col xs={12} md={6} key={m.label}>
              <div className="lp-insights-metric-card">
                <span className="lp-insights-metric-icon">{m.icon}</span>
                <div>
                  <div className="lp-insights-metric-value">
                    {m.value}
                    <small>{m.suffix}</small>
                  </div>
                  <Text type="secondary" className="lp-insights-metric-label">
                    {m.label}
                  </Text>
                </div>
              </div>
            </Col>
          ))}
        </Row>

        <section className="lp-insights-section">
          <div className="lp-insights-section-head">
            <Title level={5} style={{ margin: 0 }}>
              <TrophyOutlined /> 成就徽章
            </Title>
            <Text type="secondary">
              {insight.unlockedCount} / {insight.achievements.length} 已解锁
            </Text>
          </div>
          <div className="lp-insights-badges">
            {insight.achievements.map((a) => (
              <div
                key={a.id}
                className={[
                  "lp-insights-badge",
                  a.unlocked ? "lp-insights-badge--unlocked" : "",
                  `lp-insights-badge--${a.tier}`,
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={a.desc}
              >
                <span className="lp-insights-badge-emoji">{a.emoji}</span>
                <span className="lp-insights-badge-title">{a.title}</span>
                <span className="lp-insights-badge-desc">{a.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <Row gutter={[16, 16]} className="lp-insights-charts">
          <Col xs={24} lg={8}>
            <div className="lp-insights-chart-card">
              <Title level={5}>学力指数</Title>
              <Text type="secondary" className="lp-insights-chart-sub">
                综合画像、资源、路径与活跃度
              </Text>
              <div ref={gaugeRef} className="lp-insights-chart-body lp-insights-chart-body--gauge" />
            </div>
          </Col>
          <Col xs={24} lg={8}>
            <div className="lp-insights-chart-card">
              <Title level={5}>能力成长雷达</Title>
              <Text type="secondary" className="lp-insights-chart-sub">
                起点 vs 当前 · 多维对比
              </Text>
              <div ref={radarRef} className="lp-insights-chart-body" />
            </div>
          </Col>
          <Col xs={24} lg={8}>
            <div className="lp-insights-chart-card">
              <Title level={5}>资源类型分布</Title>
              <Text type="secondary" className="lp-insights-chart-sub">
                已生成资源的模态构成
              </Text>
              <div ref={pieRef} className="lp-insights-chart-body">
                {!stats?.total_resources && (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无资源数据" />
                )}
              </div>
            </div>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <div className="lp-insights-chart-card">
              <Title level={5}>学习路径进度</Title>
              {pathSteps.length ? (
                <div className="lp-insights-path-steps">
                  {pathSteps.map((step, i) => {
                    const status =
                      step.status === "done"
                        ? "done"
                        : step.status === "in_progress"
                          ? "active"
                          : "pending";
                    return (
                      <div
                        key={step.order ?? i}
                        className={`lp-insights-path-step lp-insights-path-step--${status}`}
                      >
                        <span className="lp-insights-path-step-dot">{i + 1}</span>
                        <div className="lp-insights-path-step-body">
                          <Text strong>{step.title}</Text>
                          <Text type="secondary" className="lp-insights-path-step-meta">
                            {step.estimated_minutes} 分钟 ·{" "}
                            {step.status === "done"
                              ? "已完成"
                              : step.status === "in_progress"
                                ? "进行中"
                                : "待开始"}
                          </Text>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty description="尚未生成学习路径">
                  <Button type="primary" size="small" onClick={() => clientNavigate("/chat")}>
                    去对话生成
                  </Button>
                </Empty>
              )}
            </div>
          </Col>
          <Col xs={24} lg={12}>
            <div className="lp-insights-chart-card">
              <Title level={5}>学习动态</Title>
              {stats?.recent_events?.length ? (
                <Timeline
                  className="lp-insights-timeline"
                  items={stats.recent_events.slice(0, 8).map((ev) => ({
                    color: ev.color || "blue",
                    children: (
                      <>
                        <Text strong>{ev.label}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {ev.content}
                        </Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {ev.date}
                        </Text>
                      </>
                    ),
                  }))}
                />
              ) : (
                <Empty description="暂无学习动态" />
              )}
            </div>
          </Col>
        </Row>

        <div className="lp-insights-cta">
          <Paragraph className="lp-insights-cta-text">
            继续与 AI 助手对话、完成路径节点，解锁更多成就与更高学力等级。
          </Paragraph>
          <Space wrap>
            <Button type="primary" icon={<RocketOutlined />} onClick={() => clientNavigate("/chat")}>
              继续学习
            </Button>
            <Button onClick={() => clientNavigate("/evaluation")}>查看详细评估</Button>
          </Space>
        </div>
      </div>
    </InsightsStandaloneShell>
  );
}
