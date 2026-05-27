"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Empty,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import CloudUploadOutlined from "@ant-design/icons/CloudUploadOutlined";
import DatabaseOutlined from "@ant-design/icons/DatabaseOutlined";
import FileOutlined from "@ant-design/icons/FileOutlined";
import FilePdfOutlined from "@ant-design/icons/FilePdfOutlined";
import FileWordOutlined from "@ant-design/icons/FileWordOutlined";
import FileExcelOutlined from "@ant-design/icons/FileExcelOutlined";
import FilePptOutlined from "@ant-design/icons/FilePptOutlined";
import FileMarkdownOutlined from "@ant-design/icons/FileMarkdownOutlined";
import FileTextOutlined from "@ant-design/icons/FileTextOutlined";
import FileImageOutlined from "@ant-design/icons/FileImageOutlined";
import {
  getLibraryDetail,
  uploadLibraryFiles,
  type LibraryDetail,
  type LibraryFileItem,
} from "@/lib/api";
import { useAppStore } from "@/store/appStore";

const { Text, Paragraph, Title } = Typography;

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ready: { label: "可用", color: "success" },
  empty: { label: "空库", color: "default" },
  processing: { label: "处理中", color: "processing" },
  error: { label: "异常", color: "error" },
};

const FILE_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ready: { label: "已入库", color: "success" },
  ingested: { label: "已入库", color: "success" },
  pending: { label: "待处理", color: "default" },
  processing: { label: "处理中", color: "processing" },
  error: { label: "失败", color: "error" },
};

type FileCategoryKey = "all" | "markdown" | "word" | "pdf" | "ppt" | "excel" | "code" | "other";

const FILE_CATEGORIES: {
  key: FileCategoryKey;
  label: string;
  exts: string[] | null;
}[] = [
  { key: "all", label: "全部", exts: null },
  { key: "markdown", label: "Markdown", exts: ["md", "markdown"] },
  { key: "word", label: "Word", exts: ["doc", "docx"] },
  { key: "pdf", label: "PDF", exts: ["pdf"] },
  { key: "ppt", label: "PPT", exts: ["ppt", "pptx"] },
  { key: "excel", label: "Excel", exts: ["xls", "xlsx", "csv"] },
  {
    key: "code",
    label: "代码 / 文本",
    exts: ["py", "java", "c", "cpp", "h", "hpp", "go", "rs", "txt", "json", "html", "htm"],
  },
  { key: "other", label: "其他", exts: [] },
];

function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function categorizeFile(filename: string): FileCategoryKey {
  const ext = fileExtension(filename);
  for (const cat of FILE_CATEGORIES) {
    if (cat.key === "all" || cat.key === "other") continue;
    if (cat.exts?.includes(ext)) return cat.key;
  }
  return "other";
}

function FileTypeIcon({ filename }: { filename: string }) {
  const ext = fileExtension(filename);
  const cls = "lp-library-file-icon";
  if (ext === "pdf") return <FilePdfOutlined className={cls} />;
  if (ext === "doc" || ext === "docx") return <FileWordOutlined className={cls} />;
  if (ext === "xls" || ext === "xlsx") return <FileExcelOutlined className={cls} />;
  if (ext === "ppt" || ext === "pptx") return <FilePptOutlined className={cls} />;
  if (ext === "md" || ext === "markdown") return <FileMarkdownOutlined className={cls} />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return <FileImageOutlined className={cls} />;
  if (["txt", "csv", "json", "py", "java", "c", "cpp", "html"].includes(ext))
    return <FileTextOutlined className={cls} />;
  return <FileOutlined className={cls} />;
}

type LibraryDetailPageProps = {
  libraryId: string;
};

export default function LibraryDetailPage({ libraryId }: LibraryDetailPageProps) {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const [detail, setDetail] = useState<LibraryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FileCategoryKey>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLibraryDetail(userId, libraryId);
      if (!data) {
        message.error("资料库不存在");
        router.push("/resources");
        return;
      }
      setDetail(data);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "加载失败");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [userId, libraryId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const countsByCategory = useMemo(() => {
    const counts: Record<FileCategoryKey, number> = {
      all: 0,
      markdown: 0,
      word: 0,
      pdf: 0,
      ppt: 0,
      excel: 0,
      code: 0,
      other: 0,
    };
    if (!detail?.files) return counts;
    counts.all = detail.files.length;
    for (const f of detail.files) {
      counts[categorizeFile(f.filename)] += 1;
    }
    return counts;
  }, [detail?.files]);

  const filteredFiles = useMemo(() => {
    if (!detail?.files) return [];
    if (activeCategory === "all") return detail.files;
    return detail.files.filter((f) => categorizeFile(f.filename) === activeCategory);
  }, [detail?.files, activeCategory]);

  const handleBack = () => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("lp-resources-tab", "libraries");
    }
    router.push("/resources");
  };

  const handleUpload = async (fileList: UploadFile[]) => {
    const files = fileList.map((f) => f.originFileObj).filter(Boolean) as File[];
    if (!files.length) return;
    setUploading(true);
    const msgKey = "lib-detail-upload";
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

  const fileColumns: ColumnsType<LibraryFileItem> = [
    {
      title: "文件名",
      dataIndex: "filename",
      key: "filename",
      render: (name: string) => (
        <Space size={8}>
          <FileTypeIcon filename={name} />
          <Text className="lp-library-file-name">{name}</Text>
        </Space>
      ),
    },
    {
      title: "类型",
      key: "type",
      width: 88,
      render: (_: unknown, row: LibraryFileItem) => {
        const ext = fileExtension(row.filename) || "—";
        return <Tag className="lp-library-file-ext">{ext.toUpperCase()}</Tag>;
      },
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 96,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => {
        const st = FILE_STATUS_LABEL[status] || { label: status || "—", color: "default" };
        return <Tag color={st.color}>{st.label}</Tag>;
      },
    },
  ];

  if (loading) {
    return (
      <div className="lp-library-detail-page lp-library-detail-page--loading">
        <Spin tip="加载资料库…" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="lp-library-detail-page">
        <Empty description="无法加载资料库" />
        <Button type="link" onClick={handleBack}>
          返回资料库列表
        </Button>
      </div>
    );
  }

  const st = STATUS_LABEL[detail.status] || STATUS_LABEL.empty;
  const activeCatLabel =
    FILE_CATEGORIES.find((c) => c.key === activeCategory)?.label ?? "全部";

  return (
    <div className="lp-library-detail-page">
      <div className="lp-library-detail-page-head">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          className="lp-library-detail-back"
          onClick={handleBack}
        >
          返回课程资料库
        </Button>
        <div className="lp-library-detail-page-hero">
          <div className="lp-library-detail-page-icon">
            {detail.source_type === "builtin" ? <DatabaseOutlined /> : <FileOutlined />}
          </div>
          <div className="lp-library-detail-page-meta">
            <Title level={3} className="lp-library-detail-page-title">
              {detail.name}
            </Title>
            {detail.description && (
              <Paragraph type="secondary" className="lp-library-detail-page-desc">
                {detail.description}
              </Paragraph>
            )}
            <Space size={6} wrap>
              <Tag color={st.color}>{st.label}</Tag>
              {detail.source_type === "builtin" && <Tag>内置</Tag>}
              {detail.course && <Tag color="blue">{detail.course}</Tag>}
              <Text type="secondary" style={{ fontSize: 12 }}>
                共 {detail.files.length} 个文件 · {detail.chunk_count} 个知识片段
              </Text>
            </Space>
          </div>
          {detail.source_type === "upload" && (
            <Upload
              multiple
              showUploadList={false}
              beforeUpload={() => false}
              onChange={(info) => {
                if (info.fileList.length && !uploading) {
                  void handleUpload(info.fileList);
                }
              }}
            >
              <Button type="primary" icon={<CloudUploadOutlined />} loading={uploading}>
                上传文件
              </Button>
            </Upload>
          )}
        </div>
      </div>

      <div className="lp-library-type-bar">
        <Text className="lp-library-type-bar-label">按类型浏览</Text>
        <div className="lp-library-type-chips">
          {FILE_CATEGORIES.map((cat) => {
            const count = countsByCategory[cat.key];
            const active = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                className={`lp-library-type-chip${active ? " lp-library-type-chip--active" : ""}`}
                onClick={() => setActiveCategory(cat.key)}
              >
                {cat.label}
                <span className="lp-library-type-chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="lp-library-detail-page-body">
        <div className="lp-library-detail-page-section-title">
          <Text strong>
            {activeCategory === "all" ? "全部文件" : `${activeCatLabel} 文档`}
          </Text>
          <Text type="secondary">（{filteredFiles.length} 个）</Text>
        </div>

        {filteredFiles.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              activeCategory === "all"
                ? detail.source_type === "upload"
                  ? "暂无文件，请上传 PDF、Word、Markdown 等课件"
                  : "该类型下暂无文件"
                : `暂无 ${activeCatLabel} 文件，可切换其他类型或上传资料`
            }
          />
        ) : (
          <Table<LibraryFileItem>
            className="lp-library-file-table"
            rowKey="id"
            size="middle"
            pagination={
              filteredFiles.length > 15
                ? { pageSize: 15, showSizeChanger: false, size: "small" }
                : false
            }
            columns={fileColumns}
            dataSource={filteredFiles}
          />
        )}
      </div>
    </div>
  );
}
