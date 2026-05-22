"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  Row,
  Col,
  Tag,
  Progress,
  Button,
  Divider,
  Typography,
  Tooltip,
  Spin,
  Empty,
} from "antd";
import {
  UserOutlined,
  BookOutlined,
  ThunderboltOutlined,
  AimOutlined,
  ClockCircleOutlined,
  HeartOutlined,
  EditOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import type { EChartsOption } from "echarts";
import { getProfile, type StudentProfile } from "@/lib/api";
import { useEcharts } from "@/lib/useEcharts";
import { useAppStore } from "@/store/appStore";

const { Title, Paragraph, Text } = Typography;

function scoreFromText(text: string, base = 60): number {
  if (/进阶|熟练|良好|扎实/.test(text)) return Math.min(base + 25, 95);
  if (/入门|初学|一般/.test(text)) return Math.max(base - 10, 35);
  return base;
}

function buildDimensions(p: StudentProfile) {
  return [
    {
      key: "knowledge",
      label: "知识基础",
      icon: <BookOutlined />,
      color: "#1677ff",
      score: scoreFromText(p.knowledge_level, 55),
      detail: p.knowledge_level,
      tags: p.error_prone_topics?.slice(0, 3) || [],
    },
    {
      key: "goal",
      label: "学习目标",
      icon: <AimOutlined />,
      color: "#fa8c16",
      score: scoreFromText(p.learning_goal, 75),
      detail: p.learning_goal,
      tags: [p.learning_goal?.slice(0, 12) || "未设定"],
    },
    {
      key: "style",
      label: "认知风格",
      icon: <HeartOutlined />,
      color: "#722ed1",
      score: scoreFromText(p.cognitive_style, 68),
      detail: p.cognitive_style,
      tags: [p.cognitive_style],
    },
    {
      key: "modality",
      label: "偏好模态",
      icon: <ThunderboltOutlined />,
      color: "#52c41a",
      score: 72,
      detail: p.preferred_modality,
      tags: p.preferred_modality?.split(/[+、,]/).filter(Boolean).slice(0, 3) || [],
    },
    {
      key: "time",
      label: "时间投入",
      icon: <ClockCircleOutlined />,
      color: "#13c2c2",
      score: scoreFromText(p.pace_and_time, 58),
      detail: p.pace_and_time,
      tags: [p.pace_and_time?.slice(0, 10) || "—"],
    },
    {
      key: "progress",
      label: "近期进度",
      icon: <UserOutlined />,
      color: "#eb2f96",
      score: scoreFromText(p.recent_progress, 50),
      detail: p.recent_progress,
      tags: p.error_prone_topics?.length ? ["有薄弱点"] : ["进行中"],
    },
  ];
}

export default function ProfileContent() {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const storeProfile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const [profile, setLocal] = useState<StudentProfile | null>(storeProfile);
  const [loading, setLoading] = useState(!storeProfile);

  useEffect(() => {
    if (storeProfile) setLocal(storeProfile);
    getProfile(userId)
      .then((p) => {
        if (p) {
          setLocal(p);
          setProfile(p);
        } else if (!storeProfile) {
          setLocal(null);
        }
      })
      .catch(() => {
        if (!storeProfile) setLocal(null);
      })
      .finally(() => setLoading(false));
  }, [userId, setProfile]);

  const dimensions = useMemo(
    () => (profile ? buildDimensions(profile) : []),
    [profile]
  );

  const chartOption: EChartsOption | null = useMemo(() => {
    if (!dimensions.length) return null;
    return {
      radar: {
        indicator: dimensions.map((d) => ({ name: d.label, max: 100 })),
        radius: "68%",
        axisName: { color: "#444", fontSize: 13, fontWeight: 500 },
        splitArea: { areaStyle: { color: ["#fafafa", "#f0f7ff"] } },
        axisLine: { lineStyle: { color: "#e0e0e0" } },
        splitLine: { lineStyle: { color: "#e0e0e0" } },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: dimensions.map((d) => d.score),
              name: "学习画像",
              areaStyle: { color: "rgba(22,119,255,0.15)" },
              lineStyle: { color: "#1677ff", width: 2 },
              itemStyle: { color: "#1677ff" },
            },
          ],
        },
      ],
      tooltip: { trigger: "item" },
    };
  }, [dimensions]);

  const chartRef = useEcharts(chartOption, [profile?.user_id, dimensions.length]);

  if (loading && !profile) {
    return (
      <div style={{ padding: 80, textAlign: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ padding: 48, maxWidth: 560, margin: "0 auto" }}>
        <Empty description="尚未建立学习画像">
          <Button type="primary" onClick={() => router.push("/chat")}>
            去对话构建画像
          </Button>
        </Empty>
      </div>
    );
  }

  const summary = `当前基础「${profile.knowledge_level}」，目标为「${profile.learning_goal}」。偏好 ${profile.preferred_modality}，${profile.pace_and_time}。${profile.error_prone_topics?.length ? `建议重点巩固：${profile.error_prone_topics.join("、")}。` : ""}`;

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
            我的学习画像
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            对话自动抽取 · 6 个维度
          </Text>
        </div>
        <Button icon={<EditOutlined />} onClick={() => router.push("/chat")}>
          更新画像
        </Button>
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={10}>
          <Card title="综合能力雷达图" style={{ height: 380 }}>
            <div ref={chartRef} style={{ height: 300 }} />
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card title="画像综合评价" style={{ height: 380 }}>
            <Paragraph style={{ color: "#444", lineHeight: 1.8, fontSize: 14 }}>
              {summary}
            </Paragraph>
            <Divider style={{ margin: "12px 0" }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {dimensions.map((d) => (
                <Tag key={d.key} color="blue" style={{ borderRadius: 20, padding: "2px 12px" }}>
                  {d.label}：{d.score}分
                </Tag>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <Button type="primary" onClick={() => router.push("/path")} style={{ marginRight: 10 }}>
                查看学习路径
              </Button>
              <Button onClick={() => router.push("/chat")}>继续对话优化</Button>
            </div>
          </Card>
        </Col>

        {dimensions.map((d) => (
          <Col xs={24} sm={12} lg={8} key={d.key}>
            <Card
              size="small"
              title={
                <span style={{ color: d.color }}>
                  {d.icon} &nbsp;{d.label}
                </span>
              }
              extra={
                <Tooltip title={d.detail}>
                  <InfoCircleOutlined style={{ color: "#bfbfbf" }} />
                </Tooltip>
              }
            >
              <Progress
                percent={d.score}
                strokeColor={d.color}
                trailColor="#f0f0f0"
                format={(p) => (
                  <span style={{ color: d.color, fontWeight: 600 }}>{p}分</span>
                )}
                style={{ marginBottom: 10 }}
              />
              <Paragraph style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                {d.detail}
              </Paragraph>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {d.tags.map((t, idx) => (
                  <Tag key={`${d.key}-tag-${idx}`} style={{ fontSize: 11 }}>
                    {t}
                  </Tag>
                ))}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
