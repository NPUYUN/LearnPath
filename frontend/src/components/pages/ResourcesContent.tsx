"use client";

import { useEffect, useState } from "react";
import {
  Card,
  Tabs,
  Tag,
  Button,
  Typography,
  Row,
  Col,
  Modal,
  Tooltip,
  Space,
  Input,
  Spin,
  message,
} from "antd";
import StarOutlined from "@ant-design/icons/StarOutlined";
import DownloadOutlined from "@ant-design/icons/DownloadOutlined";
import EyeOutlined from "@ant-design/icons/EyeOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import SearchOutlined from "@ant-design/icons/SearchOutlined";
import StarFilled from "@ant-design/icons/StarFilled";
import dynamic from "next/dynamic";
import {
  generateResources,
  listResources,
  type LearningResource,
} from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { RESOURCE_CONFIG, mapApiType, type UiResourceType } from "@/lib/resourceConfig";
import { useAppStore } from "@/store/appStore";
import BookOutlined from "@ant-design/icons/BookOutlined";

const MarkdownPreview = dynamic(() => import("@/components/MarkdownPreview"), {
  loading: () => <Spin />,
  ssr: false,
});

const { Title, Text } = Typography;

const TABS = [
  { key: "all", label: "全部" },
  { key: "document", label: "📄 讲解文档" },
  { key: "mindmap", label: "🗺️ 思维导图" },
  { key: "quiz", label: "📝 练习题库" },
  { key: "video", label: "🎬 多模态讲解" },
  { key: "code", label: "💻 代码案例" },
  { key: "reading", label: "📖 拓展阅读" },
];

export default function ResourcesContent() {
  const userId = useAppStore((s) => s.userId);
  const cachedResources = useAppStore((s) => s.resources);
  const setResources = useAppStore((s) => s.setResources);
  const [items, setItems] = useState<LearningResource[]>(cachedResources);
  const [loading, setLoading] = useState(cachedResources.length === 0);
  const [generating, setGenerating] = useState(false);
  const [activeType, setActiveType] = useState("all");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<LearningResource | null>(null);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [topic, setTopic] = useState("线性回归");

  const load = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const list = await listResources(userId);
      setItems(list);
      setResources(list);
    } catch {
      if (!background) setItems(cachedResources);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cachedResources.length > 0) {
      setItems(cachedResources);
      setLoading(false);
      return;
    }
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cachedResources.length]);

  const filtered = items.filter((r) => {
    const ui = mapApiType(r.type);
    const matchType = activeType === "all" || ui === activeType;
    const q = search.trim();
    const matchSearch =
      !q || r.title.includes(q) || r.topic.includes(q) || r.content.includes(q);
    return matchType && matchSearch;
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const list = await generateResources(userId, topic);
      setItems(list);
      setResources(list);
      message.success(`已生成 ${list.length} 项资源`);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="学习资源库"
        subtitle={`${items.length} 个资源 · 多智能体协同生成`}
        icon={<BookOutlined />}
        extra={
        <Space wrap>
          <Input
            prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
            placeholder="搜索资源..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200, borderRadius: 8 }}
            allowClear
          />
          <Input
            placeholder="生成主题"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={{ width: 140, borderRadius: 8 }}
          />
          <Button
            icon={<PlusOutlined />}
            type="primary"
            loading={generating}
            onClick={handleGenerate}
          >
            生成新资源
          </Button>
        </Space>
        }
      />
      <div className="lp-page-body" style={{ maxWidth: 1100 }}>
      <Tabs activeKey={activeType} onChange={setActiveType} items={TABS} style={{ marginBottom: 16 }} />

      {loading && items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#bfbfbf" }}>
          暂无资源，点击「生成新资源」或由智能对话触发
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map((r) => {
            const uiType = mapApiType(r.type) as UiResourceType;
            const cfg = RESOURCE_CONFIG[uiType];
            return (
              <Col key={r.id} xs={24} sm={12} lg={8}>
                <Card
                  hoverable
                  style={{ borderTop: `3px solid ${cfg.color}` }}
                  actions={[
                    <Tooltip title={starred[r.id] ? "取消收藏" : "收藏"} key="star">
                      <Button
                        type="text"
                        size="small"
                        icon={
                          starred[r.id] ? (
                            <StarFilled style={{ color: "#faad14" }} />
                          ) : (
                            <StarOutlined />
                          )
                        }
                        onClick={() =>
                          setStarred((s) => ({ ...s, [r.id]: !s[r.id] }))
                        }
                      />
                    </Tooltip>,
                    <Tooltip title="预览" key="view">
                      <Button
                        type="text"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => setPreview(r)}
                      />
                    </Tooltip>,
                    <Tooltip title="下载" key="dl">
                      <Button type="text" size="small" icon={<DownloadOutlined />} />
                    </Tooltip>,
                  ]}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: `${cfg.color}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: cfg.color,
                        fontSize: 18,
                        flexShrink: 0,
                      }}
                    >
                      {cfg.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ fontSize: 14, display: "block", lineHeight: 1.4 }}>
                        {r.title}
                      </Text>
                      <div style={{ marginTop: 4 }}>
                        <Tag color="blue" style={{ fontSize: 11 }}>
                          {cfg.label}
                        </Tag>
                        {r.topic && (
                          <Tag style={{ fontSize: 11 }}>{r.topic}</Tag>
                        )}
                      </div>
                    </div>
                  </div>
                  {r.sources?.length > 0 && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      引用 {r.sources.length} 处
                    </Text>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Modal
        open={!!preview}
        onCancel={() => setPreview(null)}
        footer={[
          <Button key="close" onClick={() => setPreview(null)}>
            关闭
          </Button>,
          <Button key="dl" icon={<DownloadOutlined />} type="primary">
            下载
          </Button>,
        ]}
        title={
          preview && (
            <span>
              <span style={{ color: RESOURCE_CONFIG[mapApiType(preview.type)].color, marginRight: 8 }}>
                {RESOURCE_CONFIG[mapApiType(preview.type)].icon}
              </span>
              {preview.title}
            </span>
          )
        }
        width={720}
      >
        {preview && (
          <div
            className="md-content"
            style={{ maxHeight: "60vh", overflowY: "auto", padding: "0 4px" }}
          >
            <MarkdownPreview content={preview.content} />
          </div>
        )}
      </Modal>
      </div>
    </div>
  );
}
