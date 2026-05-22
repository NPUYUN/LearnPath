"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  Row,
  Col,
  Progress,
  Tag,
  Typography,
  Divider,
  Button,
  Timeline,
} from "antd";
import {
  FireOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  BookOutlined,
  RiseOutlined,
} from "@ant-design/icons";
import type { EChartsOption } from "echarts";
import { useEcharts } from "@/lib/useEcharts";

const { Title, Text, Paragraph } = Typography;

const STATS = [
  {
    title: "累计学习时长",
    value: "12h",
    icon: <ClockCircleOutlined style={{ color: "#1677ff" }} />,
    color: "#e6f4ff",
  },
  {
    title: "已生成资源",
    value: 6,
    suffix: "个",
    icon: <BookOutlined style={{ color: "#52c41a" }} />,
    color: "#f6ffed",
  },
  {
    title: "画像完整度",
    value: 85,
    suffix: "%",
    icon: <CheckCircleOutlined style={{ color: "#fa8c16" }} />,
    color: "#fff7e6",
  },
  {
    title: "学习连续天数",
    value: 3,
    suffix: "天",
    icon: <FireOutlined style={{ color: "#f5222d" }} />,
    color: "#fff1f0",
  },
];

const DIMENSIONS = [
  { name: "知识掌握度", before: 45, after: 62, color: "#1677ff" },
  { name: "实践能力", before: 38, after: 58, color: "#52c41a" },
  { name: "理解深度", before: 50, after: 65, color: "#fa8c16" },
  { name: "学习效率", before: 55, after: 70, color: "#722ed1" },
  { name: "应用迁移", before: 30, after: 48, color: "#13c2c2" },
];

const RECENT_EVENTS = [
  { color: "green", label: "完成", content: "完成导论章节预习", date: "今天" },
  { color: "blue", label: "生成", content: "生成线性回归相关学习资源", date: "今天" },
  { color: "green", label: "画像", content: "对话更新学习画像 6 维", date: "昨天" },
];

const RADAR_OPTION: EChartsOption = {
  legend: { data: ["学习前", "学习后"], bottom: 0 },
  radar: {
    indicator: DIMENSIONS.map((d) => ({ name: d.name, max: 100 })),
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
        {
          value: DIMENSIONS.map((d) => d.before),
          name: "学习前",
          areaStyle: { color: "rgba(100,100,100,0.1)" },
          lineStyle: { color: "#aaa", type: "dashed" },
          itemStyle: { color: "#aaa" },
        },
        {
          value: DIMENSIONS.map((d) => d.after),
          name: "学习后",
          areaStyle: { color: "rgba(22,119,255,0.15)" },
          lineStyle: { color: "#1677ff" },
          itemStyle: { color: "#1677ff" },
        },
      ],
    },
  ],
};

const BAR_OPTION: EChartsOption = {
  grid: { top: 20, bottom: 40, left: 50, right: 20 },
  xAxis: {
    type: "category",
    data: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  },
  yAxis: { type: "value", name: "分钟", nameTextStyle: { fontSize: 11 } },
  series: [
    {
      type: "bar",
      data: [30, 45, 20, 60, 40, 90, 75],
      itemStyle: { color: "#1677ff", borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: "top", fontSize: 11 },
    },
  ],
  tooltip: { trigger: "axis" },
};

export default function EvaluationContent() {
  const router = useRouter();
  const radarRef = useEcharts(RADAR_OPTION, []);
  const barRef = useEcharts(BAR_OPTION, []);

  return (
    <div style={{ padding: 24, maxWidth: 1060, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            学习效果评估
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            框架演示数据 · 后续对接 EvalAgent API
          </Text>
        </div>
        <Button icon={<RiseOutlined />} onClick={() => router.push("/chat")}>
          更新评估
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {STATS.map((s) => (
          <Col xs={12} sm={6} key={s.title}>
            <Card
              style={{ background: s.color, borderColor: "transparent" }}
              styles={{ body: { padding: "16px 20px" } }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 24 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
                    {s.value}
                    {"suffix" in s ? s.suffix : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "#888" }}>{s.title}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="能力成长对比雷达图">
            <div ref={radarRef} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="本周每日学习时长（分钟）">
            <div ref={barRef} style={{ height: 280 }} />
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card title="AI 学习报告" extra={<Tag color="blue">自动生成</Tag>}>
            <Paragraph style={{ color: "#444", lineHeight: 1.9 }}>
              根据当前学习行为，你的整体表现
              <Text strong style={{ color: "#52c41a" }}>
                良好
              </Text>
              。建议继续完成路径中的练习与代码案例。
            </Paragraph>
            <Paragraph style={{ color: "#444", lineHeight: 1.9 }}>
              <Text strong>优势：</Text>画像维度已建立，资源生成覆盖多模态类型。
            </Paragraph>
            <Paragraph style={{ color: "#444", lineHeight: 1.9 }}>
              <Text strong>待提升：</Text>应用迁移与测验完成度可在 Sprint 4 接入真实评估数据。
            </Paragraph>
            <Divider style={{ margin: "12px 0" }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {DIMENSIONS.map((d) => (
                <div key={d.name} style={{ minWidth: 160 }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                    {d.name}{" "}
                    <Text strong style={{ color: d.color }}>
                      +{d.after - d.before}分
                    </Text>
                  </div>
                  <Progress
                    percent={d.after}
                    strokeColor={d.color}
                    size="small"
                    showInfo={false}
                  />
                </div>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="近期学习记录">
            <Timeline
              items={RECENT_EVENTS.map((e) => ({
                color: e.color,
                children: (
                  <div>
                    <Tag color={e.color} style={{ fontSize: 11 }}>
                      {e.label}
                    </Tag>
                    <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>
                      {e.content}
                    </div>
                    <div style={{ fontSize: 11, color: "#bfbfbf", marginTop: 2 }}>
                      {e.date}
                    </div>
                  </div>
                ),
              }))}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
