"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Space, Typography, message } from "antd";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import QuestionCircleOutlined from "@ant-design/icons/QuestionCircleOutlined";
import CloseCircleOutlined from "@ant-design/icons/CloseCircleOutlined";
import CalendarOutlined from "@ant-design/icons/CalendarOutlined";
import {
  getMasteryRecords,
  submitMasteryFeedback,
  type MasteryLevel,
  type MasteryRecord,
} from "@/lib/api";
import { isReviewDue, recordLookupKey } from "@/lib/masteryStorage";

const { Text } = Typography;

const LEVELS: {
  key: MasteryLevel;
  label: string;
  hint: string;
  icon: React.ReactNode;
  className: string;
}[] = [
  {
    key: "forgot",
    label: "忘了",
    hint: "明天回顾",
    icon: <CloseCircleOutlined />,
    className: "lp-mastery-btn--forgot",
  },
  {
    key: "fuzzy",
    label: "模糊",
    hint: "2-3 天回顾",
    icon: <QuestionCircleOutlined />,
    className: "lp-mastery-btn--fuzzy",
  },
  {
    key: "mastered",
    label: "会了",
    hint: "拉长间隔",
    icon: <CheckCircleOutlined />,
    className: "lp-mastery-btn--mastered",
  },
];

const LEVEL_LABELS: Record<MasteryLevel, string> = {
  forgot: "忘了",
  fuzzy: "模糊",
  mastered: "会了",
};

export type MasteryFeedbackBarProps = {
  userId: string;
  resourceId?: string;
  stepKey?: string;
  title?: string;
  compact?: boolean;
  showTitle?: boolean;
  onSubmitted?: (record: MasteryRecord, response: { path_updated: boolean; next_review_label: string }) => void;
};

function lookupKey(resourceId?: string, stepKey?: string) {
  return recordLookupKey(resourceId, stepKey);
}

export default function MasteryFeedbackBar({
  userId,
  resourceId,
  stepKey,
  title,
  compact = false,
  showTitle = true,
  onSubmitted,
}: MasteryFeedbackBarProps) {
  const [current, setCurrent] = useState<MasteryRecord | null>(null);
  const [loadingLevel, setLoadingLevel] = useState<MasteryLevel | null>(null);
  const [nextReviewLabel, setNextReviewLabel] = useState("");
  const [reviewDue, setReviewDue] = useState(false);

  const lookupKeyValue = lookupKey(resourceId, stepKey);

  const loadRecord = useCallback(async () => {
    if (!lookupKeyValue) return;
    try {
      const data = await getMasteryRecords(userId);
      const record = data.records[lookupKeyValue];
      if (record) {
        setCurrent(record);
        setReviewDue(Boolean(record.next_review_at && isReviewDue(record.next_review_at)));
        if (record.next_review_at) {
          const dt = new Date(record.next_review_at);
          if (!Number.isNaN(dt.getTime())) {
            setNextReviewLabel(
              `${dt.getMonth() + 1}月${dt.getDate()}日`
            );
          }
        }
      }
    } catch {
      /* 忽略加载失败 */
    }
  }, [userId, lookupKeyValue]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  const handleSubmit = async (level: MasteryLevel) => {
    if (!resourceId && !stepKey) return;
    setLoadingLevel(level);
    try {
      const res = await submitMasteryFeedback(userId, level, {
        resourceId,
        stepKey,
        title,
      });
      setCurrent(res.record);
      setNextReviewLabel(res.next_review_label);
      setReviewDue(Boolean(res.record.next_review_at && isReviewDue(res.record.next_review_at)));
      message.success(`已记录「${LEVEL_LABELS[level]}」，建议 ${res.next_review_label} 复习`);
      onSubmitted?.(res.record, {
        path_updated: res.path_updated,
        next_review_label: res.next_review_label,
      });
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "掌握度反馈失败");
    } finally {
      setLoadingLevel(null);
    }
  };

  if (!resourceId && !stepKey) return null;

  return (
    <section
      className={`lp-mastery-bar${compact ? " lp-mastery-bar--compact" : ""}`}
      aria-label="掌握度反馈"
      onClick={(e) => e.stopPropagation()}
    >
      {showTitle && (
        <div className="lp-mastery-bar-head">
          <Text strong className="lp-mastery-bar-title">
            掌握得怎么样？
          </Text>
          {title ? (
            <Text type="secondary" className="lp-mastery-bar-sub">
              {title}
            </Text>
          ) : null}
        </div>
      )}

      <Space wrap size={8} className="lp-mastery-bar-actions">
        {LEVELS.map((item) => {
          const active = current?.level === item.key;
          return (
            <Button
              key={item.key}
              size={compact ? "small" : "middle"}
              className={`lp-mastery-btn ${item.className}${active ? " is-active" : ""}`}
              icon={item.icon}
              loading={loadingLevel === item.key}
              disabled={Boolean(loadingLevel && loadingLevel !== item.key)}
              onClick={() => void handleSubmit(item.key)}
            >
              {item.label}
              {!compact && <span className="lp-mastery-btn-hint">{item.hint}</span>}
            </Button>
          );
        })}
      </Space>

      {(current || nextReviewLabel) && (
        <div className="lp-mastery-bar-result">
          <CalendarOutlined />
          <Text type="secondary">
            {current ? (
              <>
                当前掌握度：<Text strong>{LEVEL_LABELS[current.level]}</Text>
                {reviewDue ? " · 已到复习时间" : nextReviewLabel ? ` · 建议 ${nextReviewLabel} 复习` : null}
              </>
            ) : (
              nextReviewLabel ? `建议 ${nextReviewLabel} 复习` : null
            )}
          </Text>
        </div>
      )}
    </section>
  );
}
