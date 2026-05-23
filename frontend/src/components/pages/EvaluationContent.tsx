"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clientNavigate } from "@/lib/clientNav";
import {
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Progress,
  Row,
  Skeleton,
  Space,
  Tag,
  Timeline,
  Typography,
} from "antd";
import {
  BookOutlined,
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
import { getEvalStats, type EvalStats } from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import BarChartOutlined from "@ant-design/icons/BarChartOutlined";

const { Text, Paragraph } = Typography;

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

  const statCards = stats
    ? [
        { title: "累计学习天数", value: stats.study_days, suffix: "天", ...STAT_VARIANTS[0] },
        { title: "已生成资源", value: stats.total_resources, suffix: "个", ...STAT_VARIANTS[1] },
        { title: "画像完整度", value: stats.profile_completeness, suffix: "%", ...STAT_VARIANTS[2] },
        {
          title: "学习路径",
          value: stats.has_path ? "已规划" : "待生成",
          suffix: "",
          ...STAT_VARIANTS[3],
        },
      ]
    : [];

  const suggestion = stats
    ? stats.total_resources === 0
      ? "你尚未生成任何学习资源。建议先前往「AI 助手」对话，让系统为你构建学习画像并生成资源。"
      : stats.profile_completeness < 50
        ? `当前画像完整度为 ${stats.profile_completeness}%，建议继续与 AI 助手对话，补全学习偏好信息。`
        : `整体表现良好，已生成 ${stats.total_resources} 个学习资源，画像完整度 ${stats.profile_completeness}%。`
    : "";

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 1060, margin: "0 auto" }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 24, maxWidth: 1060, margin: "0 auto" }}>
        <Empty description={`加载失败：${error}`}>
          <Button onClick={fetchStats}>重试</Button>
        </Empty>
      </div>
    );
  }

  const hasData = stats && (stats.total_resources > 0 || stats.profile_completeness > 0);

  return (
    <div>
      <PageHeader
        title="学习效果评估"
        subtitle="数据实时来自你的学习记录"
        icon={<BarChartOutlined />}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchStats}>
              刷新
            </Button>
            <Button icon={<RiseOutlined />} type="primary" onClick={() => clientNavigate("/chat")}>
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
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
              {statCards.map((s, idx) => {
                const Icon = STAT_VARIANTS[idx].icon;
                return (
                  <Col xs={12} sm={6} key={s.title}>
                    <Card
                      className={`lp-stat-card lp-stat-card--${s.variant}`}
                      styles={{ body: { padding: "16px 20px" } }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 24, color: s.accent }}>
                          <Icon />
                        </div>
                        <div>
                          <div className="lp-stat-card__value">
                            {s.value}
                            {s.suffix}
                          </div>
                          <div className="lp-stat-card__label">{s.title}</div>
                        </div>
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card title="能力成长对比雷达图">
                  <div ref={radarRef} style={{ height: 280 }} />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
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
              <Col xs={24} lg={14}>
                <Card title="AI 学习建议" extra={<Tag color="blue">自动生成</Tag>}>
                  <Paragraph className="lp-prose">{suggestion}</Paragraph>
                  {stats && stats.total_resources > 0 && (
                    <>
                      <Paragraph className="lp-prose">
                        <Text strong>优势：</Text>
                        {stats.profile_completeness >= 60
                          ? "学习画像较完整，资源推荐精准度高。"
                          : "已开始学习，具备初步数据基础。"}
                      </Paragraph>
                      <Paragraph className="lp-prose">
                        <Text strong>待提升：</Text>
                        {stats.has_path
                          ? "继续按路径推进，完成更多资源学习。"
                          : "尚未生成学习路径，建议与 AI 助手对话自动规划。"}
                      </Paragraph>
                      <Divider style={{ margin: "12px 0" }} />
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {stats.radar.dimensions.map((dim, i) => (
                          <div key={dim} style={{ minWidth: 160 }}>
                            <div className="lp-muted-text" style={{ fontSize: 12, marginBottom: 4 }}>
                              {dim}{" "}
                              <Text strong style={{ color: palette.primary }}>
                                +{stats.radar.after[i] - stats.radar.before[i]}分
                              </Text>
                            </div>
                            <Progress
                              percent={stats.radar.after[i]}
                              strokeColor={palette.primary}
                              size="small"
                              showInfo={false}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={10}>
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
