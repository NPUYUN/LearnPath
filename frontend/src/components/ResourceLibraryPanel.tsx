"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Input,
  Modal,
  Space,
  Tag,
  Typography,
  Upload,
  message,
  Spin,
  Empty,
} from "antd";
import {
  CloudUploadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  PlusOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import {
  createLibrary,
  deleteLibrary,
  getSupportedUploadFormats,
  listLibraries,
  uploadLibraryFiles,
  type ResourceLibrary,
} from "@/lib/api";
import { useAppStore } from "@/store/appStore";

const { Text, Paragraph } = Typography;

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ready: { label: "可用", color: "success" },
  empty: { label: "空库", color: "default" },
  processing: { label: "处理中", color: "processing" },
  error: { label: "异常", color: "error" },
};

type ResourceLibraryPanelProps = {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export default function ResourceLibraryPanel({
  selectedId,
  onSelect,
}: ResourceLibraryPanelProps) {
  const userId = useAppStore((s) => s.userId);
  const [libraries, setLibraries] = useState<ResourceLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [extensions, setExtensions] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listLibraries(userId);
      setLibraries(list);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "加载资料库失败");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    void getSupportedUploadFormats()
      .then((r) => setExtensions(r.extensions))
      .catch(() => {});
  }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      message.warning("请输入资料库名称");
      return;
    }
    try {
      const lib = await createLibrary(userId, newName.trim(), newDesc.trim());
      message.success(`已创建资料库「${lib.name}」`);
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      await load();
      onSelect(lib.id);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "创建失败");
    }
  };

  const handleUpload = async (libraryId: string, fileList: UploadFile[]) => {
    const files = fileList.map((f) => f.originFileObj).filter(Boolean) as File[];
    if (!files.length) return;
    setUploading(true);
    const msgKey = "lib-upload";
    message.loading({ content: "正在上传并分析文件…", key: msgKey, duration: 0 });
    try {
      const res = await uploadLibraryFiles(userId, libraryId, files);
      message.destroy(msgKey);
      if (res.errors?.length) {
        message.warning(`部分文件失败：${res.errors.join("；")}`);
      }
      message.success(
        `已入库 ${res.file_count} 个文件，新增 ${res.ingested_chunks} 个知识片段`
      );
      await load();
    } catch (e: unknown) {
      message.destroy(msgKey);
      message.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (lib: ResourceLibrary) => {
    if (lib.source_type === "builtin") return;
    Modal.confirm({
      title: `删除资料库「${lib.name}」？`,
      content: "删除后无法恢复，已向量化的内容将不可用于生成。",
      okType: "danger",
      onOk: async () => {
        await deleteLibrary(userId, lib.id);
        if (selectedId === lib.id) onSelect(null);
        message.success("已删除");
        await load();
      },
    });
  };

  if (loading) {
    return (
      <div className="lp-resource-empty">
        <Spin tip="加载资料库…" />
      </div>
    );
  }

  return (
    <div className="lp-library-panel">
      <div className="lp-library-panel-head">
        <div>
          <Text strong className="lp-library-panel-title">
            课程资料库
          </Text>
          <Paragraph type="secondary" className="lp-library-panel-desc">
            上传课件、讲义、代码等文件，经大模型分析后形成 RAG 资料库；生成资源时可选择依据哪个资料库。
          </Paragraph>
          {extensions.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              支持：{extensions.slice(0, 12).join(" ")}
              {extensions.length > 12 ? " …" : ""}
            </Text>
          )}
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建资料库
        </Button>
      </div>

      {libraries.length === 0 ? (
        <Empty description="暂无资料库" />
      ) : (
        <div className="lp-library-grid">
          {libraries.map((lib) => {
            const st = STATUS_LABEL[lib.status] || STATUS_LABEL.empty;
            const selected = selectedId === lib.id;
            return (
              <Card
                key={lib.id}
                className={`lp-library-card${selected ? " lp-library-card--selected" : ""}`}
                hoverable
                onClick={() => onSelect(selected ? null : lib.id)}
              >
                <div className="lp-library-card-top">
                  <span className="lp-library-card-icon">
                    {lib.source_type === "builtin" ? <DatabaseOutlined /> : <FolderOpenOutlined />}
                  </span>
                  <div className="lp-library-card-meta">
                    <Text strong>{lib.name}</Text>
                    <Space size={4} wrap>
                      <Tag color={st.color}>{st.label}</Tag>
                      {lib.source_type === "builtin" && <Tag>内置</Tag>}
                      {lib.course && <Tag color="blue">{lib.course}</Tag>}
                    </Space>
                  </div>
                </div>
                {lib.description && (
                  <Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2 }}
                    className="lp-library-card-desc"
                  >
                    {lib.description}
                  </Paragraph>
                )}
                <div className="lp-library-card-stats">
                  <span>{lib.file_count} 文件</span>
                  <span>{lib.chunk_count} 片段</span>
                </div>
                {lib.source_type === "upload" && (
                  <div className="lp-library-card-actions" onClick={(e) => e.stopPropagation()}>
                    <Upload
                      multiple
                      showUploadList={false}
                      beforeUpload={() => false}
                      onChange={(info) => {
                        if (info.fileList.length && !uploading) {
                          void handleUpload(lib.id, info.fileList);
                        }
                      }}
                    >
                      <Button
                        size="small"
                        icon={<CloudUploadOutlined />}
                        loading={uploading && selectedId === lib.id}
                      >
                        上传文件
                      </Button>
                    </Upload>
                    <Button
                      size="small"
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => void handleDelete(lib)}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title="新建资料库"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
        okText="创建"
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Input
            placeholder="资料库名称，如：深度学习课程讲义"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input.TextArea
            placeholder="可选：简介"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={3}
          />
        </Space>
      </Modal>
    </div>
  );
}
