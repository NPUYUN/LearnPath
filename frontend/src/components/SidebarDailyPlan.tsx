"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Input, Tooltip, Typography, message } from "antd";
import CalendarOutlined from "@ant-design/icons/CalendarOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import { getPreferences, patchPreferences } from "@/lib/api";
import {
  localDateStr,
  newTaskId,
  normalizeDailyPlan,
  type DailyPlan,
  type DailyTask,
} from "@/lib/dailyPlan";
import { useAppStore } from "@/store/appStore";

const { Text } = Typography;

type SidebarDailyPlanProps = {
  collapsed: boolean;
  onStatsChange?: (done: number, total: number) => void;
};

export default function SidebarDailyPlan({ collapsed, onStatsChange }: SidebarDailyPlanProps) {
  const userId = useAppStore((s) => s.userId);
  const [plan, setPlan] = useState<DailyPlan>(() => normalizeDailyPlan(null));
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const prefs = await getPreferences(userId);
      setPlan(normalizeDailyPlan(prefs.daily_plan));
    } catch {
      setPlan(normalizeDailyPlan(null));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    const tick = () => {
      const today = localDateStr();
      setPlan((prev) => (prev.date === today ? prev : normalizeDailyPlan(null)));
    };
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const persist = useCallback(
    async (next: DailyPlan) => {
      setSaving(true);
      try {
        await patchPreferences(userId, { daily_plan: next });
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : "保存计划失败");
        void loadPlan();
      } finally {
        setSaving(false);
      }
    },
    [userId, loadPlan]
  );

  const applyPlan = useCallback(
    (updater: (prev: DailyPlan) => DailyPlan) => {
      setPlan((prev) => {
        const next = updater(prev);
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  const doneCount = useMemo(() => plan.tasks.filter((t) => t.done).length, [plan.tasks]);

  const onStatsChangeRef = useRef(onStatsChange);
  onStatsChangeRef.current = onStatsChange;

  useEffect(() => {
    onStatsChangeRef.current?.(doneCount, plan.tasks.length);
  }, [doneCount, plan.tasks.length]);

  const addTask = () => {
    const text = draft.trim();
    if (!text) return;
    applyPlan((prev) => ({
      ...prev,
      date: localDateStr(),
      tasks: [...prev.tasks, { id: newTaskId(), text, done: false }],
    }));
    setDraft("");
  };

  const toggleTask = (id: string, done: boolean) => {
    applyPlan((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === id ? { ...t, done } : t)),
    }));
  };

  const removeTask = (id: string) => {
    applyPlan((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== id),
    }));
  };

  if (collapsed) {
    const pending = plan.tasks.length - doneCount;
    return (
      <Tooltip
        placement="right"
        title={
          plan.tasks.length
            ? `今日计划 ${doneCount}/${plan.tasks.length}${pending ? ` · 待完成 ${pending}` : ""}`
            : "今日计划 · 展开侧栏添加任务"
        }
      >
        <button type="button" className="lp-sider-plan-collapsed" aria-label="今日计划">
          <CalendarOutlined />
          {plan.tasks.length > 0 && (
            <span className="lp-sider-plan-collapsed-badge">{pending || doneCount}</span>
          )}
        </button>
      </Tooltip>
    );
  }

  return (
    <section className="lp-sider-daily-plan" aria-label="今日计划">
      <div className="lp-sider-daily-plan-head">
        <Text type="secondary" className="lp-sider-daily-plan-title">
          <CalendarOutlined /> 今日计划
        </Text>
        {plan.tasks.length > 0 && (
          <Text type="secondary" className="lp-sider-daily-plan-count">
            {doneCount}/{plan.tasks.length}
          </Text>
        )}
      </div>

      {loading ? (
        <Text type="secondary" className="lp-sider-daily-plan-empty">
          加载中…
        </Text>
      ) : plan.tasks.length === 0 ? (
        <Text type="secondary" className="lp-sider-daily-plan-empty">
          添加今天要完成的学习任务
        </Text>
      ) : (
        <ul className="lp-sider-daily-plan-list">
          {plan.tasks.map((task: DailyTask) => (
            <li key={task.id} className="lp-sider-daily-plan-item">
              <Checkbox
                checked={task.done}
                disabled={saving}
                onChange={(e) => toggleTask(task.id, e.target.checked)}
              />
              <span className={`lp-sider-daily-plan-text${task.done ? " is-done" : ""}`}>
                {task.text}
              </span>
              <button
                type="button"
                className="lp-sider-daily-plan-remove"
                aria-label="删除任务"
                disabled={saving}
                onClick={() => removeTask(task.id)}
              >
                <DeleteOutlined />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="lp-sider-daily-plan-add">
        <Input
          size="small"
          value={draft}
          disabled={saving}
          placeholder="新任务…"
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={addTask}
        />
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          disabled={saving || !draft.trim()}
          onClick={addTask}
          aria-label="添加任务"
        />
      </div>
    </section>
  );
}
