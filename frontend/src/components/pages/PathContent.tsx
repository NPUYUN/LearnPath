"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  Tag,
  Button,
  Typography,
  Progress,
  Row,
  Col,
  Badge,
  Divider,
  Tooltip,
  Spin,
  Empty,
  message,
} from "antd";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import PlayCircleOutlined from "@ant-design/icons/PlayCircleOutlined";
import LockOutlined from "@ant-design/icons/LockOutlined";
import FireOutlined from "@ant-design/icons/FireOutlined";
import TrophyOutlined from "@ant-design/icons/TrophyOutlined";
import { getPath, refreshPath, listResources, type LearningPath, type PathStep } from "@/lib/api";
import { useAppStore } from "@/store/appStore";

const { Title, Text, Paragraph } = Typography;

const STATUS_CONFIG = {
  done: {
    color: "success" as const,
    icon: <CheckCircleOutlined />,
    label: "已完成",
    tagColor: "#52c41a",
  },
  in_progress: {
    color: "processing" as const,
    icon: <PlayCircleOutlined />,
    label: "进行中",
    tagColor: "#1677ff",
  },
  pending: {
    color: "default" as const,
    icon: <LockOutlined />,
    label: "待开始",
    tagColor: "#d9d9d9",
  },
};

function mapStatus(s: string): keyof typeof STATUS_CONFIG {
  if (s === "done") return "done";
  if (s === "in_progress") return "in_progress";
  return "pending";
}

export default function PathContent() {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const cachedPath = useAppStore((s) => s.learningPath);
  const cachedTitles = useAppStore((s) => s.resourceTitles);
  const setLearningPath = useAppStore((s) => s.setLearningPath);
  const setResourceTitlesStore = useAppStore((s) => s.setResourceTitles);
  const cachedResources = useAppStore((s) => s.resources);
  const [path, setPath] = useState<LearningPath | null>(cachedPath);
  const [resourceTitles, setResourceTitlesLocal] = useState<Record<string, string>>(cachedTitles);
  const [loading, setLoading] = useState(!cachedPath);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string>("");

  const applyResourcesTitles = (resources: { id: string; title: string }[]) => {
    const titles: Record<string, string> = {};
    resources.forEach((r) => {
      titles[r.id] = r.title;
    });
    setResourceTitlesLocal(titles);
    setResourceTitlesStore(titles);
    return titles;
  };

  const load = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const resources =
        cachedResources.length > 0
          ? cachedResources
          : await listResources(userId).catch(() => []);
      const p = await getPath(userId);
      setPath(p);
      setLearningPath(p);
      applyResourcesTitles(resources);
      if (p?.steps?.[0]) {
        setExpanded(`step-${p.steps[0].order}`);
      }
    } catch {
      if (!background) setPath(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cachedPath) {
      setPath(cachedPath);
      setExpanded(`step-${cachedPath.steps[0]?.order ?? 1}`);
      if (Object.keys(cachedTitles).length) setResourceTitlesLocal(cachedTitles);
      void load(true);
    } else {
      void load(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const p = await refreshPath(userId);
      setPath(p);
      if (p.steps[0]) setExpanded(`step-${p.steps[0].order}`);
      message.success("学习路径已更新");
    } catch (e: unknown) {
      message.error(
        e instanceof Error ? e.message : "请先生成资源或在对话中请求规划路径"
      );
    } finally {
      setRefreshing(false);
    }
  };

  const steps = path?.steps || [];
  const overallProgress = steps.length
    ? Math.round(
        steps.reduce((s, st) => {
          const stKey = mapStatus(st.status);
          return s + (stKey === "done" ? 100 : stKey === "in_progress" ? 50 : 0);
        }, 0) / steps.length
      )
    : 0;

  const renderStepResources = (step: PathStep) =>
    step.resource_ids.map((id, i) => (
      <Tooltip key={i} title={resourceTitles[id] || id}>
        <Tag style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
          {resourceTitles[id] || `资源 ${id}`}
        </Tag>
      </Tooltip>
    ));

  if (loading && !path?.steps?.length) {
    return (
      <div style={{ padding: 80, textAlign: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!path?.steps?.length) {
    return (
      <div style={{ padding: 48, maxWidth: 520, margin: "0 auto" }}>
        <Empty description="尚未生成学习路径">
          <Button type="primary" loading={refreshing} onClick={handleRefresh}>
            生成学习路径
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={() => router.push("/chat")}>
            去对话
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
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
            我的学习路径
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {steps.length} 个阶段 · 机器学习导论
          </Text>
        </div>
        <Button
          icon={<FireOutlined />}
          type="primary"
          loading={refreshing}
          onClick={handleRefresh}
        >
          重新规划
        </Button>
      </div>

      <Card
        style={{
          marginBottom: 20,
          background: "linear-gradient(135deg, #e6f4ff 0%, #fff 100%)",
        }}
      >
        <Row align="middle" gutter={20}>
          <Col flex="auto">
            <Text strong style={{ fontSize: 15 }}>
              总体进度
            </Text>
            <Progress
              percent={overallProgress}
              strokeColor={{ "0%": "#1677ff", "100%": "#52c41a" }}
              style={{ marginTop: 8 }}
              format={(p) => (
                <span style={{ fontWeight: 700, color: "#1677ff" }}>{p}%</span>
              )}
            />
          </Col>
          <Col>
            <div style={{ textAlign: "center" }}>
              <TrophyOutlined style={{ fontSize: 32, color: "#faad14" }} />
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                个性化路径
              </div>
            </div>
          </Col>
        </Row>
        <Row gutter={20} style={{ marginTop: 12 }}>
          {steps.map((s) => {
            const cfg = STATUS_CONFIG[mapStatus(s.status)];
            return (
              <Col key={s.order} span={Math.floor(24 / steps.length) || 6} style={{ textAlign: "center" }}>
                <Badge
                  status={cfg.color}
                  text={
                    <span
                      style={{
                        fontSize: 12,
                        color: mapStatus(s.status) === "in_progress" ? "#1677ff" : "#888",
                      }}
                    >
                      步骤{s.order}
                    </span>
                  }
                />
              </Col>
            );
          })}
        </Row>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {steps.map((step) => {
          const stepKey = `step-${step.order}`;
          const cfg = STATUS_CONFIG[mapStatus(step.status)];
          const isOpen = expanded === stepKey;
          const progress =
            mapStatus(step.status) === "done"
              ? 100
              : mapStatus(step.status) === "in_progress"
                ? 50
                : 0;

          return (
            <Card
              key={stepKey}
              onClick={() => setExpanded(isOpen ? "" : stepKey)}
              hoverable
              style={{
                cursor: "pointer",
                borderColor: mapStatus(step.status) === "in_progress" ? "#1677ff" : undefined,
              }}
              styles={{ body: { padding: 16 } }}
            >
              <Row align="middle" gutter={12}>
                <Col>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background:
                        mapStatus(step.status) === "done"
                          ? "#f6ffed"
                          : mapStatus(step.status) === "in_progress"
                            ? "#e6f4ff"
                            : "#f5f5f5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      color: cfg.tagColor,
                    }}
                  >
                    {cfg.icon}
                  </div>
                </Col>
                <Col flex="auto">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text strong style={{ fontSize: 15 }}>
                      {step.title}
                    </Text>
                    <Tag
                      color={
                        mapStatus(step.status) === "done"
                          ? "success"
                          : mapStatus(step.status) === "in_progress"
                            ? "processing"
                            : "default"
                      }
                    >
                      {cfg.label}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      约 {step.estimated_minutes} 分钟
                    </Text>
                  </div>
                  <Progress
                    percent={progress}
                    strokeColor={cfg.tagColor}
                    size="small"
                    style={{ marginTop: 6, marginBottom: 0, maxWidth: 300 }}
                  />
                </Col>
                <Col>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {step.resource_ids.length} 个资源
                  </Text>
                </Col>
              </Row>

              {isOpen && (
                <>
                  <Divider style={{ margin: "12px 0" }} />
                  <Paragraph style={{ color: "#555", marginBottom: 12 }}>
                    {step.objective}
                  </Paragraph>
                  <Text strong style={{ fontSize: 13 }}>
                    配套资源
                  </Text>
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {renderStepResources(step)}
                  </div>
                  {mapStatus(step.status) === "in_progress" && (
                    <div style={{ marginTop: 14 }}>
                      <Button
                        type="primary"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/resources");
                        }}
                      >
                        查看本阶段资源
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
