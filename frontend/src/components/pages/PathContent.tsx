"use client";

import { useEffect, useState } from "react";
import { clientNavigate } from "@/lib/clientNav";
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
import PageHeader from "@/components/PageHeader";
import {
  getPath,
  refreshPath,
  listResources,
  updatePathStep,
  type LearningPath,
  type PathStep,
} from "@/lib/api";
import { displayCourseName, useAppStore } from "@/store/appStore";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";

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
  const userId = useAppStore((s) => s.userId);
  const courseName = useAppStore((s) => s.courseName);
  const courseLabel = displayCourseName(courseName, userId);
  const cachedPath = useAppStore((s) => s.learningPath);
  const cachedTitles = useAppStore((s) => s.resourceTitles);
  const setLearningPath = useAppStore((s) => s.setLearningPath);
  const setResourceTitlesStore = useAppStore((s) => s.setResourceTitles);
  const cachedResources = useAppStore((s) => s.resources);
  const [path, setPath] = useState<LearningPath | null>(cachedPath);
  const [resourceTitles, setResourceTitlesLocal] = useState<Record<string, string>>(cachedTitles);
  const [loading, setLoading] = useState(!cachedPath);
  const [refreshing, setRefreshing] = useState(false);
  const [markingOrder, setMarkingOrder] = useState<number | null>(null);
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
    if (cachedPath && cachedPath.user_id === userId) {
      setPath(cachedPath);
      setExpanded(`step-${cachedPath.steps?.[0]?.order ?? 1}`);
      if (Object.keys(cachedTitles).length) setResourceTitlesLocal(cachedTitles);
      setLoading(false);
      return;
    }
    setPath(null);
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cachedPath]);

  const handleMarkDone = async (order: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkingOrder(order);
    try {
      const p = await updatePathStep(userId, order, "done");
      setPath(p);
      setLearningPath(p);
      message.success(`步骤 ${order} 已标记完成`);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "更新失败");
    } finally {
      setMarkingOrder(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const p = await refreshPath(userId);
      setPath(p);
      setLearningPath(p);
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
          <Button style={{ marginLeft: 8 }} onClick={() => clientNavigate("/chat")}>
            去对话
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="我的学习路径"
        subtitle={`${steps.length} 个阶段 · ${courseLabel}`}
        icon={<ApartmentOutlined />}
        extra={
          <Button icon={<FireOutlined />} type="primary" loading={refreshing} onClick={handleRefresh}>
            重新规划
          </Button>
        }
      />
      <div className="lp-page-body" style={{ maxWidth: 900 }}>
      <Card className="lp-path-progress-card" style={{ marginBottom: 20 }}>
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
                <span style={{ fontWeight: 700, color: "var(--lp-primary)" }}>{p}%</span>
              )}
            />
          </Col>
          <Col>
            <div style={{ textAlign: "center" }}>
              <TrophyOutlined style={{ fontSize: 32, color: "#faad14" }} />
              <div className="lp-muted-text" style={{ fontSize: 12, marginTop: 4 }}>
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
                        color:
                          mapStatus(s.status) === "in_progress"
                            ? "var(--lp-primary)"
                            : "var(--lp-text-muted)",
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
                  <Paragraph className="lp-prose" style={{ marginBottom: 12 }}>
                    {step.objective}
                  </Paragraph>
                  <Text strong style={{ fontSize: 13 }}>
                    配套资源
                  </Text>
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {renderStepResources(step)}
                  </div>
                  <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {mapStatus(step.status) !== "done" && (
                      <Button
                        type="primary"
                        size="small"
                        loading={markingOrder === step.order}
                        onClick={(e) => handleMarkDone(step.order, e)}
                      >
                        标记完成
                      </Button>
                    )}
                    {mapStatus(step.status) === "in_progress" && (
                      <Button
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          clientNavigate("/resources");
                        }}
                      >
                        查看本阶段资源
                      </Button>
                    )}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
      </div>
    </div>
  );
}
