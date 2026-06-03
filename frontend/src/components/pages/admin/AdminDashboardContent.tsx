"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Col, Row, Spin, Statistic, Typography } from "antd";
import type { EChartsOption } from "echarts";
import RiseOutlined from "@ant-design/icons/RiseOutlined";
import TeamOutlined from "@ant-design/icons/TeamOutlined";
import MessageOutlined from "@ant-design/icons/MessageOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import { getAdminDashboard, type AdminDashboard } from "@/lib/api";
import { getChartPalette, isDarkTheme } from "@/lib/chartTheme";
import { useEcharts } from "@/lib/useEcharts";

const { Title, Text } = Typography;

const TYPE_LABELS: Record<string, string> = {
  doc: "文档",
  mindmap: "思维导图",
  quiz: "测验",
  reading: "阅读",
  media: "多媒体",
  code: "代码",
};

function buildActivityOption(data: AdminDashboard["daily_activity"], dark: boolean): EChartsOption {
  const pal = getChartPalette(dark);
  const dates = data.map((d) => d.date.slice(5));
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { data: ["学习事件", "对话消息", "新增资源"], textStyle: { color: pal.text } },
    grid: { left: 48, right: 24, top: 48, bottom: 32 },
    xAxis: {
      type: "category",
      data: dates,
      axisLine: { lineStyle: { color: pal.axis } },
      axisLabel: { color: pal.textMuted },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: pal.split, type: "dashed" } },
      axisLabel: { color: pal.textMuted },
    },
    series: [
      {
        name: "学习事件",
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 3, color: pal.primary },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${pal.primary}55` },
              { offset: 1, color: `${pal.primary}05` },
            ],
          },
        },
        data: data.map((d) => d.events),
      },
      {
        name: "对话消息",
        type: "bar",
        barMaxWidth: 14,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: pal.secondary },
        data: data.map((d) => d.messages),
      },
      {
        name: "新增资源",
        type: "line",
        smooth: true,
        lineStyle: { width: 2, type: "dashed", color: pal.accent },
        data: data.map((d) => d.resources),
      },
    ],
  };
}

function buildRoseOption(map: Record<string, number>, dark: boolean): EChartsOption {
  const pal = getChartPalette(dark);
  const data = Object.entries(map).map(([k, v]) => ({
    name: TYPE_LABELS[k] || k,
    value: v,
  }));
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        roseType: "area",
        radius: ["18%", "68%"],
        center: ["50%", "52%"],
        itemStyle: { borderRadius: 6 },
        label: { color: pal.text, formatter: "{b}\n{d}%" },
        data,
      },
    ],
  };
}

function buildRadarOption(overview: AdminDashboard["overview"], dark: boolean): EChartsOption {
  const pal = getChartPalette(dark);
  const max = Math.max(
    overview.resources_total,
    overview.messages_total,
    overview.events_total,
    overview.conversations_total,
    overview.quiz_attempts_total,
    10
  );
  return {
    backgroundColor: "transparent",
    radar: {
      indicator: [
        { name: "资源", max },
        { name: "对话", max },
        { name: "事件", max },
        { name: "会话", max },
        { name: "测验", max },
        { name: "资料库", max: Math.max(overview.libraries_total, 5) },
      ],
      splitLine: { lineStyle: { color: pal.split } },
      axisName: { color: pal.textMuted },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            value: [
              overview.resources_total,
              overview.messages_total,
              overview.events_total,
              overview.conversations_total,
              overview.quiz_attempts_total,
              overview.libraries_total,
            ],
            name: "平台规模",
            areaStyle: { color: `${pal.primary}33` },
            lineStyle: { color: pal.primary, width: 2 },
            itemStyle: { color: pal.primary },
          },
        ],
      },
    ],
  };
}

function buildRankOption(rows: AdminDashboard["user_rankings"], dark: boolean): EChartsOption {
  const pal = getChartPalette(dark);
  const labels = rows.map((r) => r.label).reverse();
  const values = rows.map((r) => r.events).reverse();
  return {
    backgroundColor: "transparent",
    grid: { left: 100, right: 24, top: 16, bottom: 24 },
    xAxis: {
      type: "value",
      splitLine: { lineStyle: { color: pal.split, type: "dashed" } },
      axisLabel: { color: pal.textMuted },
    },
    yAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: pal.text, width: 90, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        data: values,
        barMaxWidth: 18,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: pal.primary },
              { offset: 1, color: pal.secondary },
            ],
          },
        },
      },
    ],
  };
}

export default function AdminDashboardContent() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getAdminDashboard());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    setDark(isDarkTheme());
    const obs = new MutationObserver(() => setDark(isDarkTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [load]);

  const overview = data?.overview;
  const activityOpt = useMemo(
    () => (data ? buildActivityOption(data.daily_activity, dark) : null),
    [data, dark]
  );
  const roseOpt = useMemo(
    () => (overview ? buildRoseOption(overview.resource_by_type, dark) : null),
    [overview, dark]
  );
  const radarOpt = useMemo(
    () => (overview ? buildRadarOption(overview, dark) : null),
    [overview, dark]
  );
  const rankOpt = useMemo(
    () => (data ? buildRankOption(data.user_rankings, dark) : null),
    [data, dark]
  );

  const activityRef = useEcharts(activityOpt, [activityOpt]);
  const roseRef = useEcharts(roseOpt, [roseOpt]);
  const radarRef = useEcharts(radarOpt, [radarOpt]);
  const rankRef = useEcharts(rankOpt, [rankOpt]);

  if (loading && !data) {
    return (
      <div className="lp-admin-loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="lp-admin-page">
      <header className="lp-admin-page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            平台数据总览
          </Title>
          <Text type="secondary">全站用户、资源与学习行为汇总 · 测试环境</Text>
        </div>
      </header>

      <Row gutter={[16, 16]} className="lp-admin-kpi-row">
        <Col xs={12} lg={6}>
          <Card className="lp-admin-kpi-card">
            <Statistic title="注册用户" value={overview?.users_registered ?? 0} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="lp-admin-kpi-card">
            <Statistic title="学习资源" value={overview?.resources_total ?? 0} prefix={<BookOutlined />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="lp-admin-kpi-card">
            <Statistic title="对话消息" value={overview?.messages_total ?? 0} prefix={<MessageOutlined />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="lp-admin-kpi-card">
            <Statistic
              title="7日活跃"
              value={overview?.active_users_7d ?? 0}
              prefix={<RiseOutlined />}
              suffix={`/ ${overview?.chat_active_users_7d ?? 0} 对话`}
            />
          </Card>
        </Col>
      </Row>

      <Card className="lp-admin-chart-card lp-admin-chart-card--hero" title="14 日平台活跃趋势（折线 + 柱状混合）">
        <div ref={activityRef} className="lp-admin-chart lp-admin-chart--hero" />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card className="lp-admin-chart-card" title="资源类型分布（玫瑰图）">
            <div ref={roseRef} className="lp-admin-chart" />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="lp-admin-chart-card" title="平台规模雷达">
            <div ref={radarRef} className="lp-admin-chart" />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="lp-admin-chart-card" title="用户活跃排行">
            <div ref={rankRef} className="lp-admin-chart" />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
