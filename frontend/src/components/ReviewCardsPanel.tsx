"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Empty, Input, Spin, Tag, Typography, message } from "antd";
import ContainerOutlined from "@ant-design/icons/ContainerOutlined";
import DownloadOutlined from "@ant-design/icons/DownloadOutlined";
import ExpandOutlined from "@ant-design/icons/ExpandOutlined";
import EyeOutlined from "@ant-design/icons/EyeOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import ReadOutlined from "@ant-design/icons/ReadOutlined";
import FolderOpenOutlined from "@ant-design/icons/FolderOpenOutlined";
import FolderOutlined from "@ant-design/icons/FolderOutlined";
import RightOutlined from "@ant-design/icons/RightOutlined";
import type { LearningResource } from "@/lib/api";
import { RESOURCE_CONFIG } from "@/lib/resourceConfig";
import { downloadResourceMarkdown } from "@/lib/downloadResource";
import { getReviewCardTopicKey } from "@/lib/reviewCardTopics";

const { Text, Paragraph } = Typography;

type ReviewCardsPanelProps = {
  userId: string;
  cards: LearningResource[];
  loading: boolean;
  onRefresh: () => void;
  onPreview: (resource: LearningResource) => void;
  onOpenFull: (resource: LearningResource) => void;
  onDelete: (resource: LearningResource) => void;
  onGenerate: () => void;
};

type ReviewCardGroup = {
  topic: string;
  cards: LearningResource[];
};

function ReviewCardItem({
  card,
  cfg,
  onPreview,
  onOpenFull,
  onDelete,
  onDownload,
}: {
  card: LearningResource;
  cfg: (typeof RESOURCE_CONFIG)["review_card"];
  onPreview: (resource: LearningResource) => void;
  onOpenFull: (resource: LearningResource) => void;
  onDelete: (resource: LearningResource) => void;
  onDownload: (resource: LearningResource) => void;
}) {
  const points = (card.metadata?.knowledge_points || []).slice(0, 4);

  return (
    <article key={card.id} className="lp-review-card-item">
      <div className="lp-review-card-item-head">
        <span
          className="lp-review-card-item-icon"
          style={{ color: cfg.color, background: `${cfg.color}14` }}
        >
          <ContainerOutlined />
        </span>
        <div>
          <Text strong>{card.title}</Text>
          {card.topic ? (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                主题：{card.topic}
              </Text>
            </div>
          ) : null}
        </div>
      </div>
      <Paragraph type="secondary" ellipsis={{ rows: 3 }} style={{ margin: "10px 0", fontSize: 13 }}>
        {card.metadata?.summary || "浓缩考点、易错辨析与快问快答"}
      </Paragraph>
      <div className="lp-review-card-item-tags">
        <Tag color="purple">复习卡</Tag>
        <Tag color="geekblue">约 {card.metadata?.estimated_minutes || 10} 分钟</Tag>
        {points.map((p) => (
          <Tag key={p}>{p.length > 16 ? `${p.slice(0, 16)}…` : p}</Tag>
        ))}
      </div>
      <div className="lp-review-card-item-actions">
        <Button size="small" icon={<EyeOutlined />} onClick={() => onPreview(card)}>
          预览
        </Button>
        <Button size="small" icon={<ExpandOutlined />} onClick={() => onOpenFull(card)}>
          全屏
        </Button>
        <Button size="small" icon={<DownloadOutlined />} onClick={() => onDownload(card)}>
          Markdown
        </Button>
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(card)}>
          删除
        </Button>
      </div>
    </article>
  );
}

export default function ReviewCardsPanel({
  userId,
  cards,
  loading,
  onRefresh,
  onPreview,
  onOpenFull,
  onDelete,
  onGenerate,
}: ReviewCardsPanelProps) {
  const [search, setSearch] = useState("");
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const cfg = RESOURCE_CONFIG.review_card;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.topic || "").toLowerCase().includes(q) ||
        getReviewCardTopicKey(c).toLowerCase().includes(q) ||
        (c.metadata?.knowledge_points || []).some((p) => p.toLowerCase().includes(q))
    );
  }, [cards, search]);

  const groups = useMemo((): ReviewCardGroup[] => {
    const map = new Map<string, LearningResource[]>();
    for (const card of filtered) {
      const topic = getReviewCardTopicKey(card);
      const list = map.get(topic) || [];
      list.push(card);
      map.set(topic, list);
    }
    return Array.from(map.entries())
      .map(([topic, topicCards]) => ({ topic, cards: topicCards }))
      .sort((a, b) => a.topic.localeCompare(b.topic, "zh"));
  }, [filtered]);

  useEffect(() => {
    const q = search.trim();
    if (!q) return;
    setExpandedTopics(new Set(groups.map((g) => g.topic)));
  }, [search, groups]);

  const toggleFolder = (topic: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const handleDownload = async (resource: LearningResource) => {
    const hide = message.loading("正在准备另存为…", 0);
    const result = await downloadResourceMarkdown(userId, resource);
    hide();
    if (result.cancelled) return;
    if (result.ok) {
      message.success(`「${resource.title}」${result.saveHint || "已保存"}`);
    } else {
      message.warning(result.error || "另存为失败");
    }
  };

  if (loading && cards.length === 0) {
    return (
      <div className="lp-review-cards-empty">
        <Spin />
      </div>
    );
  }

  return (
    <div className="lp-review-cards-panel">
      <div className="lp-review-cards-toolbar">
        <Input.Search
          allowClear
          placeholder="搜索复习卡主题或考点…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <div className="lp-review-cards-toolbar-actions">
          <Button onClick={onRefresh}>刷新</Button>
          <Button type="primary" icon={<ReadOutlined />} onClick={onGenerate}>
            生成复习卡
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={cards.length === 0 ? "还没有复习卡，点击右上角生成" : "没有匹配的复习卡"}
          style={{ padding: "48px 0" }}
        >
          <Button type="primary" icon={<ReadOutlined />} onClick={onGenerate}>
            生成第一张复习卡
          </Button>
        </Empty>
      ) : (
        <div className="lp-review-card-folders">
          {groups.map(({ topic, cards: topicCards }) => {
            const expanded = expandedTopics.has(topic);
            return (
              <section key={topic} className="lp-review-card-folder">
                <button
                  type="button"
                  className="lp-review-card-folder-head"
                  onClick={() => toggleFolder(topic)}
                  aria-expanded={expanded}
                >
                  <RightOutlined
                    className={`lp-review-card-folder-chevron${expanded ? " lp-review-card-folder-chevron--open" : ""}`}
                  />
                  {expanded ? (
                    <FolderOpenOutlined className="lp-review-card-folder-icon" />
                  ) : (
                    <FolderOutlined className="lp-review-card-folder-icon" />
                  )}
                  <span className="lp-review-card-folder-title">{topic}</span>
                  <Tag className="lp-review-card-folder-count">{topicCards.length} 张</Tag>
                </button>
                {expanded ? (
                  <div className="lp-review-cards-grid lp-review-cards-grid--in-folder">
                    {topicCards.map((card) => (
                      <ReviewCardItem
                        key={card.id}
                        card={card}
                        cfg={cfg}
                        onPreview={onPreview}
                        onOpenFull={onOpenFull}
                        onDelete={onDelete}
                        onDownload={(r) => void handleDownload(r)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
