"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Progress,
  Row,
  Skeleton,
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
import { getEvalStats, type EvalStats } from "@/lib/api";
import { useAppStore } from "@/store/appStore";

const { Title, Text, Paragraph } = Typography;

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  doc: "文档",
  mindmap: "思维导图",
  quiz: "测验",
  reading: "阅读材料",
  media: "多媒体",
  code: "代码示例",
};

export default function EvaluationContent() {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const [stats, setStats] = useState<EvalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEvalStats(userId);
      setStats(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const radarOption: EChartsOption = stats
    ? {
        legend: { data: ["学习前", "学习后"], bottom: 0 },
        radar: {
          indicator: stats.radar.dimensions.map((d) => ({ name: d, max: 100 })),
          radius: "60%",
          axisName: { fontSize: 12 },
          splitArea: { areaStyle: { color: ["#fafafa", "#f0f7ff"] } },
          axisLine: { lineStyle: { color: "#e0e0e0" } },
          splitLine: { lineStyle: { color: "#e0e0e0" } },
        },
        series: [
          {
            type: "radar",
            data: [
              { value: stats.radar.before, name: "学习前", areaStyle: { color: "rgba(100,100,100,0.1)" }, lineStyle: { color: "#aaa", type: "dashed" }, itemStyle: { color: "#aaa" } },
              { value: stats.radar.after, name: "学习后", areaStyle: { color: "rgba(22,119,255,0.15)" }, lineStyle: { color: "#1677ff" }, itemStyle: { color: "#1677ff" } },
            ],
          },
        ],
      }
    : {};

  const barOption: EChartsOption = stats
    ? {
        grid: { top: 20, bottom: 40, left: 60, right: 20 },
        xAxis: { type: "value", name: "个", nameTextStyle: { fontSize: 11 } },
        yAxis: {
          type: "category",
          data: Object.keys(stats.resources_by_type).map((k) => RESOURCE_TYPE_LABELS[k] ?? k),
        },
        series: [
          {
            type: "bar",
            data: Object.values(stats.resources_by_type),
            itemStyle: { color: "#1677ff", borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: "right", fontSize: 12 },
          },
        ],
        tooltip: { trigger: "axis" },
      }
    : {};

  const radarRef = useEcharts(radarOption, [stats]);
  const barRef = useEcharts(barOption, [stats]);

  const statCards = stats
    ? [
        { title: "累计学习天数", value: stats.study_days, suffix: "天", icon: <ClockCircleOutlined style={{ color: "#1677ff" }} />, color: "#e6f4ff" },
        { title: "已生成资源", value: stats.total_resources, suffix: "个", icon: <BookOutlined style={{ color: "#52c41a" }} />, color: "#f6ffed" },
        { title: "画像完整度", value: stats.profile_completeness, suffix: "%", icon: <CheckCircleOutlined style={{ color: "#fa8c16" }} />, color: "#fff7e6" },
        { title: "学习路径", value: stats.has_path ? "已规划" : "待生成", icon: <FireOutlined style={{ color: "#f5222d" }} />, color: "#fff1f0" },
      ]
    : [];

  const suggestion = stats
    ? stats.total_resources === 0
      ? "你尚未生成任何学习资源。建议先前往「AI 助手」对话，让系统为你构建学习画像并生成资源。"
      : stats.profile_completeness < 50
      ? `当前画像完整度为 ${stats.profile_completeness}%，建议继续与 AI 助手对话，补全学习偏好信息。`
      : `整体表现良好，已生成 ${stats.total_resources} 个学习资源，画像完整度 ${stats.profile_completeness}%。`
    : "";

  if (loading) return <div style={{ padding: 24, maxWidth: 1060, margin: "0 auto" }}><Skeleton active paragraph={{ rows: 8 }} /></div>;
  if (error) return <div style={{ padding: 24, maxWidth: 1060, margin: "0 auto" }}><Empty description={`加载失败：${error}`}><Button onClick={fetchStats}>重试</Button></Empty></div>;

  const hasData = stats && (stats.total_resources > 0 || stats.profile_completeness > 0);

  return (
    <div style={{ padding: 24, maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>学习效果评估</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>数据实时来自你的学习记录</Text>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={fetchStats}>刷新</Button>
          <Button icon={<RiseOutlined />} type="primary" onClick={() => router.push("/chat")}>更新评估</Button>
        </div>
      </div>

      {!hasData ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无学习数据，前往「AI 助手」对话开始学习" style={{ padding: "60px 0" }}>
          <Button type="primary" onClick={() => router.push("/chat")}>前往 AI 助手</Button>
        </Empty>
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            {statCards.map((s) => (
              <Col xs={12} sm={6} key={s.title}>
                <Card style={{ background: s.color, borderColor: "transparent" }} styles={{ body: { padding: "16px 20px" } }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 24 }}>{s.icon}</div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{s.value}{"suffix" in s ? s.suffix : ""}</div>
                      <div style={{ fontSize: 12, color: "#888" }}>{s.title}</div>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="能力成长对比雷达图"><div ref={radarRef} style={{ height: 280 }} /></Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="资源类型分布">
                {stats && Object.keys(stats.resources_by_type).length > 0
                  ? <div ref={barRef} style={{ height: 280 }} />
                  : <Empty description="暂无资源数据" style={{ height: 280, display: "flex", flexDirection: "column", justifyContent: "center" }} />}
              </Card>
            </Col>
            <Col xs={24} lg={14}>
              <Card title="AI 学习建议" extra={<Tag color="blue">自动生成</Tag>}>
                <Paragraph style={{ color: "#444", lineHeight: 1.9 }}>{suggestion}</Paragraph>
                {stats && stats.total_resources > 0 && (
                  <>
                    <Paragraph style={{ color: "#444", lineHeight: 1.9 }}>
                      <Text strong>优势：</Text>{stats.profile_completeness >= 60 ? "学习画像较完整，资源推荐精准度高。" : "已开始学习，具备初步数据基础。"}
                    </Paragraph>
                    <Paragraph style={{ color: "#444", lineHeight: 1.9 }}>
                      <Text strong>待提升：</Text>{stats.has_path ? "继续按路径推进，完成更多资源学习。" : "尚未生成学习路径，建议与 AI 助手对话自动规划。"}
                    </Paragraph>
                    <Divider style={{ margin: "12px 0" }} />
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {stats.radar.dimensions.map((dim, i) => (
                        <div key={dim} style={{ minWidth: 160 }}>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{dim} <Text strong style={{ color: "#1677ff" }}>+{stats.radar.after[i] - stats.radar.before[i]}分</Text></div>
                          <Progress percent={stats.radar.after[i]} strokeColor="#1677ff" size="small" showInfo={false} />
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
                  <Timeline items={stats.recent_events.map((e) => ({
                    color: e.color,
                    children: (
                      <div>
                        <Tag color={e.color} style={{ fontSize: 11 }}>{e.label}</Tag>
                        <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>{e.content}</div>
                        <div style={{ fontSize: 11, color: "#bfbfbf", marginTop: 2 }}>{e.date}</div>
                      </div>
                    ),
                  }))} />
                ) : (
                  <Empty description="暂无记录" />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
