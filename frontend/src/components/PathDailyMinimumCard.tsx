"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button, Typography, message } from "antd";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import ReadOutlined from "@ant-design/icons/ReadOutlined";
import FormOutlined from "@ant-design/icons/FormOutlined";
import RightOutlined from "@ant-design/icons/RightOutlined";
import type { LearningPath, LearningResource } from "@/lib/api";
import { buildDailyMinimumTasks, type DailyMinimumTask } from "@/lib/dailyMinimumTasks";
import { clientNavigate } from "@/lib/clientNav";
import { openResourceView } from "@/lib/resourceViewCache";

const { Text } = Typography;

const TASK_ICONS = {
  path: <ApartmentOutlined />,
  review: <ReadOutlined />,
  quiz: <FormOutlined />,
};

type PathDailyMinimumCardProps = {
  path: LearningPath | null;
  resources: LearningResource[];
  userId: string;
  onFocusStep?: (stepKey: string) => void;
};

function TaskRow({
  task,
  userId,
  resources,
  router,
  onFocusStep,
}: {
  task: DailyMinimumTask;
  userId: string;
  resources: LearningResource[];
  router: ReturnType<typeof useRouter>;
  onFocusStep?: (stepKey: string) => void;
}) {
  const handleClick = () => {
    if (task.key === "path" && task.stepKey) {
      onFocusStep?.(task.stepKey);
      return;
    }
    if (task.key === "quiz") {
      message.info("小测验功能即将上线，敬请期待");
      return;
    }
    if (task.key === "review") {
      if (task.resourceId) {
        const resource = resources.find((r) => r.id === task.resourceId);
        openResourceView(router, resource ?? task.resourceId, userId);
        return;
      }
      clientNavigate("/resources");
      return;
    }
    if (task.resourceId) {
      const resource = resources.find((r) => r.id === task.resourceId);
      openResourceView(router, resource ?? task.resourceId, userId);
      return;
    }
    if (task.fallbackRoute) {
      clientNavigate(task.fallbackRoute);
    }
  };

  return (
    <button type="button" className="lp-daily-min-task" onClick={handleClick}>
      <span className={`lp-daily-min-task-icon lp-daily-min-task-icon--${task.key}`}>
        {TASK_ICONS[task.key]}
      </span>
      <span className="lp-daily-min-task-body">
        <span className="lp-daily-min-task-label">{task.label}</span>
        <span className="lp-daily-min-task-title">{task.title}</span>
        <span className="lp-daily-min-task-sub">{task.subtitle}</span>
      </span>
      {task.done ? (
        <CheckCircleOutlined className="lp-daily-min-task-done" />
      ) : (
        <RightOutlined className="lp-daily-min-task-arrow" />
      )}
    </button>
  );
}

export default function PathDailyMinimumCard({
  path,
  resources,
  userId,
  onFocusStep,
}: PathDailyMinimumCardProps) {
  const router = useRouter();
  const tasks = useMemo(() => buildDailyMinimumTasks(path, resources), [path, resources]);
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <section className="lp-daily-min-card" aria-label="今日最小任务">
      <div className="lp-daily-min-head">
        <div>
          <Text strong style={{ fontSize: 15 }}>
            今日最小任务
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              1 个路径步骤 · 1 份复习 · 1 组小测
            </Text>
          </div>
        </div>
        <Text type="secondary" className="lp-daily-min-count">
          {doneCount}/{tasks.length}
        </Text>
      </div>
      <div className="lp-daily-min-list">
        {tasks.map((task) => (
          <TaskRow
            key={task.key}
            task={task}
            userId={userId}
            resources={resources}
            router={router}
            onFocusStep={onFocusStep}
          />
        ))}
      </div>
      <Button
        type="link"
        size="small"
        className="lp-daily-min-insights-link"
        onClick={() => clientNavigate("/insights")}
      >
        查看成就馆数据
      </Button>
    </section>
  );
}
