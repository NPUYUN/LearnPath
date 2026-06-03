"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Col, Row, Table, Tag, Typography } from "antd";
import type { EChartsOption } from "echarts";
import { getAdminActivity } from "@/lib/api";
import { getChartPalette, isDarkTheme } from "@/lib/chartTheme";
import { useEcharts } from "@/lib/useEcharts";

const { Title, Text } = Typography;

export default function AdminActivityContent() {
  const [daily, setDaily] = useState<{ date: string; events: number; messages: number; resources: number }[]>([]);
  const [events, setEvents] = useState<
    { id: string; user_id: string; event_type: string; resource_id: string; created_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminActivity();
      setDaily(res.daily_activity);
      setEvents(res.recent_events);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    setDark(isDarkTheme());
  }, [load]);

  const stackOpt = useMemo((): EChartsOption | null => {
    if (!daily.length) return null;
    const pal = getChartPalette(dark);
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["事件", "消息", "资源"], textStyle: { color: pal.text } },
      grid: { left: 40, right: 16, top: 40, bottom: 28 },
      xAxis: {
        type: "category",
        data: daily.map((d) => d.date.slice(5)),
        axisLabel: { color: pal.textMuted },
      },
      yAxis: { type: "value", splitLine: { lineStyle: { color: pal.split } } },
      series: [
        { name: "事件", type: "bar", stack: "total", data: daily.map((d) => d.events) },
        { name: "消息", type: "bar", stack: "total", data: daily.map((d) => d.messages) },
        { name: "资源", type: "bar", stack: "total", data: daily.map((d) => d.resources) },
      ],
    };
  }, [daily, dark]);

  const chartRef = useEcharts(stackOpt, [stackOpt]);

  return (
    <div className="lp-admin-page">
      <header className="lp-admin-page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            行为分析
          </Title>
          <Text type="secondary">30 日堆叠活跃与最近学习事件</Text>
        </div>
      </header>

      <Card className="lp-admin-chart-card" title="30 日行为堆叠">
        <div ref={chartRef} className="lp-admin-chart lp-admin-chart--wide" />
      </Card>

      <Card className="lp-admin-table-card" title="最近事件">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={events}
          pagination={{ pageSize: 12 }}
          size="small"
          columns={[
            {
              title: "类型",
              dataIndex: "event_type",
              width: 120,
              render: (t: string) => <Tag color="processing">{t}</Tag>,
            },
            { title: "用户", dataIndex: "user_id", width: 120 },
            { title: "资源", dataIndex: "resource_id", ellipsis: true },
            { title: "时间", dataIndex: "created_at", width: 180 },
          ]}
        />
      </Card>
    </div>
  );
}
