"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clientNavigate } from "@/lib/clientNav";
import {
  Button,
  Card,
  Col,
  Empty,
  Row,
  Skeleton,
  Space,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import {
  ArrowRightOutlined,
  BookOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FireOutlined,
  ReloadOutlined,
  RiseOutlined,
} from "@ant-design/icons";
import type { EChartsOption } from "echarts";
import { useEcharts } from "@/lib/useEcharts";
import { getChartPalette, isDarkTheme } from "@/lib/chartTheme";
import PageHeader from "@/components/PageHeader";
import { generateWeeklyReview, getEvalStats, refreshEvalStats, type EvalStats } from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import BarChartOutlined from "@ant-design/icons/BarChartOutlined";

const { Text, Paragraph } = Typography;

function _formatAdviceTime(iso: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso.slice(0, 10);
    return `${dt.getMonth() + 1}月${dt.getDate()}日 ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso.slice(0, 10);
  }
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  doc: "文档",
  mindmap: "思维导图",
  quiz: "测验",
  reading: "阅读材料",
  media: "多媒体",
  code: "代码示例",
};

const STAT_VARIANTS = [
  { variant: 1, accent: "var(--lp-stat-accent-1)", icon: ClockCircleOutlined },
  { variant: 2, accent: "var(--lp-stat-accent-2)", icon: BookOutlined },
  { variant: 3, accent: "var(--lp-stat-accent-3)", icon: CheckCircleOutlined },
  { variant: 4, accent: "var(--lp-stat-accent-4)", icon: FireOutlined },
] as const;

export default function EvaluationContent() {
  const userId = useAppStore((s) => s.userId);
  const storeStats = useAppStore((s) => s.evalStats);
  const setEvalStats = useAppStore((s) => s.setEvalStats);
  const [stats, setStats] = useState<EvalStats | null>(storeStats);
  const [loading, setLoading] = useState(!storeStats);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewGenerating, setReviewGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(isDarkTheme());
    const obs = new MutationObserver(() => setIsDark(isDarkTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEvalStats(userId);
      setStats(data);
      setEvalStats(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [userId, setEvalStats]);

  const handleRefreshEval = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await refreshEvalStats(userId);
      setStats(data);
      setEvalStats(data);
      setError(null);
      message.success(
        data.advice_updated_at ? "评估已更新" : "评估数据已刷新"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "更新评估失败";
      message.error(msg);
    } finally {
      setRefreshing(false);
    }
  }, [userId, setEvalStats]);

  const handleGenerateWeeklyReview = useCallback(async () => {
    setReviewGenerating(true);
    try {
      const result = await generateWeeklyReview(userId);
      message.success(result.message || "已生成本周学习复盘");
      if (typeof window !== "undefined") {
        window.location.assign(`/resources/view/${encodeURIComponent(result.resource.id)}`);
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "生成本周复盘失败");
    } finally {
      setReviewGenerating(false);
    }
  }, [userId]);

  useEffect(() => {
    if (storeStats) {
      setStats(storeStats);
      setLoading(false);
      return;
    }
    void fetchStats();
  }, [storeStats, fetchStats]);

  const palette = useMemo(() => getChartPalette(isDark), [isDark]);

  const radarOption: EChartsOption = stats
    ? {
        legend: {
          data: ["学习前", "学习后"],
          bottom: 0,
          textStyle: { color: palette.legendText },
        },
        radar: {
          indicator: stats.radar.dimensions.map((d) => ({ name: d, max: 100 })),
          radius: "60%",
          axisName: { fontSize: 12, color: palette.text },
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
                name: "学习前",
                areaStyle: { color: isDark ? "rgba(100,116,139,0.2)" : "rgba(100,100,100,0.1)" },
                lineStyle: { color: palette.beforeLine, type: "dashed" },
                itemStyle: { color: palette.beforeLine },
              },
              {
                value: stats.radar.after,
                name: "学习后",
                areaStyle: { color: isDark ? "rgba(64,150,255,0.2)" : "rgba(22,119,255,0.15)" },
                lineStyle: { color: palette.primary },
                itemStyle: { color: palette.primary },
              },
            ],
          },
        ],
      }
    : {};

  const barOption: EChartsOption = stats
    ? {
        grid: { top: 20, bottom: 40, left: 60, right: 20 },
        xAxis: {
          type: "value",
          name: "个",
          nameTextStyle: { fontSize: 11, color: palette.text },
          axisLabel: { color: palette.text },
        },
        yAxis: {
          type: "category",
          data: Object.keys(stats.resources_by_type).map((k) => RESOURCE_TYPE_LABELS[k] ?? k),
          axisLabel: { color: palette.text },
        },
        series: [
          {
            type: "bar",
            data: Object.values(stats.resources_by_type),
            itemStyle: { color: palette.primary, borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: "right", fontSize: 12, color: palette.text },
          },
        ],
        tooltip: { trigger: "axis" },
      }
    : {};

  const radarRef = useEcharts(radarOption, [stats, isDark]);
  const barRef = useEcharts(barOption, [stats, isDark]);
  const forgettingRiskOption: EChartsOption = stats
    ? {
        grid: { top: 20, bottom: 28, left: 36, right: 12 },
        xAxis: {
          type: "category",
          data: (stats.forgetting_risk || []).map((item) => item.label),
          axisLabel: { color: palette.text, fontSize: 11 },
        },
        yAxis: {
          type: "value",
          max: 100,
          axisLabel: { color: palette.text, formatter: "{value}%" },
        },
        series: [
          {
            type: "line",
            smooth: true,
            data: (stats.forgetting_risk || []).map((item) => item.value),
            areaStyle: { color: isDark ? "rgba(250,173,20,0.18)" : "rgba(250,173,20,0.12)" },
            lineStyle: { color: "#faad14", width: 3 },
            itemStyle: { color: "#faad14" },
          },
        ],
        tooltip: { trigger: "axis" },
      }
    : {};
  const reviewPressureOption: EChartsOption = stats
    ? {
        grid: { top: 20, bottom: 28, left: 36, right: 12 },
        xAxis: {
          type: "category",
          data: (stats.review_pressure || []).map((item) => item.label),
          axisLabel: { color: palette.text, fontSize: 11 },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: palette.text, formatter: "{value}m" },
        },
        series: [
          {
            type: "bar",
            data: (stats.review_pressure || []).map((item) => item.value),
            itemStyle: { color: "#722ed1", borderRadius: [6, 6, 0, 0] },
          },
        ],
        tooltip: { trigger: "axis" },
      }
    : {};
  const retentionCurveOption: EChartsOption = stats
    ? {
        grid: { top: 20, bottom: 28, left: 36, right: 12 },
        xAxis: {
          type: "category",
          data: (stats.retention_curve || []).map((item) => item.label),
          axisLabel: { color: palette.text, fontSize: 11 },
        },
        yAxis: {
          type: "value",
          min: 0,
          max: 100,
          axisLabel: { color: palette.text, formatter: "{value}%" },
        },
        series: [
          {
            type: "line",
            smooth: true,
            data: (stats.retention_curve || []).map((item) => item.value),
            lineStyle: { color: "#13c2c2", width: 3 },
            itemStyle: { color: "#13c2c2" },
          },
        ],
        tooltip: { trigger: "axis" },
      }
    : {};
  const forgettingRiskRef = useEcharts(forgettingRiskOption, [stats, isDark]);
  const reviewPressureRef = useEcharts(reviewPressureOption, [stats, isDark]);
  const retentionCurveRef = useEcharts(retentionCurveOption, [stats, isDark]);

  const statCards = stats
    ? [
        { title: "累计学习天数", value: stats.study_days, suffix: "天", ...STAT_VARIANTS[0] },
        { title: "已生成资源", value: stats.total_resources, suffix: "个", ...STAT_VARIANTS[1] },
        { title: "画像字段覆盖", value: stats.profile_completeness, suffix: "%", ...STAT_VARIANTS[2] },
        {
          title: "学习路径",
          value: stats.has_path ? "已规划" : "待生成",
          suffix: "",
          ...STAT_VARIANTS[3],
        },
      ]
    : [];

  const suggestion =
    stats?.ai_advice ||
    (stats
      ? stats.total_resources === 0
        ? "你尚未生成任何学习资源。建议先前往「AI 助手」对话，让系统为你构建学习画像并生成资源。"
        : stats.profile_completeness < 50
          ? `当前画像字段覆盖率为 ${stats.profile_completeness}%，建议继续与 AI 助手对话，补全学习偏好信息。`
          : `整体表现良好，已生成 ${stats.total_resources} 个学习资源，画像字段覆盖率 ${stats.profile_completeness}%。`
      : "");

  const strengthsText =
    stats?.strengths ||
    (stats && stats.profile_completeness >= 60
      ? "学习画像字段覆盖较完整，已具备个性化推荐的数据基础。"
      : "已开始学习，具备初步数据基础。");

  const improvementsText =
    stats?.improvements ||
    (stats?.has_path
      ? "继续按路径推进，完成更多资源学习。"
      : "尚未生成学习路径，建议与 AI 助手对话自动规划。");

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 1060, margin: "0 auto" }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }
  if (error && !stats) {
    return (
      <div style={{ padding: 24, maxWidth: 1060, margin: "0 auto" }}>
        <Empty description={`加载失败：${error}`}>
          <Button onClick={fetchStats}>重试</Button>
        </Empty>
      </div>
    );
  }

  const hasData = stats && (stats.total_resources > 0 || stats.profile_completeness > 0);
  const pressureBalance = stats?.pressure_balance;
  const hasReviewDue = (pressureBalance?.due_today ?? 0) > 0;
  const primaryActionLabel = hasReviewDue ? "查看今日复习" : "继续当前路径";
  const primaryActionRoute = hasReviewDue ? "/resources" : "/path";

  return (
    <div>
      <PageHeader
        title="学习效果评估"
        subtitle="数据实时来自你的学习记录"
        icon={<BarChartOutlined />}
        extra={
          <Space wrap className="lp-eval-header-actions">
            <Button className="lp-eval-header-refresh" aria-label="刷新评估数据" icon={<ReloadOutlined />} onClick={fetchStats}>
              <span className="lp-eval-refresh-label">刷新</span>
            </Button>
            <Button loading={reviewGenerating} onClick={() => void handleGenerateWeeklyReview()}>
              <span className="lp-eval-action-label--desktop">生成本周复盘</span>
              <span className="lp-eval-action-label--mobile">本周复盘</span>
            </Button>
            <Button icon={<RiseOutlined />} type="primary" loading={refreshing} onClick={() => void handleRefreshEval()}>
              更新评估
            </Button>
          </Space>
        }
      />
      <div className="lp-page-body">
        {!hasData ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无学习数据，按主流程开始体验"
            style={{ padding: "60px 0" }}
          >
            <Space>
              <Button type="primary" onClick={() => clientNavigate("/chat")}>
                前往 AI 助手
              </Button>
              <Button onClick={() => clientNavigate("/resources")}>资源库</Button>
              <Button onClick={() => clientNavigate("/path")}>学习路径</Button>
            </Space>
          </Empty>
        ) : (
          <>
            <section className="lp-eval-overview" aria-labelledby="lp-eval-overview-title">
              <div className="lp-eval-overview__main">
                <div className="lp-eval-overview__eyebrow">
                  <BulbOutlined />
                  本次学习结论
                </div>
                <h2 id="lp-eval-overview-title">先看结论，再决定下一步</h2>
                <Paragraph className="lp-eval-overview__summary">{suggestion}</Paragraph>
                <div className="lp-eval-focus-grid">
                  <div className="lp-eval-focus-item lp-eval-focus-item--strength">
                    <span>当前优势</span>
                    <p>{strengthsText}</p>
                  </div>
                  <div className="lp-eval-focus-item lp-eval-focus-item--improve">
                    <span>优先提升</span>
                    <p>{improvementsText}</p>
                  </div>
                </div>
              </div>

              <aside className="lp-eval-today" aria-label="今日学习建议">
                <div className="lp-eval-today__header">
                  <strong>今日学习建议</strong>
                  {stats?.advice_updated_at ? (
                    <Text type="secondary">更新于 {_formatAdviceTime(stats.advice_updated_at)}</Text>
                  ) : null}
                </div>
                <p className="lp-eval-today__summary">
                  {pressureBalance?.summary || "继续按当前路径推进，完成一个清晰的小目标。"}
                </p>
                <div className="lp-eval-today__metrics">
                  <div>
                    <span>今日待复习</span>
                    <strong>{pressureBalance?.due_today ?? 0} 项</strong>
                  </div>
                  <div>
                    <span>建议复习</span>
                    <strong>{pressureBalance?.recommended_review_minutes ?? 0} 分钟</strong>
                  </div>
                  <div>
                    <span>建议新学</span>
                    <strong>{pressureBalance?.recommended_new_minutes ?? 0} 分钟</strong>
                  </div>
                </div>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  onClick={() => clientNavigate(primaryActionRoute)}
                >
                  {primaryActionLabel}
                </Button>
              </aside>
            </section>

            <section className="lp-eval-metrics" aria-label="学习数据概览">
              {statCards.map((s, idx) => {
                const Icon = STAT_VARIANTS[idx].icon;
                return (
                  <div className="lp-eval-metric" key={s.title}>
                    <span className="lp-eval-metric__icon" style={{ color: s.accent }}>
                      <Icon />
                    </span>
                    <div>
                      <strong>
                        {s.value}
                        {s.suffix}
                      </strong>
                      <span>{s.title}</span>
                    </div>
                  </div>
                );
              })}
            </section>

            <div className="lp-eval-section-heading">
              <div>
                <h2>未来一周学习趋势</h2>
                <p>先判断复习压力，再安排新内容。</p>
              </div>
            </div>

            <Row gutter={[16, 16]}>
              <Col span={24} className="lp-eval-order-detail-heading">
                <div className="lp-eval-section-heading lp-eval-section-heading--compact">
                  <div>
                    <h2>能力与学习投入</h2>
                    <p>这些图表用于解释学习结论，不单独代表学习成果。</p>
                  </div>
                </div>
              </Col>
              <Col xs={24} lg={12} className="lp-eval-order-detail">
                <Card title="能力成长对比雷达图">
                  <div ref={radarRef} style={{ height: 280 }} />
                </Card>
              </Col>
              <Col xs={24} lg={12} className="lp-eval-order-detail">
                <Card title="资源类型分布">
                  {stats && Object.keys(stats.resources_by_type).length > 0 ? (
                    <div ref={barRef} style={{ height: 280 }} />
                  ) : (
                    <Empty
                      description="暂无资源数据"
                      style={{
                        height: 280,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                      }}
                    />
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={8} className="lp-eval-order-trend">
                <Card title="未来 7 天遗忘风险">
                  <div ref={forgettingRiskRef} style={{ height: 220 }} />
                </Card>
              </Col>
              <Col xs={24} lg={8} className="lp-eval-order-trend">
                <Card title="未来 7 天复习压力">
                  <div ref={reviewPressureRef} style={{ height: 220 }} />
                </Card>
              </Col>
              <Col xs={24} lg={8} className="lp-eval-order-trend">
                <Card title="记忆持久度趋势">
                  <div ref={retentionCurveRef} style={{ height: 220 }} />
                </Card>
              </Col>
              <Col span={24} className="lp-eval-order-events">
                <Card title="近期学习记录">
                  {stats && stats.recent_events.length > 0 ? (
                    <Timeline
                      items={stats.recent_events.map((e) => ({
                        color: e.color,
                        children: (
                          <div>
                            <Tag color={e.color} style={{ fontSize: 11 }}>
                              {e.label}
                            </Tag>
                            <div className="lp-prose" style={{ fontSize: 13, marginTop: 4 }}>
                              {e.content}
                            </div>
                            <div className="lp-muted-text" style={{ fontSize: 11, marginTop: 2 }}>
                              {e.date}
                            </div>
                          </div>
                        ),
                      }))}
                    />
                  ) : (
                    <Empty description="暂无记录" />
                  )}
                </Card>
              </Col>
            </Row>
          </>
        )}
      </div>
    </div>
  );
}
