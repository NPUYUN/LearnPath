"use client";

import { useEffect, useState } from "react";
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  RightOutlined,
  StarFilled,
  StarOutlined,
} from "@ant-design/icons";
import { Button, Checkbox, Tag, Tooltip, Typography } from "antd";
import type { LearningResource } from "@/lib/api";
import { generationSourceMeta } from "@/lib/resourceSource";
import {
  RESOURCE_CONFIG,
  mapApiType,
  type UiResourceType,
} from "@/lib/resourceConfig";
import type { ResourceCategoryGroup, ResourceStageGroup } from "@/lib/resourceGrouping";
import { STAGE_STATUS_META } from "@/lib/resourceGrouping";

const { Text } = Typography;

const PURPOSE_LABELS: Record<string, string> = {
  preview: "课前预习",
  explain: "讲解",
  practice: "练习",
  review: "复习",
  exam: "应试训练",
  classroom: "AI课堂",
  project: "项目实践",
};

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
  onRegenerate: () => void;
  onDelete: () => void;
  manageMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  compact?: boolean;
  relationLabel?: string;
};

function ResourceCard({
  resource,
  starred,
  onStar,
  onPreview,
  onDownload,
  onRegenerate,
  onDelete,
  manageMode = false,
  selected = false,
  onToggleSelect,
  compact,
  relationLabel,
}: ResourceCardProps) {
  const uiType = mapApiType(resource.type) as UiResourceType;
  const cfg = RESOURCE_CONFIG[uiType];
  const sourceMeta = generationSourceMeta(resource);
  const metadata = resource.metadata;
  const qualityTags = (metadata?.quality_tags || []).slice(0, compact ? 0 : 2);
  const compactMetaTags = [
    metadata?.knowledge_points?.[0],
    metadata?.learning_purpose ? PURPOSE_LABELS[metadata.learning_purpose] : "",
    metadata?.source_library_id ? "资料库" : "",
    ...qualityTags,
  ].filter(Boolean).slice(0, compact ? 2 : 4);

  return (
    <article
      className={`lp-resource-card${compact ? " lp-resource-card--compact" : ""}${manageMode ? " lp-resource-card--manage" : ""}${selected ? " lp-resource-card--selected" : ""}`}
      style={{ "--res-accent": cfg.color } as React.CSSProperties}
      role={manageMode ? "button" : undefined}
      tabIndex={manageMode ? 0 : undefined}
      aria-pressed={manageMode ? selected : undefined}
      onClick={manageMode ? onToggleSelect : undefined}
      onKeyDown={
        manageMode
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleSelect?.();
              }
            }
          : undefined
      }
    >
      <div className="lp-resource-card-accent" aria-hidden />
      {manageMode && (
        <Checkbox
          className="lp-resource-card-select"
          checked={selected}
          aria-label={`选择 ${resource.title}`}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect?.()}
        />
      )}
      <div className="lp-resource-card-icon">{cfg.icon}</div>
      <div className="lp-resource-card-body">
        <Text strong className="lp-resource-card-title">
          {resource.title}
        </Text>
        <div className="lp-resource-card-tags">
          {relationLabel && (
            <Tag className="lp-resource-relation-tag">
              {relationLabel}
            </Tag>
          )}
          {compactMetaTags.map((label) => (
            <Tag key={label} className="lp-resource-asset-tag">
              {label}
            </Tag>
          ))}
          {!compact && (
            <Tag className="lp-resource-source-tag" color={sourceMeta.color}>
              {sourceMeta.short}
            </Tag>
          )}
          {resource.status === "draft" && <Tag color="gold">待完善</Tag>}
        </div>
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
            onClick={(e) => {
              e.stopPropagation();
              onStar();
            }}
          />
        </Tooltip>
        <Tooltip title="预览">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
          />
        </Tooltip>
        <Tooltip title="另存为">
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          />
        </Tooltip>
        {!manageMode && (
          <Tooltip title="重新生成">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate();
              }}
            />
          </Tooltip>
        )}
        <Tooltip title="删除">
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          />
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
  onRegenerate: (r: LearningResource) => void;
  onDelete: (r: LearningResource) => void;
  manageMode?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
};

export function ResourceStageSection({
  stage,
  starredIds,
  expanded,
  onToggle,
  onStar,
  onPreview,
  onDownload,
  onRegenerate,
  onDelete,
  manageMode = false,
  selectedIds = [],
  onToggleSelect,
}: ResourceStageSectionProps) {
  const statusMeta = STAGE_STATUS_META[stage.status];
  const relationLabel =
    stage.id === "unassigned"
      ? "历史资源"
      : stage.id.startsWith("topic-")
        ? "主题归档"
        : "当前路径";

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
            onRegenerate={onRegenerate}
            onDelete={onDelete}
            manageMode={manageMode}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            relationLabel={relationLabel}
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
  onRegenerate,
  onDelete,
  manageMode = false,
  selectedIds = [],
  onToggleSelect,
  relationLabel,
}: {
  category: ResourceCategoryGroup;
  starredIds: string[];
  onStar: (id: string) => void;
  onPreview: (r: LearningResource) => void;
  onDownload: (r: LearningResource) => void;
  onRegenerate: (r: LearningResource) => void;
  onDelete: (r: LearningResource) => void;
  manageMode?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  relationLabel?: string;
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
            onRegenerate={() => onRegenerate(r)}
            onDelete={() => onDelete(r)}
            manageMode={manageMode}
            selected={selectedIds.includes(r.id)}
            onToggleSelect={() => onToggleSelect?.(r.id)}
            relationLabel={relationLabel}
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
  onRegenerate: (r: LearningResource) => void;
  onDelete: (r: LearningResource) => void;
  manageMode?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
};

export function ResourceJourneyView({
  stages,
  starredIds,
  onStar,
  onPreview,
  onDownload,
  onRegenerate,
  onDelete,
  manageMode = false,
  selectedIds = [],
  onToggleSelect,
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
          onRegenerate={onRegenerate}
          onDelete={onDelete}
          manageMode={manageMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
