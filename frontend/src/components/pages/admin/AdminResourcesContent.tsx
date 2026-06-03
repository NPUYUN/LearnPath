"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Col, Row, Table, Tag, Typography } from "antd";
import type { EChartsOption } from "echarts";
import { getAdminResources } from "@/lib/api";
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

export default function AdminResourcesContent() {
  const [resources, setResources] = useState<
    { id: string; user_id: string; type: string; title: string; created_at: string }[]
  >([]);
  const [byType, setByType] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminResources();
      setResources(res.resources);
      setByType(res.overview.resource_by_type);
      setTotal(res.overview.resources_total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    setDark(isDarkTheme());
  }, [load]);

  const pieOpt = useMemo((): EChartsOption | null => {
    if (!Object.keys(byType).length) return null;
    const pal = getChartPalette(dark);
    return {
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie",
          radius: ["42%", "72%"],
          label: { color: pal.text },
          data: Object.entries(byType).map(([k, v]) => ({
            name: TYPE_LABELS[k] || k,
            value: v,
          })),
        },
      ],
    };
  }, [byType, dark]);

  const pieRef = useEcharts(pieOpt, [pieOpt]);

  return (
    <div className="lp-admin-page">
      <header className="lp-admin-page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            资源汇总
          </Title>
          <Text type="secondary">全站 {total} 项生成资源 · 按类型与用户分布</Text>
        </div>
      </header>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card className="lp-admin-chart-card" title="类型占比">
            <div ref={pieRef} className="lp-admin-chart" />
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card className="lp-admin-table-card" title="最近资源">
            <Table
              rowKey="id"
              loading={loading}
              dataSource={resources}
              pagination={{ pageSize: 10 }}
              size="small"
              columns={[
                { title: "标题", dataIndex: "title", ellipsis: true },
                {
                  title: "类型",
                  dataIndex: "type",
                  width: 100,
                  render: (t: string) => <Tag>{TYPE_LABELS[t] || t}</Tag>,
                },
                { title: "用户", dataIndex: "user_id", width: 120, ellipsis: true },
                { title: "创建", dataIndex: "created_at", width: 170 },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
