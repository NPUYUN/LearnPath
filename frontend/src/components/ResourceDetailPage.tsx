"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Button,
  Descriptions,
  Empty,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import DownloadOutlined from "@ant-design/icons/DownloadOutlined";
import {
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

type ResourceDetailPageProps = {
  resourceId: string;
};

export default function ResourceDetailPage({ resourceId }: ResourceDetailPageProps) {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const [resource, setResource] = useState<LearningResource | null>(null);
  const [loading, setLoading] = useState(true);

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

      <article className="lp-resource-view-body md-content">
        {uiType === "video" ? (
          <MediaResourceView
            content={resource.content}
            title={resource.title}
            topic={resource.topic}
          />
        ) : (
          <MarkdownPreview
            content={formatResourceContentForDisplay(
              resource.type,
              resource.content,
              metadata?.quiz_invalid_questions || [],
            )}
          />
        )}
      </article>
    </div>
  );
}
