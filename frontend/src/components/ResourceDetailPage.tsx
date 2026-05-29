"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Button,
  Divider,
  Empty,
  Radio,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import DownloadOutlined from "@ant-design/icons/DownloadOutlined";
import {
  getEvalStats,
  getPath,
  getResource,
  recordResourceComplete,
  recordResourceView,
  submitEval,
  type LearningResource,
} from "@/lib/api";
import { RESOURCE_CONFIG, mapApiType } from "@/lib/resourceConfig";
import { generationSourceMeta } from "@/lib/resourceSource";
import { useAppStore } from "@/store/appStore";

const MarkdownPreview = dynamic(() => import("@/components/MarkdownPreview"), {
  loading: () => <Spin />,
  ssr: false,
});

const { Text, Title, Paragraph } = Typography;

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

type ResourceDetailPageProps = {
  resourceId: string;
};

export default function ResourceDetailPage({ resourceId }: ResourceDetailPageProps) {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const setLearningPath = useAppStore((s) => s.setLearningPath);
  const setEvalStats = useAppStore((s) => s.setEvalStats);
  const [resource, setResource] = useState<LearningResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getResource(userId, resourceId);
      if (!data) {
        message.error("资源不存在");
        router.push("/resources");
        return;
      }
      setResource(data);
      void recordResourceView(userId, resourceId).catch(() => {});
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "加载失败");
      setResource(null);
    } finally {
      setLoading(false);
    }
  }, [userId, resourceId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBack = () => {
    router.push("/resources");
  };

  if (loading) {
    return (
      <div className="lp-resource-view-page lp-resource-view-page--loading">
        <Spin tip="加载资源…" />
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
              {resource.topic && <Tag>{resource.topic}</Tag>}
            </Space>
            {resource.topic && (
              <Paragraph type="secondary" className="lp-resource-view-sub">
                学习主题：{resource.topic}
              </Paragraph>
            )}
          </div>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => downloadMarkdown(resource)}
          >
            下载 Markdown
          </Button>
        </div>
      </div>

      <article className="lp-resource-view-body md-content">
        {resource.type === "quiz" ? (
          <QuizPanel
            content={resource.content}
            answers={quizAnswers}
            onAnswersChange={setQuizAnswers}
            submitting={submittingQuiz}
            onSubmit={async () => {
              setSubmittingQuiz(true);
              try {
                const res = await submitEval(userId, resource.id, quizAnswers);
                await recordResourceComplete(userId, resource.id).catch(() => {});
                const [pathData, evalS] = await Promise.all([
                  getPath(userId),
                  getEvalStats(userId),
                ]);
                if (pathData) setLearningPath(pathData);
                setEvalStats(evalS);
                message.success(res.feedback);
              } catch (e: unknown) {
                message.error(e instanceof Error ? e.message : "提交失败");
              } finally {
                setSubmittingQuiz(false);
              }
            }}
          />
        ) : (
          <MarkdownPreview content={resource.content} />
        )}
      </article>
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
