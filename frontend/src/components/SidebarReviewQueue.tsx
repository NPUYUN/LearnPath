"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Tooltip, Typography } from "antd";
import ClockCircleOutlined from "@ant-design/icons/ClockCircleOutlined";
import RightOutlined from "@ant-design/icons/RightOutlined";
import { getMasteryRecords, type MasteryRecord } from "@/lib/api";
import { formatReviewLabel, isReviewDue } from "@/lib/masteryStorage";
import { useAppStore } from "@/store/appStore";
import { openResourceView } from "@/lib/resourceViewCache";

const { Text } = Typography;

type SidebarReviewQueueProps = {
  collapsed: boolean;
};

function sortReviewRecords(records: MasteryRecord[]) {
  return [...records].sort((a, b) => {
    const aDue = isReviewDue(a.next_review_at);
    const bDue = isReviewDue(b.next_review_at);
    if (aDue !== bDue) return aDue ? -1 : 1;
    return new Date(a.next_review_at).getTime() - new Date(b.next_review_at).getTime();
  });
}

export default function SidebarReviewQueue({ collapsed }: SidebarReviewQueueProps) {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const resources = useAppStore((s) => s.resources);
  const [records, setRecords] = useState<MasteryRecord[]>([]);

  const loadQueue = useCallback(async () => {
    try {
      const data = await getMasteryRecords(userId);
      const rows = Object.values(data.records || {}).filter((record) => record.next_review_at);
      setRecords(sortReviewRecords(rows).slice(0, 3));
    } catch {
      setRecords([]);
    }
  }, [userId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const dueCount = useMemo(
    () => records.filter((record) => isReviewDue(record.next_review_at)).length,
    [records],
  );

  const openRecord = (record: MasteryRecord) => {
    if (record.resource_id) {
      const resource = resources.find((item) => item.id === record.resource_id);
      openResourceView(router, resource ?? record.resource_id, userId);
      return;
    }
    router.push("/path");
  };

  if (collapsed) {
    if (!records.length) return null;
    return (
      <Tooltip
        placement="right"
        title={dueCount ? `有 ${dueCount} 项待复习` : `最近复习 ${records.length} 项`}
      >
        <button type="button" className="lp-sider-plan-collapsed" aria-label="待复习队列">
          <ClockCircleOutlined />
          {dueCount > 0 && (
            <span className="lp-sider-plan-collapsed-badge">{dueCount}</span>
          )}
        </button>
      </Tooltip>
    );
  }

  if (!records.length) return null;

  return (
    <section className="lp-sider-daily-plan" aria-label="待复习队列">
      <div className="lp-sider-daily-plan-head">
        <Text type="secondary" className="lp-sider-daily-plan-title">
          <ClockCircleOutlined /> 待复习
        </Text>
        <Text type="secondary" className="lp-sider-daily-plan-count">
          {dueCount > 0 ? `${dueCount} 项已到期` : `${records.length} 项排队中`}
        </Text>
      </div>
      <ul className="lp-sider-daily-plan-list">
        {records.map((record, index) => {
          const due = isReviewDue(record.next_review_at);
          return (
            <li key={`${record.resource_id || record.step_key || index}`} className="lp-sider-daily-plan-item">
              <span className="lp-sider-daily-plan-text">
                <strong>{record.title || `学习项 ${index + 1}`}</strong>
                <br />
                <span className="lp-muted-text">
                  {due ? "现在复习" : `建议 ${formatReviewLabel(record.next_review_at)} 回顾`}
                </span>
              </span>
              <Button
                type="text"
                size="small"
                icon={<RightOutlined />}
                onClick={() => openRecord(record)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
