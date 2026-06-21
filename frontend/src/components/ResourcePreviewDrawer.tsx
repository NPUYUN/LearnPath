"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Button, Collapse, Descriptions, Drawer, Space, Spin, Tag, Typography } from "antd";
import ExpandOutlined from "@ant-design/icons/ExpandOutlined";
import type { LearningResource } from "@/lib/api";
import { getResource, recordResourceView } from "@/lib/api";
import { RESOURCE_CONFIG, mapApiType } from "@/lib/resourceConfig";
import { generationSourceMeta } from "@/lib/resourceSource";
import { formatResourceContentForDisplay } from "@/lib/resourceContent";
import { isRegenerationArtifact } from "@/lib/resourceDisplay";
import { useAppStore } from "@/store/appStore";

const MarkdownPreview = dynamic(() => import("@/components/MarkdownPreview"), {
  loading: () => (
    <div style={{ padding: 24, textAlign: "center" }}>
      <Spin />
    </div>
  ),
  ssr: false,
});

const { Text, Title } = Typography;

type ResourcePreviewDrawerProps = {
  resource: LearningResource | null;
  open: boolean;
  onClose: () => void;
  onOpenFull?: (resource: LearningResource) => void;
};

export default function ResourcePreviewDrawer({
  resource,
  open,
  onClose,
  onOpenFull,
}: ResourcePreviewDrawerProps) {
  const userId = useAppStore((s) => s.userId);
  const [display, setDisplay] = useState<LearningResource | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!open || !resource) {
      setDisplay(null);
      setRefreshing(false);
      return;
    }

    const cached = useAppStore.getState().resources.find((r) => r.id === resource.id);
    const initial = cached?.content?.trim() ? cached : resource;
    setDisplay(initial);
    setRefreshing(false);

    void recordResourceView(userId, resource.id).catch(() => {});

    if ((initial.content?.length ?? 0) >= 80) return;

    let cancelled = false;
    setRefreshing(true);
    void (async () => {
      try {
        const fresh = await getResource(userId, resource.id);
        if (!cancelled && fresh) setDisplay(fresh);
      } catch {
        /* 保留列表中的缓存内容 */
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, resource, userId]);

  const row = display ?? resource;
  if (!row) return null;

  const uiType = mapApiType(row.type);
  const cfg = RESOURCE_CONFIG[uiType];
  const sourceMeta = generationSourceMeta(row);
  const metadata = row.metadata;
  const difficultyLabel = {
    basic: "基础",
    intermediate: "进阶",
    advanced: "综合",
    exam: "应试",
  }[metadata?.difficulty || "basic"];
  const purposeLabel = {
    preview: "课前预习",
    explain: "课堂讲解",
    practice: "练习巩固",
    review: "复习总结",
    exam: "应试训练",
    classroom: "AI 课堂素材",
    project: "项目实践",
  }[metadata?.learning_purpose || "explain"];

  return (
    <Drawer
      title={null}
      placement="right"
      width="min(720px, 92vw)"
      open={open}
      onClose={onClose}
      destroyOnHidden
      className="lp-resource-preview-drawer"
      styles={{ body: { paddingTop: 8 } }}
    >
      <div className="lp-resource-preview-head">
        <div className="lp-resource-preview-hero">
          <span
            className="lp-resource-view-type-icon"
            style={{ color: cfg.color, background: `${cfg.color}18` }}
          >
            {cfg.icon}
          </span>
          <div className="lp-resource-preview-meta">
            <Title level={4} style={{ margin: 0 }}>
              {row.title}
            </Title>
            <Space size={6} wrap style={{ marginTop: 6 }}>
              <Tag color={cfg.color}>{cfg.label}</Tag>
              <Tag color={sourceMeta.color}>{sourceMeta.label}</Tag>
              {row.topic && !isRegenerationArtifact(row.topic) ? <Tag>{row.topic}</Tag> : null}
              {metadata ? <Tag>{purposeLabel}</Tag> : null}
              {metadata ? <Tag>难度：{difficultyLabel}</Tag> : null}
              {(metadata?.quality_tags || [])
                .filter((tag) => !isRegenerationArtifact(tag))
                .slice(0, 3)
                .map((tag) => (
                <Tag key={tag} color={tag === "可进课堂" ? "cyan" : undefined}>{tag}</Tag>
              ))}
              {row.status === "draft" ? <Tag color="gold">待完善</Tag> : null}
            </Space>
          </div>
        </div>
        <Space>
          {onOpenFull ? (
            <Button
              type="primary"
              icon={<ExpandOutlined />}
              onClick={() => onOpenFull(row)}
            >
              全屏查看
            </Button>
          ) : null}
          <Button onClick={onClose}>关闭</Button>
        </Space>
      </div>

      {metadata ? (
        <Collapse
          ghost
          className="lp-resource-metadata-collapse"
          items={[
            {
              key: "metadata",
              label: "学习资产信息",
              children: (
                <Descriptions size="small" column={1} colon={false}>
                  <Descriptions.Item label="资源摘要">
                    {metadata.summary || "旧资源暂无摘要"}
                  </Descriptions.Item>
                  <Descriptions.Item label="知识点">
                    {metadata.knowledge_points?.join("、") || "当前主题"}
                  </Descriptions.Item>
                  <Descriptions.Item label="适用阶段">{metadata.recommended_stage}</Descriptions.Item>
                  <Descriptions.Item label="来源资料库">
                    {row.library_name || metadata.source_library_id || "通用学习资源"}
                  </Descriptions.Item>
                  <Descriptions.Item label="对应路径步骤">
                    {metadata.path_step_key || "未挂载"}
                  </Descriptions.Item>
                  <Descriptions.Item label="课堂可用">
                    {metadata.classroom_ready ? "是，可直接用于 AI 课堂" : "否或尚未质检"}
                  </Descriptions.Item>
                  <Descriptions.Item label="预期结果">{metadata.expected_outcome}</Descriptions.Item>
                  <Descriptions.Item label="前置知识">
                    {metadata.prerequisites?.join("、") || "无特别要求"}
                  </Descriptions.Item>
                  <Descriptions.Item label="学习前提示">
                    {metadata.learning_before_tip || "先回忆已有知识并标记疑问"}
                  </Descriptions.Item>
                  <Descriptions.Item label="学习后检查">
                    {metadata.learning_after_check || "完成正文中的自检或实践任务"}
                  </Descriptions.Item>
                  <Descriptions.Item label="适用场景">
                    {metadata.suitable_scenarios?.join(" / ") || metadata.recommended_stage}
                  </Descriptions.Item>
                  <Descriptions.Item label="复用场景">
                    {metadata.used_for?.join(" / ") || "学习路径"}
                  </Descriptions.Item>
                  <Descriptions.Item label="预计用时">{metadata.estimated_minutes} 分钟</Descriptions.Item>
                  <Descriptions.Item label="质量评价">
                    {metadata.quality_score ? `${metadata.quality_score}/10 · ` : ""}
                    {metadata.quality_reason || "旧资源，尚未重新质检"}
                  </Descriptions.Item>
                  {metadata.next_step ? (
                    <Descriptions.Item label="下一步">{metadata.next_step}</Descriptions.Item>
                  ) : null}
                  {row.status === "draft" && metadata.quality_issues?.length ? (
                    <Descriptions.Item label="待完善项">
                      {metadata.quality_issues.slice(0, 4).join("；")}
                    </Descriptions.Item>
                  ) : null}
                </Descriptions>
              ),
            },
          ]}
        />
      ) : null}

      {refreshing && !row.content?.trim() ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      ) : row.content?.trim() ? (
        <article className="lp-resource-preview-body md-content">
          <MarkdownPreview
            content={formatResourceContentForDisplay(
              row.type,
              row.content,
              metadata?.quiz_invalid_questions || [],
            )}
          />
        </article>
      ) : (
        <Text type="secondary">暂无正文内容，请稍后重试或重新生成该资源。</Text>
      )}
    </Drawer>
  );
}
