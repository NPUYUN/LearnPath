"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clientNavigate } from "@/lib/clientNav";
import {
  Card,
  Tag,
  Button,
  Typography,
  Progress,
  Badge,
  Divider,
  Tooltip,
  Spin,
  Empty,
  Space,
  message,
  Modal,
  Select,
  Radio,
  Input,
  Alert,
} from "antd";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import PlayCircleOutlined from "@ant-design/icons/PlayCircleOutlined";
import LockOutlined from "@ant-design/icons/LockOutlined";
import FireOutlined from "@ant-design/icons/FireOutlined";
import TrophyOutlined from "@ant-design/icons/TrophyOutlined";
import BranchesOutlined from "@ant-design/icons/BranchesOutlined";
import LoadingOutlined from "@ant-design/icons/LoadingOutlined";
import VideoCameraOutlined from "@ant-design/icons/VideoCameraOutlined";
import { getStepClassroomButtonPhase, persistActiveClassroom } from "@/lib/classroomActive";
import PageHeader from "@/components/PageHeader";
import {
  getPath,
  getReplanContext,
  listClassroomLibrary,
  listLibraries,
  listResources,
  updatePathStep,
  type ClassroomLibraryItem,
  type LearningPath,
  type PathStep,
  type ReplanContext,
  type ResourceLibrary,
} from "@/lib/api";
import { loadActiveChatConversation } from "@/lib/chatActive";
import { getReplanLibraryId, setReplanLibraryId } from "@/lib/replanPrefs";
import ClassroomManageDrawer from "@/components/ClassroomManageDrawer";
import { usePathReplanJob } from "@/hooks/usePathReplanJob";
import {
  countStepResources,
  flattenPathSteps,
  getStepKey,
  pathProgressPercent,
} from "@/lib/pathUtils";
import { displayCourseName, useAppStore } from "@/store/appStore";
import { useStartClassroom } from "@/hooks/useStartClassroom";
import MasteryFeedbackBar from "@/components/MasteryFeedbackBar";
import PathDailyMinimumCard from "@/components/PathDailyMinimumCard";
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

/** 主概念 / 子概念图标：形状 + 配色区分层级 */
function getStepIconStyle(depth: number, status: keyof typeof STATUS_CONFIG) {
  const isSub = depth > 0;
  if (status === "done") {
    return {
      background: isSub ? "#ecfdf5" : "#f6ffed",
      color: isSub ? "#059669" : "#52c41a",
      borderRadius: isSub ? "50%" : 10,
      boxShadow: isSub
        ? "0 0 0 1px rgba(5, 150, 105, 0.18)"
        : "0 0 0 1px rgba(82, 196, 26, 0.2)",
    };
  }
  if (status === "in_progress") {
    return {
      background: isSub ? "#e0f2fe" : "#e6f4ff",
      color: isSub ? "#0284c7" : "#1677ff",
      borderRadius: isSub ? "50%" : 10,
      boxShadow: isSub
        ? "0 0 0 1px rgba(2, 132, 199, 0.22)"
        : "0 0 0 1px rgba(22, 119, 255, 0.22)",
    };
  }
  return {
    background: isSub ? "#fff7e6" : "#eef2ff",
    color: isSub ? "#d97706" : "#4f46e5",
    borderRadius: isSub ? "50%" : 10,
    boxShadow: isSub
      ? "0 0 0 1px rgba(217, 119, 6, 0.2)"
      : "0 0 0 1px rgba(79, 70, 229, 0.2)",
  };
}

type PathStepCardProps = {
  userId: string;
  step: PathStep;
  depth?: number;
  resourceTitles: Record<string, string>;
  expanded: string;
  markingKey: string | null;
  classroomLibrary: ClassroomLibraryItem[];
  onToggle: (key: string) => void;
  onMarkDone: (stepKey: string, e: React.MouseEvent) => void;
  onStartClassroom: (step: PathStep, e: React.MouseEvent) => void;
};

function PathStepCard({
  userId,
  step,
  depth = 0,
  resourceTitles,
  expanded,
  markingKey,
  classroomLibrary,
  onToggle,
  onMarkDone,
  onStartClassroom,
}: PathStepCardProps) {
  const stepKey = getStepKey(step);
  const activeClassroomSeed = useAppStore((s) => s.activeClassroomSeed);
  const activeClassroomJob = useAppStore((s) => s.activeClassroomJob);
  const activeClassroomResult = useAppStore((s) => s.activeClassroomResult);
  const classroomPhase = getStepClassroomButtonPhase(
    stepKey,
    activeClassroomSeed,
    activeClassroomJob,
    activeClassroomResult,
    classroomLibrary,
  );
  const status = mapStatus(step.status);
  const cfg = STATUS_CONFIG[status];
  const iconStyle = getStepIconStyle(depth, status);
  const isOpen = expanded === stepKey;
  const progress = status === "done" ? 100 : 0;
  const substeps = step.substeps ?? [];
  const resourceCount = countStepResources(step);
  const ownResourceIds = step.resource_ids ?? [];
  const showClassroomAction = depth > 0;

  return (
    <div
      id={`path-step-${stepKey}`}
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
        <div className="lp-path-step-row">
          <div className="lp-path-step-row-icon">
            <div
              className={depth > 0 ? "lp-path-step-icon lp-path-step-icon--sub" : "lp-path-step-icon lp-path-step-icon--main"}
              style={{
                width: depth > 0 ? 32 : 40,
                height: depth > 0 ? 32 : 40,
                borderRadius: iconStyle.borderRadius,
                background: iconStyle.background,
                boxShadow: iconStyle.boxShadow,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: depth > 0 ? 14 : 18,
                color: iconStyle.color,
              }}
            >
              {depth > 0 ? <BranchesOutlined /> : cfg.icon}
            </div>
          </div>
          <div className="lp-path-step-row-main">
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
                <Tag color="orange" icon={<BranchesOutlined />}>
                  {substeps.length} 个子步骤
                </Tag>
              )}
            </div>
            {progress > 0 && (
              <Progress
                percent={progress}
                strokeColor={cfg.tagColor}
                size="small"
                style={{ marginTop: 6, marginBottom: 0, maxWidth: 300 }}
              />
            )}
          </div>
          <div className="lp-path-step-row-actions">
            <div className="lp-path-node-actions">
              <Text type="secondary" style={{ fontSize: 12 }}>
                {resourceCount} 个资源
              </Text>
              {showClassroomAction && (
                <Button
                  type={
                    classroomPhase === "ready"
                      ? "primary"
                      : classroomPhase === "generating"
                        ? "default"
                        : mapStatus(step.status) === "pending"
                          ? "default"
                          : "primary"
                  }
                  size="small"
                  className={`lp-path-classroom-btn${classroomPhase !== "idle" ? ` is-${classroomPhase}` : ""}`}
                  icon={
                    classroomPhase === "ready" ? (
                      <CheckCircleOutlined />
                    ) : classroomPhase === "generating" ? (
                      <LoadingOutlined spin />
                    ) : (
                      <VideoCameraOutlined />
                    )
                  }
                  onClick={(e) => onStartClassroom(step, e)}
                >
                  {classroomPhase === "ready"
                    ? "进入课堂"
                    : classroomPhase === "generating"
                      ? "生成中"
                      : classroomPhase === "error"
                        ? "重新生成"
                        : "AI 课堂"}
                </Button>
              )}
            </div>
          </div>
        </div>

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
            <div style={{ marginTop: 14 }}>
              <MasteryFeedbackBar
                userId={userId}
                stepKey={stepKey}
                resourceId={ownResourceIds.find((id) => resourceTitles[id])}
                title={step.title}
                compact
              />
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {mapStatus(step.status) !== "done" && (
                <Button
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
          userId={userId}
          step={sub}
          depth={depth + 1}
          resourceTitles={resourceTitles}
          expanded={expanded}
          markingKey={markingKey}
          classroomLibrary={classroomLibrary}
          onToggle={onToggle}
          onMarkDone={onMarkDone}
          onStartClassroom={onStartClassroom}
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
  const pathReplanJob = useAppStore((s) => s.pathReplanJob);
  const isReplanRunning =
    pathReplanJob?.status === "queued" || pathReplanJob?.status === "running";
  const replanProgress = isReplanRunning ? (pathReplanJob?.progress ?? 0) : 0;
  const replanStage = isReplanRunning
    ? pathReplanJob?.stage || pathReplanJob?.step_label || ""
    : "";
  const setLearningPath = useAppStore((s) => s.setLearningPath);
  const setResourceTitlesStore = useAppStore((s) => s.setResourceTitles);
  const { startPathReplan } = usePathReplanJob();
  const { startClassroom } = useStartClassroom();
  const setPending = useAppStore((s) => s.setPendingClassroomSession);
  const setActiveSeed = useAppStore((s) => s.setActiveClassroomSeed);
  const setActiveJob = useAppStore((s) => s.setActiveClassroomJob);
  const setActiveResult = useAppStore((s) => s.setActiveClassroomResult);
  const setPanelMode = useAppStore((s) => s.setClassroomJobPanelMode);
  const cachedResources = useAppStore((s) => s.resources);
  const [path, setPath] = useState<LearningPath | null>(cachedPath);
  const [resourceTitles, setResourceTitlesLocal] = useState<Record<string, string>>(cachedTitles);
  const [loading, setLoading] = useState(!cachedPath);
  const [markingKey, setMarkingKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string>("");
  const [manageOpen, setManageOpen] = useState(false);
  const [classroomLibrary, setClassroomLibrary] = useState<ClassroomLibraryItem[]>([]);
  const [replanModalOpen, setReplanModalOpen] = useState(false);
  const [replanLibraries, setReplanLibraries] = useState<ResourceLibrary[]>([]);
  const [replanGenSource, setReplanGenSource] = useState<"web" | "library">("web");
  const [replanLibraryId, setReplanLibraryIdState] = useState<string | null>(null);
  const [replanLibrariesLoading, setReplanLibrariesLoading] = useState(false);
  const [replanGoalInput, setReplanGoalInput] = useState("");
  const [replanPlanningMode, setReplanPlanningMode] = useState<"auto" | "chapter" | "time" | "detailed">("auto");
  const [replanPlanningRequirement, setReplanPlanningRequirement] = useState("");
  const [replanContext, setReplanContext] = useState<ReplanContext | null>(null);
  const [replanContextLoading, setReplanContextLoading] = useState(false);
  const replanContextReqSeq = useRef(0);

  const loadClassroomLibrary = useCallback(async () => {
    try {
      const items = await listClassroomLibrary();
      setClassroomLibrary(items);
    } catch {
      /* 列表加载失败时保留当前数据 */
    }
  }, []);

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
    void loadClassroomLibrary();
  }, [loadClassroomLibrary, userId]);

  useEffect(() => {
    if (isReplanRunning) {
      setPath(null);
      setExpanded("");
    }
  }, [isReplanRunning]);

  useEffect(() => {
    if (isReplanRunning) return;

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
    if (!isReplanRunning) {
      setPath(null);
      void load(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cachedPath, isReplanRunning]);

  useEffect(() => {
    if (isReplanRunning) return;
    if (cachedPath?.steps?.length && cachedPath.user_id === userId) {
      setPath(cachedPath);
    }
  }, [cachedPath, userId, isReplanRunning]);

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

  const refreshReplanContext = useCallback(
    async (goalOverride?: string, libraryIdOverride?: string | null) => {
      const seq = ++replanContextReqSeq.current;
      setReplanContextLoading(true);
      try {
        const libId =
          libraryIdOverride !== undefined
            ? libraryIdOverride
            : replanGenSource === "library"
              ? replanLibraryId
              : null;
        const ctx = await getReplanContext(userId, {
          conversationId: loadActiveChatConversation(),
          learningGoal: goalOverride ?? replanGoalInput,
          libraryId: libId,
          planningMode: replanPlanningMode,
          planningRequirement: replanPlanningRequirement,
        });
        if (seq === replanContextReqSeq.current) setReplanContext(ctx);
      } catch {
        if (seq === replanContextReqSeq.current) setReplanContext(null);
      } finally {
        if (seq === replanContextReqSeq.current) setReplanContextLoading(false);
      }
    },
    [userId, replanGenSource, replanLibraryId, replanGoalInput, replanPlanningMode, replanPlanningRequirement],
  );

  const replanGoalInputRef = useRef(replanGoalInput);
  replanGoalInputRef.current = replanGoalInput;

  useEffect(() => {
    if (!replanModalOpen) return;
    const timer = window.setTimeout(() => {
      void refreshReplanContext(replanGoalInputRef.current);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [replanGoalInput, replanPlanningMode, replanPlanningRequirement, replanModalOpen, refreshReplanContext]);

  const openReplanModal = async () => {
    if (isReplanRunning) return;
    const saved = getReplanLibraryId();
    setReplanGenSource(saved ? "library" : "web");
    setReplanLibraryIdState(saved);
    setReplanGoalInput("");
    setReplanPlanningMode("auto");
    setReplanPlanningRequirement("");
    setReplanModalOpen(true);
    setReplanLibrariesLoading(true);
    try {
      const libs = await listLibraries(userId);
      const ready = libs.filter((l) => l.status === "ready" && (l.chunk_count ?? 0) > 0);
      setReplanLibraries(ready);
      let libId: string | null = null;
      if (saved && ready.some((l) => l.id === saved)) {
        setReplanGenSource("library");
        setReplanLibraryIdState(saved);
        libId = saved;
      } else if (ready.length === 1) {
        setReplanGenSource("library");
        setReplanLibraryIdState(ready[0].id);
        libId = ready[0].id;
      }
      await refreshReplanContext("", libId);
    } catch {
      setReplanLibraries([]);
      await refreshReplanContext("", null);
    } finally {
      setReplanLibrariesLoading(false);
    }
  };

  const handleStartClassroom = (step: PathStep, e: React.MouseEvent) => {
    e.stopPropagation();
    const stepKey = getStepKey(step);
    const seed = {
      stepKey,
      title: step.title,
      objective: step.objective,
      resourceIds: step.resource_ids || [],
      estimatedMinutes: step.estimated_minutes || 20,
      courseName: courseLabel,
      source: "path" as const,
    };
    const saved = classroomLibrary.find(
      (item) => item.step_key === stepKey && item.status === "done" && item.has_result,
    );
    if (saved) {
      setPending(seed);
      setActiveSeed(seed);
      setActiveResult(saved.result);
      setActiveJob({
        id: saved.job_id,
        user_id: saved.user_id,
        title: saved.title,
        status: saved.status,
        stage: saved.stage,
        progress: saved.progress,
        result: saved.result,
        error: saved.error,
      });
      persistActiveClassroom({ jobId: saved.job_id, seed });
      setPanelMode("hidden");
      clientNavigate("/classroom");
      return;
    }
    startClassroom(seed);
  };

  const steps = path?.steps || [];
  const flatSteps = flattenPathSteps(steps);
  const overallProgress = pathProgressPercent(steps);
  const readyLibraries = replanLibraries.filter(
    (l) => l.status === "ready" && (l.chunk_count ?? 0) > 0,
  );
  const submitReplan = () => {
    const trimmedGoal = replanGoalInput.trim();
    if (replanGenSource === "library" && !replanLibraryId) {
      message.warning("请选择课程资料库，或改用全网检索模式");
      return;
    }
    if (!trimmedGoal && replanContext && !replanContext.can_start) {
      message.warning(replanContext.block_reason || "缺少规划依据，请先补全学习目标或资料库");
      return;
    }
    const libId = replanGenSource === "library" ? replanLibraryId : null;
    setReplanLibraryId(libId);
    setReplanModalOpen(false);
    setPath(null);
    setExpanded("");
    void startPathReplan({
      libraryId: libId,
      conversationId: loadActiveChatConversation(),
      learningGoal: trimmedGoal || null,
      planningMode: replanPlanningMode,
      planningRequirement: replanPlanningRequirement.trim() || null,
    });
  };
  if (isReplanRunning) {
    return (
      <div style={{ padding: 64, maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <Spin size="large" />
        <p style={{ marginTop: 20, fontSize: 15, fontWeight: 600 }}>
          学习路径重新规划中（{replanProgress}%）
        </p>
        <p style={{ marginTop: 8, color: "var(--lp-text-secondary, #64748b)" }}>
          {replanStage || "任务已在服务端后台执行，可切换其他页面或点击浮窗查看进度"}
        </p>
        <Button style={{ marginTop: 16 }} onClick={() => clientNavigate("/chat")}>
          先去智能对话
        </Button>
      </div>
    );
  }

  if (loading && !path?.steps?.length) {
    return (
      <div style={{ padding: 80, textAlign: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!path?.steps?.length) {
    return (
      <>
        <Modal
          title="生成学习路径"
          open={replanModalOpen}
          okText="开始生成"
          cancelText="取消"
          confirmLoading={isReplanRunning}
          onCancel={() => setReplanModalOpen(false)}
          onOk={submitReplan}
        >
          <Input.TextArea
            rows={2}
            placeholder="学习目标，例如：系统学习机器学习入门"
            value={replanGoalInput}
            onChange={(e) => setReplanGoalInput(e.target.value)}
            onBlur={() => void refreshReplanContext()}
            style={{ marginBottom: 12 }}
          />
          <Radio.Group
            value={replanPlanningMode}
            onChange={(e) => setReplanPlanningMode(e.target.value)}
            style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}
          >
            <Radio.Button value="auto">自动划分</Radio.Button>
            <Radio.Button value="chapter">按章节</Radio.Button>
            <Radio.Button value="time">按时间</Radio.Button>
            <Radio.Button value="detailed">详细子路径</Radio.Button>
          </Radio.Group>
          <Input
            placeholder="划分要求（可空）：例如 4 周复习、每章先概念后练习"
            value={replanPlanningRequirement}
            onChange={(e) => setReplanPlanningRequirement(e.target.value)}
            onBlur={() => void refreshReplanContext()}
            style={{ marginBottom: 12 }}
          />
          <Radio.Group
            value={replanGenSource}
            onChange={(e) => {
              const next = e.target.value as "web" | "library";
              setReplanGenSource(next);
              void refreshReplanContext(undefined, next === "library" ? replanLibraryId : null);
            }}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            <Radio value="web">无资料库 · 全网检索整理后生成</Radio>
            <Radio value="library" disabled={!readyLibraries.length && !replanLibrariesLoading}>
              依据课程资料库生成
            </Radio>
          </Radio.Group>
          {replanGenSource === "library" && (
            <Select
              style={{ width: "100%", marginTop: 12 }}
              placeholder={replanLibrariesLoading ? "加载资料库…" : "选择资料库"}
              loading={replanLibrariesLoading}
              value={replanLibraryId ?? undefined}
              onChange={(v) => {
                setReplanLibraryIdState(v);
                void refreshReplanContext(undefined, v);
              }}
              options={readyLibraries.map((l) => ({
                value: l.id,
                label: `${l.name}（${l.chunk_count ?? 0} 片段）`,
              }))}
            />
          )}
        </Modal>
        <div style={{ padding: 48, maxWidth: 520, margin: "0 auto" }}>
          <Empty description="尚未生成学习路径">
            <Button type="primary" loading={isReplanRunning} onClick={openReplanModal}>
              生成学习路径
            </Button>
            <Button style={{ marginLeft: 8 }} onClick={() => clientNavigate("/chat")}>
              去对话
            </Button>
          </Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <Modal
        title="重新规划学习路径"
        open={replanModalOpen}
        okText="开始重新规划"
        cancelText="取消"
        confirmLoading={isReplanRunning}
        onCancel={() => setReplanModalOpen(false)}
        onOk={submitReplan}
      >
        <p style={{ marginBottom: 12, color: "var(--lp-text-secondary, #666)" }}>
          重新规划会保留资源库里的旧资源，只为新路径重新匹配当前资源；缺少材料时再生成配套资源。
        </p>
        <Input.TextArea
          rows={2}
          placeholder="学习目标（删光聊天后建议填写，如：系统学习机器学习入门）"
          value={replanGoalInput}
          onChange={(e) => {
            setReplanGoalInput(e.target.value);
          }}
          onBlur={() => void refreshReplanContext()}
          style={{ marginBottom: 12 }}
        />
        <Radio.Group
          value={replanPlanningMode}
          onChange={(e) => setReplanPlanningMode(e.target.value)}
          style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}
        >
          <Radio.Button value="auto">自动划分</Radio.Button>
          <Radio.Button value="chapter">按章节</Radio.Button>
          <Radio.Button value="time">按时间</Radio.Button>
          <Radio.Button value="detailed">详细子路径</Radio.Button>
        </Radio.Group>
        <Input
          placeholder="划分要求（可空）：例如 4 周复习、每章先概念后练习"
          value={replanPlanningRequirement}
          onChange={(e) => setReplanPlanningRequirement(e.target.value)}
          onBlur={() => void refreshReplanContext()}
          style={{ marginBottom: 12 }}
        />
        <Radio.Group
          value={replanGenSource}
          onChange={(e) => {
            const next = e.target.value as "web" | "library";
            setReplanGenSource(next);
            const libId = next === "library" ? replanLibraryId : null;
            void refreshReplanContext(undefined, libId);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <Radio value="web">无资料库 · 全网检索整理后生成</Radio>
          <Radio value="library" disabled={!readyLibraries.length && !replanLibrariesLoading}>
            依据课程资料库生成
          </Radio>
        </Radio.Group>
        {replanGenSource === "library" && (
          <Select
            style={{ width: "100%", marginTop: 12 }}
            placeholder={replanLibrariesLoading ? "加载资料库…" : "选择资料库"}
            loading={replanLibrariesLoading}
            value={replanLibraryId ?? undefined}
            onChange={(v) => {
              setReplanLibraryIdState(v);
              void refreshReplanContext(undefined, v);
            }}
            options={readyLibraries.map((l) => ({
              value: l.id,
              label: `${l.name}（${l.chunk_count ?? 0} 片段）`,
            }))}
          />
        )}
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--lp-surface-muted, rgba(148,163,184,0.08))",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>本次规划依据</div>
          {replanContextLoading ? (
            <span style={{ color: "var(--lp-text-secondary, #64748b)" }}>正在分析依据…</span>
          ) : replanContext ? (
            <>
              <div>
                学习目标：
                {replanContext.learning_goal || "未识别"}
                {replanContext.goal_source === "user_input"
                  ? "（你填写）"
                  : replanContext.goal_source === "profile"
                    ? "（画像）"
                    : replanContext.goal_source === "conversation_topics"
                      ? "（当前对话）"
                      : ""}
              </div>
              <div>聊天依据：{replanContext.chat_basis}</div>
              <div>
                保留收藏：{replanContext.starred_count} 项
                {replanContext.starred_titles.length
                  ? `（${replanContext.starred_titles.slice(0, 2).join("、")}）`
                  : ""}
              </div>
              <div>
                行为依据：浏览 {replanContext.resource_view_count} 次
                {replanContext.quiz_summary ? ` · ${replanContext.quiz_summary}` : ""}
              </div>
              {replanContext.library_name ? <div>资料库：{replanContext.library_name}</div> : null}
              <div>
                划分方式：
                {{
                  auto: "自动划分",
                  chapter: "按章节",
                  time: "按时间",
                  detailed: "详细子路径",
                }[replanPlanningMode]}
                {replanPlanningRequirement.trim() ? ` · ${replanPlanningRequirement.trim()}` : ""}
              </div>
              {!replanContext.can_start ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 8 }}
                  message={replanContext.block_reason}
                />
              ) : null}
            </>
          ) : (
            <span style={{ color: "var(--lp-text-secondary, #64748b)" }}>暂时无法加载规划依据</span>
          )}
        </div>
      </Modal>
      <ClassroomManageDrawer
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        onLibraryChange={loadClassroomLibrary}
      />
      <div>
      <PageHeader
        title="我的学习路径"
        subtitle={`${steps.length} 个主阶段 · ${flatSteps.length} 个学习节点 · ${courseLabel}`}
        icon={<ApartmentOutlined />}
        extra={
          <Space wrap>
            <Button icon={<VideoCameraOutlined />} onClick={() => setManageOpen(true)}>
              管理课堂
            </Button>
            <Button icon={<FireOutlined />} type="primary" loading={isReplanRunning} onClick={openReplanModal}>
              重新规划
            </Button>
          </Space>
        }
      />
      <div className="lp-page-body lp-path-page">
        <PathDailyMinimumCard
          path={path}
          resources={cachedResources}
          userId={userId}
          onFocusStep={(stepKey) => {
            setExpanded(stepKey);
            window.setTimeout(() => {
              document.getElementById(`path-step-${stepKey}`)?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }, 80);
          }}
        />
        <Card className="lp-path-progress-card" style={{ marginBottom: 20 }}>
          <div className="lp-path-progress-head">
            <div className="lp-path-progress-copy">
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
                完成当前阶段后，可继续进入下一阶段。
              </Text>
            </div>
            <div className="lp-path-progress-badge">
              <TrophyOutlined style={{ fontSize: 32, color: "#faad14" }} />
              <div className="lp-muted-text" style={{ fontSize: 12, marginTop: 4 }}>
                个性化路径
              </div>
            </div>
          </div>
          <div className="lp-path-progress-stages">
            {steps.map((s) => {
              const cfg = STATUS_CONFIG[mapStatus(s.status)];
              return (
                <div key={getStepKey(s)} className="lp-path-progress-stage">
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
                        {s.title.length > 8 ? `${s.title.slice(0, 8)}...` : s.title}
                      </span>
                    }
                  />
                </div>
              );
            })}
          </div>
        </Card>

        <div className="lp-path-step-list">
          {steps.map((step) => (
            <PathStepCard
              key={getStepKey(step)}
              userId={userId}
              step={step}
              resourceTitles={resourceTitles}
              expanded={expanded}
              markingKey={markingKey}
              classroomLibrary={classroomLibrary}
              onToggle={(key) => setExpanded((prev) => (prev === key ? "" : key))}
              onMarkDone={handleMarkDone}
              onStartClassroom={handleStartClassroom}
            />
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
