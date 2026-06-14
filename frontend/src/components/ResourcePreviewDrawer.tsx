"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Button, Drawer, Space, Spin, Tag, Typography } from "antd";
import ExpandOutlined from "@ant-design/icons/ExpandOutlined";
import type { LearningResource } from "@/lib/api";
import { getResource, recordResourceView } from "@/lib/api";
import { RESOURCE_CONFIG, mapApiType } from "@/lib/resourceConfig";
import { generationSourceMeta } from "@/lib/resourceSource";
import { useAppStore } from "@/store/appStore";

const MarkdownPreview = dynamic(() => import("@/components/MarkdownPreview"), {
  loading: () => (
    <div style={{ padding: 24, textAlign: "center" }}>
      <Spin tip="渲染内容…" />
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

  return (
    <Drawer
      title={null}
      placement="right"
      width="min(720px, 92vw)"
      open={open}
      onClose={onClose}
      destroyOnClose
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
              {row.topic ? <Tag>{row.topic}</Tag> : null}
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

      {refreshing && !row.content?.trim() ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin tip="加载资源内容…" />
        </div>
      ) : row.content?.trim() ? (
        <article className="lp-resource-preview-body md-content">
          <MarkdownPreview content={row.content} />
        </article>
      ) : (
        <Text type="secondary">暂无正文内容，请稍后重试或重新生成该资源。</Text>
      )}
    </Drawer>
  );
}
