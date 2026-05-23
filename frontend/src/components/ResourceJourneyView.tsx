"use client";

import { useEffect, useState } from "react";
import {
  DownloadOutlined,
  EyeOutlined,
  RightOutlined,
  StarFilled,
  StarOutlined,
} from "@ant-design/icons";
import { Button, Tag, Tooltip, Typography } from "antd";
import type { LearningResource } from "@/lib/api";
import {
  RESOURCE_CONFIG,
  mapApiType,
  type UiResourceType,
} from "@/lib/resourceConfig";
import type { ResourceCategoryGroup, ResourceStageGroup } from "@/lib/resourceGrouping";
import { STAGE_STATUS_META } from "@/lib/resourceGrouping";

const { Text } = Typography;

function defaultExpandedIds(stages: ResourceStageGroup[]): Set<string> {
  const inProgress = stages.filter((s) => s.status === "in_progress");
  if (inProgress.length) return new Set(inProgress.map((s) => s.id));
  if (stages.length) return new Set([stages[0].id]);
  return new Set();
}

type ResourceCardProps = {
  resource: LearningResource;
  starred: boolean;
  onStar: () => void;
  onPreview: () => void;
  onDownload: () => void;
  compact?: boolean;
};

function ResourceCard({
  resource,
  starred,
  onStar,
  onPreview,
  onDownload,
  compact,
}: ResourceCardProps) {
  const uiType = mapApiType(resource.type) as UiResourceType;
  const cfg = RESOURCE_CONFIG[uiType];

  return (
    <article
      className={`lp-resource-card${compact ? " lp-resource-card--compact" : ""}`}
      style={{ "--res-accent": cfg.color } as React.CSSProperties}
    >
      <div className="lp-resource-card-accent" aria-hidden />
      <div className="lp-resource-card-icon">{cfg.icon}</div>
      <div className="lp-resource-card-body">
        <Text strong className="lp-resource-card-title">
          {resource.title}
        </Text>
        {!compact && resource.topic && (
          <Text type="secondary" className="lp-resource-card-topic">
            {resource.topic}
          </Text>
        )}
      </div>
      <div className="lp-resource-card-actions">
        <Tooltip title={starred ? "取消收藏" : "收藏"}>
          <Button
            type="text"
            size="small"
            icon={
              starred ? (
                <StarFilled style={{ color: "#faad14" }} />
              ) : (
                <StarOutlined />
              )
            }
            onClick={onStar}
          />
        </Tooltip>
        <Tooltip title="预览">
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={onPreview} />
        </Tooltip>
        <Tooltip title="下载">
          <Button type="text" size="small" icon={<DownloadOutlined />} onClick={onDownload} />
        </Tooltip>
      </div>
    </article>
  );
}

type ResourceStageSectionProps = {
  stage: ResourceStageGroup;
  starredIds: string[];
  expanded: boolean;
  onToggle: () => void;
  onStar: (id: string) => void;
  onPreview: (r: LearningResource) => void;
  onDownload: (r: LearningResource) => void;
};

export function ResourceStageSection({
  stage,
  starredIds,
  expanded,
  onToggle,
  onStar,
  onPreview,
  onDownload,
}: ResourceStageSectionProps) {
  const statusMeta = STAGE_STATUS_META[stage.status];

  return (
    <section
      className={`lp-resource-stage lp-resource-stage--${stage.status}${expanded ? "" : " lp-resource-stage--collapsed"}`}
      style={
        {
          "--stage-accent": statusMeta.color,
          "--stage-glow": statusMeta.glow,
        } as React.CSSProperties
      }
    >
      <header
        className="lp-resource-stage-header"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="lp-resource-stage-node">
          <span className="lp-resource-stage-order">{stage.order}</span>
        </div>
        <div className="lp-resource-stage-meta">
          <div className="lp-resource-stage-title-row">
            <h3 className="lp-resource-stage-title">{stage.title}</h3>
            <Tag
              className="lp-resource-stage-status"
              style={{ color: statusMeta.color, borderColor: `${statusMeta.color}44` }}
            >
              {statusMeta.label}
            </Tag>
            <span className="lp-resource-stage-count">{stage.resourceCount} 项资源</span>
          </div>
          {expanded && stage.objective && (
            <p className="lp-resource-stage-objective">{stage.objective}</p>
          )}
          {expanded && stage.estimatedMinutes > 0 && (
            <Text type="secondary" className="lp-resource-stage-time">
              预计 {stage.estimatedMinutes} 分钟
            </Text>
          )}
        </div>
        <button
          type="button"
          className="lp-resource-stage-toggle"
          aria-label={expanded ? "折叠阶段" : "展开阶段"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <RightOutlined />
        </button>
      </header>

      <div className="lp-resource-stage-body">
        {stage.categories.map((cat) => (
          <CategoryLane
            key={cat.type}
            category={cat}
            starredIds={starredIds}
            onStar={onStar}
            onPreview={onPreview}
            onDownload={onDownload}
          />
        ))}
      </div>
    </section>
  );
}

function CategoryLane({
  category,
  starredIds,
  onStar,
  onPreview,
  onDownload,
}: {
  category: ResourceCategoryGroup;
  starredIds: string[];
  onStar: (id: string) => void;
  onPreview: (r: LearningResource) => void;
  onDownload: (r: LearningResource) => void;
}) {
  const cfg = RESOURCE_CONFIG[category.type];

  return (
    <div
      className="lp-resource-category-lane"
      style={{ "--lane-accent": category.color } as React.CSSProperties}
    >
      <div className="lp-resource-category-head">
        <span className="lp-resource-category-icon">{cfg.icon}</span>
        <span className="lp-resource-category-label">{category.label}</span>
        <span className="lp-resource-category-badge">{category.resources.length}</span>
      </div>
      <div className="lp-resource-category-grid">
        {category.resources.map((r) => (
          <ResourceCard
            key={r.id}
            resource={r}
            starred={starredIds.includes(r.id)}
            onStar={() => onStar(r.id)}
            onPreview={() => onPreview(r)}
            onDownload={() => onDownload(r)}
            compact
          />
        ))}
      </div>
    </div>
  );
}

type ResourceJourneyViewProps = {
  stages: ResourceStageGroup[];
  starredIds: string[];
  onStar: (id: string) => void;
  onPreview: (r: LearningResource) => void;
  onDownload: (r: LearningResource) => void;
};

export function ResourceJourneyView({
  stages,
  starredIds,
  onStar,
  onPreview,
  onDownload,
}: ResourceJourneyViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    defaultExpandedIds(stages)
  );

  useEffect(() => {
    setExpandedIds((prev) => {
      const stageIdSet = new Set(stages.map((s) => s.id));
      const next = new Set<string>();

      for (const id of Array.from(prev)) {
        if (stageIdSet.has(id)) next.add(id);
      }

      for (const stage of stages) {
        if (!prev.has(stage.id) && stage.status === "in_progress") {
          next.add(stage.id);
        }
      }

      if (stages.length && !stages.some((s) => next.has(s.id))) {
        defaultExpandedIds(stages).forEach((id) => next.add(id));
      }

      return next;
    });
  }, [stages]);

  const toggleStage = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedIds(new Set(stages.map((s) => s.id)));
  const collapseAll = () => setExpandedIds(new Set());

  return (
    <div className="lp-resource-journey">
      {stages.length > 1 && (
        <div className="lp-resource-journey-toolbar">
          <button type="button" className="lp-resource-journey-tool" onClick={expandAll}>
            全部展开
          </button>
          <span className="lp-resource-journey-tool-sep" aria-hidden>
            ·
          </span>
          <button type="button" className="lp-resource-journey-tool" onClick={collapseAll}>
            全部折叠
          </button>
        </div>
      )}
      <div className="lp-resource-journey-rail" aria-hidden />
      {stages.map((stage) => (
        <ResourceStageSection
          key={stage.id}
          stage={stage}
          starredIds={starredIds}
          expanded={expandedIds.has(stage.id)}
          onToggle={() => toggleStage(stage.id)}
          onStar={onStar}
          onPreview={onPreview}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}
