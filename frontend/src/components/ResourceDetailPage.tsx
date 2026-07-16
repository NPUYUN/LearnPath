"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Button,
  Descriptions,
  Empty,
  Progress,
  Segmented,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import DownloadOutlined from "@ant-design/icons/DownloadOutlined";
import {
  generateReviewCard,
  getResource,
  recordResourceView,
  type LearningResource,
} from "@/lib/api";
import { RESOURCE_CONFIG, mapApiType } from "@/lib/resourceConfig";
import { generationSourceMeta } from "@/lib/resourceSource";
import { useAppStore } from "@/store/appStore";
import { downloadResourceMarkdown } from "@/lib/downloadResource";
import { formatResourceContentForDisplay } from "@/lib/resourceContent";
import { isRegenerationArtifact } from "@/lib/resourceDisplay";
import { resolveResourceLocally } from "@/lib/resourceViewCache";

const MarkdownPreview = dynamic(() => import("@/components/MarkdownPreview"), {
  loading: () => <Spin />,
  ssr: false,
});

const MediaResourceView = dynamic(() => import("@/components/MediaResourceView"), {
  loading: () => <Spin />,
  ssr: false,
});

const { Title, Paragraph } = Typography;

type ResourceViewMode = "explain" | "review" | "quiz" | "mistakes" | "train" | "cards";
type TrainingMark = "mastered" | "fuzzy";
type ResourceTrainingItem = {
  id: string;
  title: string;
  prompt: string;
  answer: string;
  hint: string;
};
type MemoryCardItem = {
  id: string;
  title: string;
  memoryAnchor: string;
  contrast: string;
  quickCheck: string;
};

function uniqueTexts(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function buildReviewTopics(resource: LearningResource) {
  const metadata = resource.metadata;
  const candidates = uniqueTexts([
    resource.topic || "",
    resource.title || "",
    ...((metadata?.knowledge_points || []).map((item) => String(item)) || []),
  ]);
  const fallbackBase = resource.topic || resource.title || "当前主题";
  while (candidates.length < 5) {
    candidates.push(`${fallbackBase} · 复习点 ${candidates.length + 1}`);
  }
  return candidates.slice(0, 5);
}

function buildTrainingItems(resource: LearningResource): ResourceTrainingItem[] {
  const metadata = resource.metadata;
  const points = uniqueTexts((metadata?.knowledge_points || []).map((item) => String(item)));
  const baseItems = (points.length ? points : buildReviewTopics(resource)).slice(0, 6);
  const summary = metadata?.summary || resource.topic || resource.title;
  return baseItems.map((point, index) => ({
    id: `${resource.id}-train-${index}`,
    title: point,
    prompt: `请闭卷回答：「${point}」的核心定义、适用场景，或它和相近概念的区别。`,
    answer:
      index === 0
        ? `优先复述主线：${summary}。如果能说出“它是什么、解决什么问题、什么时候用”，这一点就算过关。`
        : `把「${point}」放回资源主线里解释，并补一个你自己的例子。不会时先回到讲解模式定位关键词。`,
    hint: `提示：先想资源里的关键词，再补一个最小例子。`,
  }));
}

function buildMemoryCards(resource: LearningResource): MemoryCardItem[] {
  const metadata = resource.metadata;
  const points = uniqueTexts((metadata?.knowledge_points || []).map((item) => String(item)));
  const summary = metadata?.summary || resource.topic || resource.title;
  const baseItems = (points.length ? points : buildReviewTopics(resource)).slice(0, 6);
  return baseItems.map((point, index) => ({
    id: `${resource.id}-card-${index}`,
    title: point,
    memoryAnchor: index === 0 ? summary : `${point} = 主线中的一个关键节点`,
    contrast: `别只背名词，试着说清「${point}」和相邻概念的边界。`,
    quickCheck: `现在不用看正文，20 秒内解释「${point}」并举 1 个例子。`,
  }));
}

function buildResourceModeContent(resource: LearningResource, mode: ResourceViewMode) {
  const metadata = resource.metadata;
  const points = (metadata?.knowledge_points || []).map((item) => String(item));
  const summary = metadata?.summary || resource.topic || resource.title;
  const checks = metadata?.learning_after_check || "完成正文中的自检或实践任务";
  const mistakes = metadata?.quiz_invalid_questions || [];

  if (mode === "review") {
    return `# ${resource.title} · 速记\n\n## 一句话速记\n- ${summary}\n\n## 必记知识点\n${(points.length ? points : [resource.topic || resource.title]).map((item) => `- ${item}`).join("\n")}\n\n## 学完后自检\n- ${checks}\n`;
  }
  if (mode === "quiz") {
    return `# ${resource.title} · 测验模式\n\n## 快速检查题\n${(points.length ? points : [resource.topic || resource.title]).slice(0, 5).map((item, index) => `### 第 ${index + 1} 题\nQ: 请用一句话解释「${item}」\n\nA: 先尝试闭卷回答，再回到正文核对。`).join("\n\n")}\n`;
  }
  if (mode === "mistakes") {
    return `# ${resource.title} · 错题与易错点\n\n## 常见易错点\n${(mistakes.length ? mistakes.map((item) => String(item)) : points.length ? points.map((item) => `${item} 容易混淆适用条件或使用场景`) : ["当前资源暂无结构化错题数据，建议结合掌握度反馈补充。"]).slice(0, 6).map((item) => `- ${item}`).join("\n")}\n\n## 修正动作\n- 回到讲解模式，重新看本页主线\n- 用自己的话复述概念边界\n- 完成 1 次随手小测或生成复习卡\n`;
  }
  return formatResourceContentForDisplay(
    resource.type,
    resource.content,
    metadata?.quiz_invalid_questions || [],
  );
}

type ResourceDetailPageProps = {
  resourceId: string;
};

export default function ResourceDetailPage({ resourceId }: ResourceDetailPageProps) {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const [resource, setResource] = useState<LearningResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ResourceViewMode>("explain");
  const [reviewGenerating, setReviewGenerating] = useState(false);
  const [trainingIndex, setTrainingIndex] = useState(0);
  const [trainingRevealed, setTrainingRevealed] = useState(false);
  const [trainingMarks, setTrainingMarks] = useState<Record<string, TrainingMark>>({});

  const load = useCallback(async () => {
    const cached = resolveResourceLocally(userId, resourceId);
    if (cached?.content?.trim()) {
      setResource(cached);
      setLoading(false);
      void recordResourceView(userId, resourceId).catch(() => {});
    } else if (cached) {
      setResource(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const data = await getResource(userId, resourceId);
      if (!data) {
        if (!cached) {
          message.error("资源不存在");
          router.push("/resources");
        }
        return;
      }
      setResource(data);
      void recordResourceView(userId, resourceId).catch(() => {});
    } catch (e: unknown) {
      if (!cached) {
        message.error(e instanceof Error ? e.message : "加载失败");
        setResource(null);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, resourceId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTrainingIndex(0);
    setTrainingRevealed(false);
    setTrainingMarks({});
  }, [resourceId]);

  const handleBack = () => {
    router.push("/resources");
  };

  if (loading) {
    return (
      <div className="lp-resource-view-page lp-resource-view-page--loading">
        <Spin />
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="lp-resource-view-page">
        <Empty description="无法加载资源" />
        <Button type="link" onClick={handleBack}>
          返回学习资源
        </Button>
      </div>
    );
  }

  const uiType = mapApiType(resource.type);
  const cfg = RESOURCE_CONFIG[uiType];
  const sourceMeta = generationSourceMeta(resource);
  const metadata = resource.metadata;
  const content = buildResourceModeContent(resource, viewMode);
  const reviewTopics = buildReviewTopics(resource);
  const trainingItems = buildTrainingItems(resource);
  const currentTrainingItem = trainingItems[trainingIndex] || null;
  const memoryCards = buildMemoryCards(resource);
  const trainingDoneCount = Object.keys(trainingMarks).length;
  const trainingMasteredCount = Object.values(trainingMarks).filter((item) => item === "mastered").length;
  const trainingProgress = trainingItems.length
    ? Math.round((trainingDoneCount / trainingItems.length) * 100)
    : 0;

  const markTrainingItem = (mark: TrainingMark) => {
    if (!currentTrainingItem) return;
    setTrainingMarks((prev) => ({
      ...prev,
      [currentTrainingItem.id]: mark,
    }));
    setTrainingRevealed(false);
    setTrainingIndex((prev) => Math.min(prev + 1, trainingItems.length));
  };

  return (
    <div className="lp-resource-view-page">
      <div className="lp-resource-view-head">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          className="lp-resource-view-back"
          onClick={handleBack}
        >
          返回学习资源
        </Button>
        <div className="lp-resource-view-hero">
          <span
            className="lp-resource-view-type-icon"
            style={{ color: cfg.color, background: `${cfg.color}18` }}
          >
            {cfg.icon}
          </span>
          <div className="lp-resource-view-meta">
            <Title level={3} className="lp-resource-view-title">
              {resource.title}
            </Title>
            <Space size={6} wrap>
              <Tag color={cfg.color}>{cfg.label}</Tag>
              <Tag color={sourceMeta.color}>{sourceMeta.label}</Tag>
              {resource.topic && !isRegenerationArtifact(resource.topic) && <Tag>{resource.topic}</Tag>}
              {(metadata?.quality_tags || [])
                .filter((tag) => !isRegenerationArtifact(tag))
                .slice(0, 3)
                .map((tag) => (
                <Tag key={tag} color={tag === "可进课堂" ? "cyan" : undefined}>{tag}</Tag>
              ))}
              {resource.status === "draft" && <Tag color="gold">待完善</Tag>}
            </Space>
            {resource.topic && !isRegenerationArtifact(resource.topic) && (
              <Paragraph type="secondary" className="lp-resource-view-sub">
                学习主题：{resource.topic}
              </Paragraph>
            )}
          </div>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => {
              void (async () => {
                const hide = message.loading("正在准备另存为…", 0);
                const result = await downloadResourceMarkdown(userId, resource);
                hide();
                if (result.cancelled) return;
                if (result.ok) {
                  message.success(`「${resource.title}」${result.saveHint || "已保存到所选位置"}`);
                } else message.warning(result.error || "另存为失败");
              })();
            }}
          >
            另存为 Markdown
          </Button>
          <Button
            loading={reviewGenerating}
            onClick={() => {
              void (async () => {
                setReviewGenerating(true);
                try {
                  // 保留现有复习卡能力，基于当前资源的知识点批量生成 5 张卡片。
                  for (const topic of reviewTopics) {
                    await generateReviewCard(userId, topic);
                  }
                  message.success("已根据当前资源生成 5 张复习卡");
                } catch (e: unknown) {
                  message.error(e instanceof Error ? e.message : "生成复习卡失败");
                } finally {
                  setReviewGenerating(false);
                }
              })();
            }}
          >
            生成 5 张复习卡
          </Button>
        </div>
      </div>

      {metadata ? (
        <section className="lp-resource-quality-panel" aria-label="学习资产信息">
          {metadata.summary ? (
            <Paragraph className="lp-resource-quality-summary">{metadata.summary}</Paragraph>
          ) : null}
          <Descriptions size="small" column={{ xs: 1, sm: 2 }} colon={false}>
            <Descriptions.Item label="预期结果">
              {metadata.expected_outcome || "完成本资源对应的理解与应用任务"}
            </Descriptions.Item>
            <Descriptions.Item label="适用场景">
              {metadata.suitable_scenarios?.join(" / ") || metadata.recommended_stage}
            </Descriptions.Item>
            <Descriptions.Item label="来源资料库">
              {resource.library_name || metadata.source_library_id || "通用学习资源"}
            </Descriptions.Item>
            <Descriptions.Item label="对应路径步骤">
              {metadata.path_step_key || "未挂载"}
            </Descriptions.Item>
            <Descriptions.Item label="课堂可用">
              {metadata.classroom_ready ? "是，可直接用于 AI 课堂" : "否或尚未质检"}
            </Descriptions.Item>
            <Descriptions.Item label="学习前提示">
              {metadata.learning_before_tip || "先回忆已有知识并标记疑问"}
            </Descriptions.Item>
            <Descriptions.Item label="学习后检查">
              {metadata.learning_after_check || "完成正文中的自检或实践任务"}
            </Descriptions.Item>
            <Descriptions.Item label="质量评分">
              {metadata.quality_score ? `${metadata.quality_score}/10` : "旧资源，尚未重新质检"}
            </Descriptions.Item>
            <Descriptions.Item label="下一步">
              {metadata.next_step || "进入下一层难度资源继续练习"}
            </Descriptions.Item>
          </Descriptions>
        </section>
      ) : null}

      <section className="lp-resource-view-modes">
        <Segmented<ResourceViewMode>
          value={viewMode}
          onChange={(value) => setViewMode(value)}
          options={[
            { label: "讲解", value: "explain" },
            { label: "速记", value: "review" },
            { label: "测验", value: "quiz" },
            { label: "错题", value: "mistakes" },
            { label: "训练", value: "train" },
            { label: "卡片", value: "cards" },
          ]}
        />
      </section>

      {viewMode === "train" ? (
        <section className="lp-resource-training-panel">
          <div className="lp-resource-training-head">
            <div>
              <Title level={5} style={{ margin: 0 }}>
                交互训练
              </Title>
              <Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
                保留原详情页阅读流，只新增一个自测训练层，帮助你把“看懂”推进到“能说出来”。
              </Paragraph>
            </div>
            <div className="lp-resource-training-stats">
              <span>已完成 {trainingDoneCount}/{trainingItems.length}</span>
              <span>记住 {trainingMasteredCount} 个</span>
            </div>
          </div>
          <Progress percent={trainingProgress} showInfo={false} strokeColor="#1677ff" />
          {currentTrainingItem ? (
            <div className="lp-resource-training-card">
              <div className="lp-resource-training-card-head">
                <Tag color="blue">
                  训练 {Math.min(trainingIndex + 1, trainingItems.length)}/{trainingItems.length}
                </Tag>
                <Tag>{currentTrainingItem.title}</Tag>
              </div>
              <Title level={4} className="lp-resource-training-title">
                {currentTrainingItem.prompt}
              </Title>
              <Paragraph className="lp-resource-training-hint">
                {currentTrainingItem.hint}
              </Paragraph>
              {trainingRevealed ? (
                <div className="lp-resource-training-answer">
                  <strong>参考回答</strong>
                  <p>{currentTrainingItem.answer}</p>
                </div>
              ) : (
                <div className="lp-resource-training-answer lp-resource-training-answer--placeholder">
                  先自己回答，再展开参考答案。
                </div>
              )}
              <div className="lp-resource-training-actions">
                <Button onClick={() => setTrainingRevealed((value) => !value)}>
                  {trainingRevealed ? "收起参考答案" : "查看参考答案"}
                </Button>
                <Button disabled={!trainingRevealed} onClick={() => markTrainingItem("fuzzy")}>
                  还模糊
                </Button>
                <Button type="primary" disabled={!trainingRevealed} onClick={() => markTrainingItem("mastered")}>
                  记住了，下一题
                </Button>
              </div>
            </div>
          ) : (
            <div className="lp-resource-training-complete">
              <Title level={4}>本轮训练已完成</Title>
              <Paragraph type="secondary">
                共完成 {trainingDoneCount} 个训练点，其中 {trainingMasteredCount} 个已标记为“记住了”。
              </Paragraph>
              <Space>
                <Button
                  onClick={() => {
                    setTrainingIndex(0);
                    setTrainingRevealed(false);
                    setTrainingMarks({});
                  }}
                >
                  再练一轮
                </Button>
                <Button type="primary" onClick={() => setViewMode("cards")}>
                  去看图像化卡片
                </Button>
              </Space>
            </div>
          )}
        </section>
      ) : viewMode === "cards" ? (
        <section className="lp-memory-card-grid">
          {memoryCards.map((card, index) => (
            <article
              key={card.id}
              className={`lp-memory-card lp-memory-card--tone-${index % 4}`}
            >
              <span className="lp-memory-card-kicker">MEMORY CARD</span>
              <Title level={4} className="lp-memory-card-title">
                {card.title}
              </Title>
              <p className="lp-memory-card-anchor">{card.memoryAnchor}</p>
              <div className="lp-memory-card-divider" />
              <p className="lp-memory-card-copy">{card.contrast}</p>
              <div className="lp-memory-card-check">
                <strong>20 秒自检</strong>
                <span>{card.quickCheck}</span>
              </div>
            </article>
          ))}
        </section>
      ) : (
      <article className="lp-resource-view-body md-content">
        {uiType === "video" && viewMode === "explain" ? (
          <MediaResourceView
            content={resource.content}
            title={resource.title}
            topic={resource.topic}
          />
        ) : (
          <MarkdownPreview content={content} />
        )}
      </article>
      )}
    </div>
  );
}
