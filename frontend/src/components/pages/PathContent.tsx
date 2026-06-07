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
import BranchesOutlined from "@ant-design/icons/BranchesOutlined";
import PageHeader from "@/components/PageHeader";
import {
  getPath,
  refreshPath,
  listResources,
  updatePathStep,
  type LearningPath,
  type PathStep,
} from "@/lib/api";
import {
  countStepResources,
  flattenPathSteps,
  getStepKey,
  pathProgressPercent,
} from "@/lib/pathUtils";
import { displayCourseName, useAppStore } from "@/store/appStore";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";

const { Text, Paragraph } = Typography;

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

type PathStepCardProps = {
  step: PathStep;
  depth?: number;
  resourceTitles: Record<string, string>;
  expanded: string;
  markingKey: string | null;
  onToggle: (key: string) => void;
  onMarkDone: (stepKey: string, e: React.MouseEvent) => void;
};

function PathStepCard({
  step,
  depth = 0,
  resourceTitles,
  expanded,
  markingKey,
  onToggle,
  onMarkDone,
}: PathStepCardProps) {
  const stepKey = getStepKey(step);
  const cfg = STATUS_CONFIG[mapStatus(step.status)];
  const isOpen = expanded === stepKey;
  const progress =
    mapStatus(step.status) === "done" ? 100 : mapStatus(step.status) === "in_progress" ? 50 : 0;
  const substeps = step.substeps ?? [];
  const resourceCount = countStepResources(step);
  const ownResourceIds = step.resource_ids ?? [];

  return (
    <div
      className={depth > 0 ? "lp-path-substep-wrap" : undefined}
      style={depth > 0 ? { marginLeft: depth * 20, marginTop: 10 } : undefined}
    >
      <Card
        onClick={() => onToggle(stepKey)}
        hoverable
        size={depth > 0 ? "small" : undefined}
        style={{
          cursor: "pointer",
          borderColor: mapStatus(step.status) === "in_progress" ? "#1677ff" : undefined,
        }}
        styles={{ body: { padding: depth > 0 ? 12 : 16 } }}
      >
        <Row align="middle" gutter={12}>
          <Col>
            <div
              style={{
                width: depth > 0 ? 32 : 40,
                height: depth > 0 ? 32 : 40,
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
                fontSize: depth > 0 ? 14 : 18,
                color: cfg.tagColor,
              }}
            >
              {depth > 0 ? <BranchesOutlined /> : cfg.icon}
            </div>
          </Col>
          <Col flex="auto">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {depth === 0 && step.id && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {step.id}
                </Text>
              )}
              <Text strong style={{ fontSize: depth > 0 ? 14 : 15 }}>
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
              {substeps.length > 0 && (
                <Tag icon={<BranchesOutlined />}>{substeps.length} 个子步骤</Tag>
              )}
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
              {resourceCount} 个资源
            </Text>
          </Col>
        </Row>

        {isOpen && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            <Paragraph className="lp-prose" style={{ marginBottom: 12 }}>
              {step.objective}
            </Paragraph>
            {ownResourceIds.length > 0 && (
              <>
                <Text strong style={{ fontSize: 13 }}>
                  配套资源
                </Text>
                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ownResourceIds.map((id, i) => (
                    <Tooltip key={i} title={resourceTitles[id] || id}>
                      <Tag style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {resourceTitles[id] || `资源 ${id}`}
                      </Tag>
                    </Tooltip>
                  ))}
                </div>
              </>
            )}
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {mapStatus(step.status) !== "done" && (
                <Button
                  type="primary"
                  size="small"
                  loading={markingKey === stepKey}
                  onClick={(e) => onMarkDone(stepKey, e)}
                >
                  标记完成
                </Button>
              )}
              {mapStatus(step.status) === "in_progress" && ownResourceIds.length > 0 && (
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

      {substeps.map((sub) => (
        <PathStepCard
          key={getStepKey(sub)}
          step={sub}
          depth={depth + 1}
          resourceTitles={resourceTitles}
          expanded={expanded}
          markingKey={markingKey}
          onToggle={onToggle}
          onMarkDone={onMarkDone}
        />
      ))}
    </div>
  );
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
  const [markingKey, setMarkingKey] = useState<string | null>(null);
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
      const first = flattenPathSteps(p?.steps).find((s) => s.status === "in_progress") ?? p?.steps?.[0];
      if (first) setExpanded(getStepKey(first));
    } catch {
      if (!background) setPath(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cachedPath && cachedPath.user_id === userId) {
      setPath(cachedPath);
      const first =
        flattenPathSteps(cachedPath.steps).find((s) => s.status === "in_progress") ??
        cachedPath.steps?.[0];
      if (first) setExpanded(getStepKey(first));
      if (Object.keys(cachedTitles).length) setResourceTitlesLocal(cachedTitles);
      setLoading(false);
      return;
    }
    setPath(null);
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cachedPath]);

  const handleMarkDone = async (stepKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkingKey(stepKey);
    try {
      const p = await updatePathStep(userId, stepKey, "done");
      setPath(p);
      setLearningPath(p);
      message.success("已标记完成");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "更新失败");
    } finally {
      setMarkingKey(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const p = await refreshPath(userId);
      setPath(p);
      setLearningPath(p);
      const first = flattenPathSteps(p.steps).find((s) => s.status === "in_progress") ?? p.steps[0];
      if (first) setExpanded(getStepKey(first));
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
  const flatSteps = flattenPathSteps(steps);
  const overallProgress = pathProgressPercent(steps);

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
        subtitle={`${steps.length} 个主阶段 · ${flatSteps.length} 个学习节点 · ${courseLabel}`}
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
              <Text type="secondary" style={{ fontSize: 12 }}>
                路径由 AI 按章节与学习规律动态划分，主阶段下可展开子路径
              </Text>
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
          <Row gutter={12} style={{ marginTop: 12 }}>
            {steps.map((s) => {
              const cfg = STATUS_CONFIG[mapStatus(s.status)];
              return (
                <Col key={getStepKey(s)} flex="1" style={{ textAlign: "center", minWidth: 72 }}>
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
                        {s.title.length > 8 ? `${s.title.slice(0, 8)}…` : s.title}
                      </span>
                    }
                  />
                </Col>
              );
            })}
          </Row>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {steps.map((step) => (
            <PathStepCard
              key={getStepKey(step)}
              step={step}
              resourceTitles={resourceTitles}
              expanded={expanded}
              markingKey={markingKey}
              onToggle={(key) => setExpanded((prev) => (prev === key ? "" : key))}
              onMarkDone={handleMarkDone}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
