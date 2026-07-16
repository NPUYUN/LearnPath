"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AppstoreOutlined,
  BookOutlined,
  BulbOutlined,
  CodeOutlined,
  ReadOutlined,
} from "@ant-design/icons";
import { Button, Empty, Input, Modal, Spin, Tag, Typography } from "antd";
import type { ResourceTemplateInfo } from "@/lib/api";

const { Paragraph, Text } = Typography;

const TEMPLATE_ICON_MAP: Record<string, ReactNode> = {
  bulb: <BulbOutlined />,
  code: <CodeOutlined />,
  book: <BookOutlined />,
  review: <ReadOutlined />,
};

type ResourceTemplateCenterProps = {
  loading: boolean;
  creatingId?: string | null;
  templates: ResourceTemplateInfo[];
  onCreate: (
    templateId: string,
    options?: { copyTitle?: string; topicOverride?: string },
  ) => Promise<void>;
};

export default function ResourceTemplateCenter({
  loading,
  creatingId,
  templates,
  onCreate,
}: ResourceTemplateCenterProps) {
  const [activeTemplate, setActiveTemplate] = useState<ResourceTemplateInfo | null>(null);
  const [copyTitle, setCopyTitle] = useState("");
  const [topicOverride, setTopicOverride] = useState("");

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => a.title.localeCompare(b.title, "zh-CN")),
    [templates],
  );

  useEffect(() => {
    if (!activeTemplate) return;
    setCopyTitle(activeTemplate.title);
    setTopicOverride(activeTemplate.topic);
  }, [activeTemplate]);

  const handleConfirmCreate = async () => {
    if (!activeTemplate) return;
    await onCreate(activeTemplate.id, {
      copyTitle,
      topicOverride,
    });
    setActiveTemplate(null);
  };

  return (
    <>
      <section className="lp-resource-template-center">
        <div className="lp-resource-recommend-head">
          <div className="lp-resource-recommend-title">
            <span className="lp-resource-recommend-bulb">
              <AppstoreOutlined />
            </span>
            <div>
              <Text strong>模板中心</Text>
              <Text type="secondary">先定制标题与主题，再复制整套学习集</Text>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="lp-resource-recommend-loading">
            <Spin size="small" />
          </div>
        ) : sortedTemplates.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用模板" />
        ) : (
          <div className="lp-resource-template-grid">
            {sortedTemplates.map((template) => (
              <article key={template.id} className="lp-resource-template-card">
                <div
                  className="lp-resource-template-card-icon"
                  style={{ background: `${template.color}16`, color: template.color }}
                >
                  {TEMPLATE_ICON_MAP[template.icon] || <BookOutlined />}
                </div>
                <div>
                  <Text strong style={{ fontSize: 15 }}>
                    {template.title}
                  </Text>
                  {template.subtitle ? (
                    <Paragraph type="secondary" style={{ margin: "6px 0 0" }}>
                      {template.subtitle}
                    </Paragraph>
                  ) : null}
                </div>
                <div className="lp-resource-template-card-meta">
                  <span>{template.resource_count} 项资源</span>
                  <span>约 {template.estimated_minutes} 分钟</span>
                  <span>{template.topic}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {template.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </div>
                <Button
                  type="primary"
                  onClick={() => setActiveTemplate(template)}
                  loading={creatingId === template.id}
                >
                  定制后创建
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>
      <Modal
        open={Boolean(activeTemplate)}
        title="按模板创建学习集"
        onCancel={() => setActiveTemplate(null)}
        onOk={() => void handleConfirmCreate()}
        okText="确认创建"
        cancelText="取消"
        confirmLoading={Boolean(activeTemplate && creatingId === activeTemplate.id)}
        destroyOnHidden={false}
      >
        {activeTemplate ? (
          <div className="lp-template-create-modal">
            <Paragraph type="secondary" style={{ marginTop: 0 }}>
              保留原模板结构不变，只在创建前覆盖学习集标题和主题，适合快速生成你的版本。
            </Paragraph>
            <div className="lp-template-create-field">
              <Text strong>学习集标题</Text>
              <Input
                value={copyTitle}
                placeholder="例如：机器学习期末冲刺"
                onChange={(event) => setCopyTitle(event.target.value)}
                maxLength={40}
              />
            </div>
            <div className="lp-template-create-field">
              <Text strong>主题聚焦</Text>
              <Input
                value={topicOverride}
                placeholder="例如：监督学习核心概念"
                onChange={(event) => setTopicOverride(event.target.value)}
                maxLength={40}
              />
            </div>
            <div className="lp-template-create-summary">
              <span>{activeTemplate.resource_count} 项资源</span>
              <span>约 {activeTemplate.estimated_minutes} 分钟</span>
              <span>{activeTemplate.tags.slice(0, 2).join(" / ")}</span>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
