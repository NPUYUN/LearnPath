"use client";

import { Button, Progress, Tag } from "antd";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import CloseOutlined from "@ant-design/icons/CloseOutlined";
import EyeInvisibleOutlined from "@ant-design/icons/EyeInvisibleOutlined";
import LoadingOutlined from "@ant-design/icons/LoadingOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import ShrinkOutlined from "@ant-design/icons/ShrinkOutlined";
import WarningOutlined from "@ant-design/icons/WarningOutlined";
import { clientNavigate } from "@/lib/clientNav";
import { useAppStore } from "@/store/appStore";

export default function ResourceRegenerationFloat() {
  const task = useAppStore((s) => s.resourceRegenTask);
  const mode = useAppStore((s) => s.resourceRegenPanelMode);
  const setMode = useAppStore((s) => s.setResourceRegenPanelMode);
  const clearTask = useAppStore((s) => s.clearResourceRegenTask);
  const setPendingPreviewId = useAppStore((s) => s.setPendingResourcePreviewId);

  if (!task || mode === "hidden") return null;

  const running = task.status === "running";
  const done = task.status === "done";
  const error = task.status === "error";
  const progress = Math.max(0, Math.min(100, task.progress || 0));

  const closeOrHide = () => {
    if (running) setMode("hidden");
    else clearTask();
  };

  const openResource = () => {
    setPendingPreviewId(task.resourceId);
    setMode("minimized");
    clientNavigate("/resources");
  };

  if (mode === "minimized") {
    return (
      <button
        type="button"
        className={`lp-resource-regen-float-pill${done ? " is-done" : error ? " is-error" : " is-running"}`}
        onClick={() => setMode("open")}
      >
        {error ? <WarningOutlined /> : done ? <CheckCircleOutlined /> : <LoadingOutlined spin />}
        <span>{done ? "资源已更新" : error ? "生成失败" : `资源生成 ${progress}%`}</span>
      </button>
    );
  }

  return (
    <aside
      className={`lp-resource-regen-float${done ? " is-done" : error ? " is-error" : " is-running"}`}
    >
      <div className="lp-resource-regen-float-head">
        <div>
          <span>{done ? "资源已更新" : error ? "资源生成失败" : "资源后台生成中"}</span>
          <strong>
            <ReloadOutlined /> {task.title}
          </strong>
        </div>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={closeOrHide} />
      </div>

      <div className="lp-resource-regen-float-status">
        <Tag color={error ? "red" : done ? "green" : "processing"}>
          {done ? "已完成" : error ? "失败" : "后台任务"}
        </Tag>
        <span>{error ? task.error || "重新生成失败" : task.stage}</span>
      </div>

      <Progress percent={progress} showInfo={false} status={error ? "exception" : "active"} />

      <div className="lp-resource-regen-float-actions">
        {done && (
          <Button type="primary" size="small" onClick={openResource}>
            查看资源
          </Button>
        )}
        <Button size="small" icon={<ShrinkOutlined />} onClick={() => setMode("minimized")}>
          缩小
        </Button>
        {running ? (
          <Button size="small" icon={<EyeInvisibleOutlined />} onClick={() => setMode("hidden")}>
            隐藏
          </Button>
        ) : (
          <Button size="small" onClick={clearTask}>
            关闭
          </Button>
        )}
      </div>
    </aside>
  );
}
