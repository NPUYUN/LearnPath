"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Typography,
  Modal,
  Space,
  Input,
  Spin,
  message,
  Radio,
  Divider,
} from "antd";
import DownloadOutlined from "@ant-design/icons/DownloadOutlined";
import dynamic from "next/dynamic";
import {
  getEvalStats,
  getPath,
  getPreferences,
  listResources,
  patchPreferences,
  recordResourceComplete,
  recordResourceView,
  streamGenerateResources,
  submitEval,
  type LearningResource,
} from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { ResourceJourneyView } from "@/components/ResourceJourneyView";
import {
  EXTENDED_RESOURCE_TYPES,
  RESOURCE_CONFIG,
  STANDARD_RESOURCE_TYPES,
  mapApiType,
} from "@/lib/resourceConfig";
import {
  filterGroupedResources,
  groupResourcesByStage,
  STAGE_STATUS_META,
} from "@/lib/resourceGrouping";
import { useAppStore } from "@/store/appStore";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import SearchOutlined from "@ant-design/icons/SearchOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import CompassOutlined from "@ant-design/icons/CompassOutlined";

const MarkdownPreview = dynamic(() => import("@/components/MarkdownPreview"), {
  loading: () => <Spin />,
  ssr: false,
});

const { Text } = Typography;

const CATEGORY_CHIPS = [
  { key: "all", label: "全部类型" },
  { key: "document", label: "讲解文档" },
  { key: "mindmap", label: "思维导图" },
  { key: "quiz", label: "练习题库" },
  { key: "video", label: "多模态讲解" },
  { key: "code", label: "代码案例" },
  { key: "reading", label: "拓展阅读" },
  { key: "ppt", label: "课件提纲" },
  { key: "design", label: "设计方案" },
  { key: "project", label: "实践项目" },
];

const GEN_STAGE_LABELS: Record<string, string> = {
  doc: "讲解文档",
  mindmap: "思维导图",
  quiz: "练习题库",
  reading: "拓展阅读",
  media: "多模态讲解",
  code: "代码案例",
  ppt: "课件提纲",
  design: "资源设计方案",
  project: "实践项目",
  reviewer: "质量复审",
};

function downloadMarkdown(r: LearningResource) {
  const body = `# ${r.title}\n\n> 主题：${r.topic || "—"}\n\n${r.content}`;
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${r.title.replace(/[\\/:*?"<>|]/g, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ResourcesContent() {
  const userId = useAppStore((s) => s.userId);
  const learningPath = useAppStore((s) => s.learningPath);
  const cachedResources = useAppStore((s) => s.resources);
  const setResources = useAppStore((s) => s.setResources);
  const setLearningPath = useAppStore((s) => s.setLearningPath);
  const setEvalStats = useAppStore((s) => s.setEvalStats);
  const pendingPreviewId = useAppStore((s) => s.pendingResourcePreviewId);
  const setPendingPreviewId = useAppStore((s) => s.setPendingResourcePreviewId);
  const [items, setItems] = useState<LearningResource[]>(cachedResources);
  const [loading, setLoading] = useState(cachedResources.length === 0);
  const [generating, setGenerating] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<LearningResource | null>(null);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [topic, setTopic] = useState("线性回归");
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [genStage, setGenStage] = useState("");

  const load = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const list = await listResources(userId);
      setItems(list);
      setResources(list);
    } catch {
      if (!background) setItems(cachedResources);
    } finally {
      setLoading(false);
    }
  };

  const openPreview = (r: LearningResource) => {
    setPreview(r);
    setQuizAnswers([]);
    void recordResourceView(userId, r.id).catch(() => {});
  };

  useEffect(() => {
    void getPreferences(userId)
      .then((p) => setStarredIds(p.starred_resource_ids || []))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (cachedResources.length > 0) {
      setItems(cachedResources);
      setLoading(false);
      return;
    }
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cachedResources.length]);

  useEffect(() => {
    if (!pendingPreviewId || !items.length) return;
    const r = items.find((x) => x.id === pendingPreviewId);
    if (r) {
      openPreview(r);
      setPendingPreviewId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPreviewId, items]);

  const toggleStar = async (id: string) => {
    const next = starredIds.includes(id)
      ? starredIds.filter((x) => x !== id)
      : [...starredIds, id];
    setStarredIds(next);
    try {
      await patchPreferences(userId, next);
      message.success(next.includes(id) ? "已收藏" : "已取消收藏");
    } catch {
      setStarredIds(starredIds);
      message.error("收藏同步失败");
    }
  };

  const grouped = useMemo(
    () => groupResourcesByStage(items, learningPath),
    [items, learningPath]
  );

  const filteredGrouped = useMemo(
    () => filterGroupedResources(grouped, { search, category: activeCategory }),
    [grouped, search, activeCategory]
  );

  const pathSteps = learningPath?.steps ?? [];
  const doneSteps = pathSteps.filter((s) => s.status === "done").length;
  const activeStep = pathSteps.find((s) => s.status === "in_progress");
  const visibleCount = filteredGrouped.stages.reduce((n, s) => n + s.resourceCount, 0);

  const runStreamGenerate = async (types: readonly string[], label: string) => {
    setGenerating(true);
    setGenStage("");
    const msgKey = "resource-gen";
    message.loading({ content: `正在生成${label}…`, key: msgKey, duration: 0 });
    try {
      const before = items.length;
      await streamGenerateResources(userId, topic, {
        onProgress: (stage) => {
          const text = GEN_STAGE_LABELS[stage] || stage;
          setGenStage(text);
          message.loading({ content: `生成中：${text}`, key: msgKey, duration: 0 });
        },
        onError: (err) => {
          throw new Error(err);
        },
      }, [...types]);
      const list = await listResources(userId);
      setItems(list);
      setResources(list);
      const created = Math.max(0, list.length - before);
      message.destroy(msgKey);
      if (created > 0) {
        message.success(`已新增 ${created} 项，资源库共 ${list.length} 项`);
      } else {
        message.success(`资源库已更新，共 ${list.length} 项`);
      }
    } catch (e: unknown) {
      message.destroy(msgKey);
      message.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
      setGenStage("");
    }
  };

  const handleGenerate = () => void runStreamGenerate(STANDARD_RESOURCE_TYPES, "标准资源");

  const handleGenerateFullSuite = () =>
    void runStreamGenerate(EXTENDED_RESOURCE_TYPES, "完整套件（含扩展类型）");

  return (
    <div>
      <PageHeader
        title="学习资源库"
        subtitle={
          pathSteps.length
            ? `${items.length} 项资源 · ${pathSteps.length} 个学习阶段 · 按阶段与类型浏览`
            : `${items.length} 项资源 · 按主题阶段与类型浏览`
        }
        icon={<BookOutlined />}
        extra={
          <Space wrap>
            <Input
              prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
              placeholder="搜索资源..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 200, borderRadius: 8 }}
              allowClear
            />
            <Input
              placeholder="生成主题"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              style={{ width: 140, borderRadius: 8 }}
            />
            <Button
              icon={<PlusOutlined />}
              type="primary"
              loading={generating}
              onClick={handleGenerate}
            >
              生成新资源
            </Button>
            <Button loading={generating} onClick={handleGenerateFullSuite}>
              完整套件
            </Button>
            {genStage && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {genStage}
              </Text>
            )}
          </Space>
        }
      />
      <div className="lp-page-body lp-resource-page">
        {pathSteps.length > 0 && (
          <div className="lp-resource-summary">
            <div className="lp-resource-summary-icon">
              <CompassOutlined />
            </div>
            <div className="lp-resource-summary-main">
              <Text strong className="lp-resource-summary-title">
                学习路径进度
              </Text>
              <Text type="secondary" className="lp-resource-summary-desc">
                {activeStep
                  ? `当前阶段：${activeStep.title}`
                  : doneSteps === pathSteps.length
                    ? "全部阶段已完成"
                    : "按路径阶段组织你的学习资源"}
              </Text>
              <div className="lp-resource-summary-track">
                {pathSteps.map((step) => {
                  const meta = STAGE_STATUS_META[
                    step.status === "done"
                      ? "done"
                      : step.status === "in_progress"
                        ? "in_progress"
                        : "pending"
                  ];
                  return (
                    <div
                      key={step.order}
                      className={`lp-resource-summary-step lp-resource-summary-step--${step.status}`}
                      style={{ "--step-color": meta.color } as React.CSSProperties}
                      title={step.title}
                    >
                      <span className="lp-resource-summary-step-num">{step.order}</span>
                      <span className="lp-resource-summary-step-label">{step.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="lp-resource-summary-stats">
              <span className="lp-resource-summary-stat">
                <strong>{doneSteps}</strong>/{pathSteps.length} 阶段
              </span>
              <span className="lp-resource-summary-stat">
                显示 <strong>{visibleCount}</strong> 项
              </span>
            </div>
          </div>
        )}

        <div className="lp-resource-filters">
          <span className="lp-resource-filters-label">资源类型</span>
          <div className="lp-resource-filter-chips">
            {CATEGORY_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`lp-resource-filter-chip${activeCategory === chip.key ? " lp-resource-filter-chip--active" : ""}`}
                onClick={() => setActiveCategory(chip.key)}
              >
                {chip.key !== "all" && (
                  <span
                    className="lp-resource-filter-chip-dot"
                    style={{
                      background:
                        RESOURCE_CONFIG[chip.key as keyof typeof RESOURCE_CONFIG]?.color,
                    }}
                  />
                )}
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="lp-resource-empty">
            <Spin />
          </div>
        ) : visibleCount === 0 ? (
          <div className="lp-resource-empty">
            {items.length === 0
              ? "暂无资源，点击「生成新资源」或由智能对话触发"
              : "没有匹配的资源，试试调整搜索或类型筛选"}
          </div>
        ) : (
          <ResourceJourneyView
            stages={filteredGrouped.stages}
            starredIds={starredIds}
            onStar={(id) => void toggleStar(id)}
            onPreview={openPreview}
            onDownload={downloadMarkdown}
          />
        )}

        <Modal
          open={!!preview}
          onCancel={() => setPreview(null)}
          footer={[
            <Button key="close" onClick={() => setPreview(null)}>
              关闭
            </Button>,
            <Button
              key="dl"
              icon={<DownloadOutlined />}
              type="primary"
              onClick={() => preview && downloadMarkdown(preview)}
            >
              下载
            </Button>,
          ]}
          title={
            preview && (
              <span>
                <span
                  style={{
                    color: RESOURCE_CONFIG[mapApiType(preview.type)].color,
                    marginRight: 8,
                  }}
                >
                  {RESOURCE_CONFIG[mapApiType(preview.type)].icon}
                </span>
                {preview.title}
              </span>
            )
          }
          width={720}
        >
          {preview && (
            <div
              className="md-content"
              style={{ maxHeight: "60vh", overflowY: "auto", padding: "0 4px" }}
            >
              {preview.type === "quiz" ? (
                <QuizPanel
                  content={preview.content}
                  answers={quizAnswers}
                  onAnswersChange={setQuizAnswers}
                  submitting={submittingQuiz}
                  onSubmit={async () => {
                    setSubmittingQuiz(true);
                    try {
                      const res = await submitEval(userId, preview.id, quizAnswers);
                      await recordResourceComplete(userId, preview.id).catch(() => {});
                      const [pathData, evalS] = await Promise.all([
                        getPath(userId),
                        getEvalStats(userId),
                      ]);
                      if (pathData) setLearningPath(pathData);
                      setEvalStats(evalS);
                      message.success(res.feedback);
                      setPreview(null);
                    } catch (e: unknown) {
                      message.error(e instanceof Error ? e.message : "提交失败");
                    } finally {
                      setSubmittingQuiz(false);
                    }
                  }}
                />
              ) : (
                <MarkdownPreview content={preview.content} />
              )}
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}

type QuizQuestion = {
  id: string;
  stem: string;
  options: string[];
  answer?: number;
};

function parseQuiz(content: string): QuizQuestion[] {
  const match = content.match(/\{[\s\S]*"questions"[\s\S]*\}/);
  if (!match) return [];
  try {
    const data = JSON.parse(match[0]) as { questions?: QuizQuestion[] };
    return data.questions || [];
  } catch {
    return [];
  }
}

function QuizPanel({
  content,
  answers,
  onAnswersChange,
  onSubmit,
  submitting,
}: {
  content: string;
  answers: number[];
  onAnswersChange: (a: number[]) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const questions = parseQuiz(content);
  if (!questions.length) {
    return <MarkdownPreview content={content} />;
  }
  return (
    <div>
      {questions.map((q, i) => (
        <div key={q.id || i} style={{ marginBottom: 16 }}>
          <Text strong>
            {i + 1}. {q.stem}
          </Text>
          <Radio.Group
            style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}
            value={answers[i]}
            onChange={(e) => {
              const next = [...answers];
              next[i] = e.target.value;
              onAnswersChange(next);
            }}
            options={q.options.map((opt, idx) => ({ label: opt, value: idx }))}
          />
        </div>
      ))}
      <Divider />
      <Button
        type="primary"
        loading={submitting}
        onClick={onSubmit}
        disabled={answers.length < questions.length}
      >
        提交测验并更新评估
      </Button>
    </div>
  );
}
