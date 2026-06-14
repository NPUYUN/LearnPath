"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Drawer,
  Empty,
  List,
  Modal,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import ExpandAltOutlined from "@ant-design/icons/ExpandAltOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import {
  deleteClassroomLibraryItem,
  getClassroomGenerationJob,
  listClassroomLibrary,
  patchClassroomLibraryFavorite,
  regenerateClassroomLibraryItem,
  type ClassroomLibraryItem,
} from "@/lib/api";
import { persistActiveClassroom } from "@/lib/classroomActive";
import { clientNavigate } from "@/lib/clientNav";
import { useAppStore, type ClassroomSessionSeed } from "@/store/appStore";

const { Text, Paragraph } = Typography;

type ClassroomManageDrawerProps = {
  open: boolean;
  onClose: () => void;
  onLibraryChange?: () => void;
};

function statusTag(item: ClassroomLibraryItem) {
  if (item.status === "done") return <Tag color="success">已生成</Tag>;
  if (item.status === "error") return <Tag color="error">生成失败</Tag>;
  if (item.status === "running" || item.status === "queued") {
    return <Tag color="processing">生成中 {item.progress}%</Tag>;
  }
  return <Tag>未知</Tag>;
}

function toSeed(item: ClassroomLibraryItem): ClassroomSessionSeed {
  const seed = item.seed;
  return {
    stepKey: seed?.stepKey || item.step_key,
    title: seed?.title || item.title,
    objective: seed?.objective || item.objective,
    resourceIds: seed?.resourceIds || [],
    estimatedMinutes: seed?.estimatedMinutes || 20,
    courseName: seed?.courseName || item.course_name,
    source: seed?.source || (item.step_key ? "path" : "manual"),
  };
}

export default function ClassroomManageDrawer({
  open,
  onClose,
  onLibraryChange,
}: ClassroomManageDrawerProps) {
  const [items, setItems] = useState<ClassroomLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const setPending = useAppStore((s) => s.setPendingClassroomSession);
  const setActiveSeed = useAppStore((s) => s.setActiveClassroomSeed);
  const setActiveJob = useAppStore((s) => s.setActiveClassroomJob);
  const setActiveResult = useAppStore((s) => s.setActiveClassroomResult);
  const setPanelMode = useAppStore((s) => s.setClassroomJobPanelMode);
  const clearActiveClassroom = useAppStore((s) => s.clearActiveClassroom);
  const activeJobId = useAppStore((s) => s.activeClassroomJob?.id);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listClassroomLibrary();
      setItems(list);
      setSelectedIds((prev) => prev.filter((id) => list.some((item) => item.id === id)));
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "加载课堂列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setBatchMode(false);
      setSelectedIds([]);
      return;
    }
    void load();
  }, [open, load]);

  const openClassroom = async (item: ClassroomLibraryItem) => {
    if (item.status !== "done" || !item.has_result) {
      message.info("课堂尚未生成完成，请稍后再试");
      return;
    }
    const seed = toSeed(item);
    setPending(seed);
    setActiveSeed(seed);
    setActiveResult(item.result);
    setActiveJob({
      id: item.job_id,
      user_id: item.user_id,
      title: item.title,
      status: item.status,
      stage: item.stage,
      progress: item.progress,
      result: item.result,
      error: item.error,
    });
    persistActiveClassroom({ jobId: item.job_id, seed });
    setPanelMode("hidden");
    onClose();
    clientNavigate("/classroom");
  };

  const toggleFavorite = async (item: ClassroomLibraryItem) => {
    setActingId(item.id);
    try {
      const next = await patchClassroomLibraryFavorite(item.id, !item.is_favorite);
      setItems((prev) => prev.map((row) => (row.id === next.id ? next : row)));
      message.success(next.is_favorite ? "已收藏" : "已取消收藏");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "收藏操作失败");
    } finally {
      setActingId(null);
    }
  };

  const deleteItems = async (targets: ClassroomLibraryItem[]) => {
    if (!targets.length) return;
    setBatchLoading(true);
    try {
      for (const item of targets) {
        await deleteClassroomLibraryItem(item.id);
        if (activeJobId === item.job_id) clearActiveClassroom();
      }
      const removed = new Set(targets.map((item) => item.id));
      setItems((prev) => prev.filter((row) => !removed.has(row.id)));
      setSelectedIds((prev) => prev.filter((id) => !removed.has(id)));
      onLibraryChange?.();
      message.success(targets.length > 1 ? `已删除 ${targets.length} 个课堂` : "已删除课堂");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBatchLoading(false);
      setActingId(null);
    }
  };

  const handleDelete = (item: ClassroomLibraryItem) => {
    Modal.confirm({
      title: "删除课堂",
      content: `确定删除「${item.title}」吗？删除后无法恢复。`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        setActingId(item.id);
        await deleteItems([item]);
      },
    });
  };

  const handleBatchDelete = () => {
    const targets = items.filter((item) => selectedIds.includes(item.id));
    if (!targets.length) {
      message.info("请先选择要删除的课堂");
      return;
    }
    Modal.confirm({
      title: "批量删除",
      content: `确定删除选中的 ${targets.length} 个课堂吗？删除后无法恢复。`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: () => deleteItems(targets),
    });
  };

  const handleBatchFavorite = async (favorite: boolean) => {
    const targets = items.filter((item) => selectedIds.includes(item.id));
    if (!targets.length) {
      message.info("请先选择课堂");
      return;
    }
    setBatchLoading(true);
    try {
      const updated = await Promise.all(
        targets.map((item) => patchClassroomLibraryFavorite(item.id, favorite)),
      );
      const updatedMap = new Map(updated.map((item) => [item.id, item]));
      setItems((prev) => prev.map((row) => updatedMap.get(row.id) ?? row));
      message.success(favorite ? `已收藏 ${targets.length} 个课堂` : `已取消收藏 ${targets.length} 个课堂`);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "批量收藏失败");
    } finally {
      setBatchLoading(false);
    }
  };

  const handleRegenerate = (item: ClassroomLibraryItem) => {
    Modal.confirm({
      title: "重新生成",
      content: `将按原配置重新生成「${item.title}」，当前课件内容会被替换。`,
      okText: "重新生成",
      cancelText: "取消",
      onOk: async () => {
        setActingId(item.id);
        try {
          const next = await regenerateClassroomLibraryItem(item.id);
          setItems((prev) => prev.map((row) => (row.id === next.id ? next : row)));
          const seed = toSeed(next);
          setActiveSeed(seed);
          setActiveResult(null);
          try {
            const job = await getClassroomGenerationJob(next.job_id);
            setActiveJob(job);
            persistActiveClassroom({ jobId: job.id, seed });
          } catch {
            setActiveJob({
              id: next.job_id,
              user_id: next.user_id,
              title: next.title,
              status: next.status,
              stage: next.stage,
              progress: next.progress,
              result: null,
              error: next.error,
            });
            persistActiveClassroom({ jobId: next.job_id, seed });
          }
          setPanelMode("open");
          onLibraryChange?.();
          message.success("已开始重新生成");
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : "重新生成失败");
        } finally {
          setActingId(null);
        }
      },
    });
  };

  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const indeterminate = selectedIds.length > 0 && selectedIds.length < items.length;

  return (
    <Drawer
      title="管理课堂"
      placement="right"
      width={440}
      open={open}
      onClose={onClose}
      className="lp-classroom-manage-drawer"
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        可同时保留多节 AI 课堂。收藏、查看、删除或按原配置重新生成。
      </Paragraph>

      <div className="lp-classroom-manage-toolbar">
        <Button
          size="small"
          type={batchMode ? "primary" : "default"}
          onClick={() => {
            setBatchMode((prev) => !prev);
            setSelectedIds([]);
          }}
        >
          {batchMode ? "退出批量" : "批量管理"}
        </Button>
        {batchMode && (
          <Space wrap size={6}>
            <Checkbox
              indeterminate={indeterminate}
              checked={allSelected}
              onChange={(e) => setSelectedIds(e.target.checked ? items.map((item) => item.id) : [])}
            >
              全选
            </Checkbox>
            <Button
              size="small"
              loading={batchLoading}
              disabled={!selectedIds.length}
              onClick={() => void handleBatchFavorite(true)}
            >
              批量收藏
            </Button>
            <Button
              size="small"
              loading={batchLoading}
              disabled={!selectedIds.length}
              onClick={() => void handleBatchFavorite(false)}
            >
              取消收藏
            </Button>
            <Button
              size="small"
              danger
              loading={batchLoading}
              disabled={!selectedIds.length}
              onClick={handleBatchDelete}
            >
              批量删除
            </Button>
          </Space>
        )}
      </div>

      <List
        loading={loading}
        locale={{ emptyText: <Empty description="还没有生成过的课堂" /> }}
        dataSource={items}
        renderItem={(item) => (
          <List.Item
            key={item.id}
            className={`lp-classroom-manage-item${item.is_favorite ? " is-favorite" : ""}`}
          >
            <div className="lp-classroom-manage-item-main">
              {batchMode && (
                <Checkbox
                  checked={selectedIds.includes(item.id)}
                  onChange={(e) => {
                    setSelectedIds((prev) =>
                      e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                    );
                  }}
                />
              )}
              <div className="lp-classroom-manage-item-body">
                <div className="lp-classroom-manage-item-title">
                  <Text strong>{item.title}</Text>
                  {item.is_favorite && <Tag color="gold">已收藏</Tag>}
                  {statusTag(item)}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {item.course_name || "未命名课程"}
                  {item.step_key ? ` · ${item.step_key}` : ""}
                </Text>
                {!batchMode && (
                  <Space size={6} wrap className="lp-classroom-manage-item-actions">
                    <Button
                      type="primary"
                      size="small"
                      icon={<ExpandAltOutlined />}
                      disabled={item.status !== "done" || !item.has_result}
                      onClick={() => void openClassroom(item)}
                    >
                      查看
                    </Button>
                    <Button
                      size="small"
                      loading={actingId === item.id}
                      onClick={() => void toggleFavorite(item)}
                    >
                      {item.is_favorite ? "取消收藏" : "收藏"}
                    </Button>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={actingId === item.id}
                      onClick={() => handleRegenerate(item)}
                    >
                      重新生成
                    </Button>
                    <Button
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      loading={actingId === item.id}
                      onClick={() => handleDelete(item)}
                    >
                      删除
                    </Button>
                  </Space>
                )}
              </div>
            </div>
          </List.Item>
        )}
      />
    </Drawer>
  );
}
