"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Typography,
  Modal,
  Input,
  Spin,
  message,
  Radio,
  Select,
  Upload,
  Progress,
  InputNumber,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import CloudUploadOutlined from "@ant-design/icons/CloudUploadOutlined";
import ResourcePreviewDrawer from "@/components/ResourcePreviewDrawer";
import { setReplanLibraryId } from "@/lib/replanPrefs";
import {
  deleteResource,
  getRecommendations,
  getPreferences,
  listResources,
  patchPreferences,
  recordResourceComplete,
  streamGenerateResources,
  listLibraries,
  createLibrary,
  uploadLibraryFiles,
  type LearningResource,
  type ResourceRecommendation,
  type ResourceLibrary,
} from "@/lib/api";
import {
  GENERATABLE_RESOURCE_TYPES,
  mapApiType,
  RESOURCE_CONFIG,
} from "@/lib/resourceConfig";
import {
  allGenTypeCounts,
  buildGenProgressStages,
  clampGenTypeCount,
  emptyGenTypeCounts,
  expandGenTypeCounts,
  formatGenStageLabel,
  MAX_RESOURCE_GEN_PER_TYPE,
  normalizeGenTypeCounts,
  standardGenTypeCounts,
  totalGenCount,
  type ResourceGenTypeCounts,
} from "@/lib/resourceGenCounts";
import {
  filterGroupedResources,
  groupResourcesByStage,
  STAGE_STATUS_META,
} from "@/lib/resourceGrouping";
import PageHeader from "@/components/PageHeader";
import ResourceLibraryPanel from "@/components/ResourceLibraryPanel";
import { ResourceJourneyView } from "@/components/ResourceJourneyView";
import { useAppStore } from "@/store/appStore";
import { useSupportedUploadFormats } from "@/hooks/useSupportedUploadFormats";
import { startResourceRegenerationTask } from "@/lib/resourceRegenerationTask";
import {
  buildUploadAccept,
  formatExtensionsHint,
  isAllowedUploadFile,
} from "@/lib/uploadFormats";
import { useSettingsStore } from "@/store/settingsStore";
import { downloadResourceMarkdown } from "@/lib/downloadResource";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import SearchOutlined from "@ant-design/icons/SearchOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import CompassOutlined from "@ant-design/icons/CompassOutlined";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import CloseOutlined from "@ant-design/icons/CloseOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import DownloadOutlined from "@ant-design/icons/DownloadOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import ArrowRightOutlined from "@ant-design/icons/ArrowRightOutlined";
import SettingOutlined from "@ant-design/icons/SettingOutlined";
import StarOutlined from "@ant-design/icons/StarOutlined";

const { Text } = Typography;

type GenSource = "web" | "library" | "new" | "";

const CATEGORY_CHIPS = [
  { key: "all", label: "全部类型" },
  { key: "document", label: "讲解文档" },
  { key: "mindmap", label: "思维导图" },
  { key: "quiz", label: "练习题库" },
  { key: "video", label: "多模态讲解" },
  { key: "code", label: "代码案例" },
  { key: "reading", label: "拓展阅读" },
  { key: "ppt", label: "课件提纲" },
  { key: "design", label: "设计方案" },
  { key: "project", label: "实践项目" },
];

const GEN_STAGE_LABELS: Record<string, string> = {
  context: "准备资料上下文",
  web_research: "全网检索整理",
  doc: "讲解文档",
  mindmap: "思维导图",
  quiz: "练习题库",
  reading: "拓展阅读",
  media: "多模态讲解",
  code: "代码案例",
  ppt: "课件提纲",
  design: "资源设计方案",
  project: "实践项目",
  reviewer: "质量复审",
  deep_thinking: "深度生成中",
  fast_resource: "快速生成中",
};

export default function ResourcesContent() {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const learningPath = useAppStore((s) => s.learningPath);
  const cachedResources = useAppStore((s) => s.resources);
  const setResources = useAppStore((s) => s.setResources);
  const setResourceTitles = useAppStore((s) => s.setResourceTitles);
  const deepThinking = useSettingsStore((s) => s.deepThinking);
  const pendingPreviewId = useAppStore((s) => s.pendingResourcePreviewId);
  const setPendingPreviewId = useAppStore((s) => s.setPendingResourcePreviewId);
  const [items, setItems] = useState<LearningResource[]>(cachedResources);
  const [loading, setLoading] = useState(cachedResources.length === 0);
  const [generating, setGenerating] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [genStage, setGenStage] = useState("");
  const [genProgress, setGenProgress] = useState(0);
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [pageTab, setPageTab] = useState("resources");
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<ResourceRecommendation[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem("lp-resources-tab") === "libraries") {
      setPageTab("libraries");
      sessionStorage.removeItem("lp-resources-tab");
    }
  }, []);
  const [libraries, setLibraries] = useState<ResourceLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [genSource, setGenSource] = useState<GenSource>("");
  const [newLibraryName, setNewLibraryName] = useState("");
  const [genTypeCounts, setGenTypeCounts] = useState<ResourceGenTypeCounts>(standardGenTypeCounts);
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const uploadExtensions = useSupportedUploadFormats(genModalOpen);
  const [preparingLibrary, setPreparingLibrary] = useState(false);
  const [previewResource, setPreviewResource] = useState<LearningResource | null>(null);
  const [regenResource, setRegenResource] = useState<LearningResource | null>(null);
  const [regenTags, setRegenTags] = useState<string[]>([]);
  const [regenRequirement, setRegenRequirement] = useState("");

  const REGEN_TAGS = [
    "难度提高",
    "更通俗一点",
    "多些例题",
    "增加步骤拆解",
    "贴近当前路径",
    "加入小测",
    "加代码示例",
    "减少废话",
  ];

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

  const resetGenForm = () => {
    const defaultTopic =
      activeStep?.title || learningPath?.steps?.[0]?.title || "";
    setTopic(defaultTopic);
    setGenSource("web");
    setSelectedLibraryId(null);
    setNewLibraryName("");
    setPendingFiles([]);
    setGenTypeCounts(standardGenTypeCounts());
  };

  const openGenModal = () => {
    resetGenForm();
    setGenModalOpen(true);
  };

  const openResourceById = (id: string) => {
    router.push(`/resources/view/${encodeURIComponent(id)}`);
  };

  const openPreview = (r: LearningResource) => {
    setPreviewResource(r);
  };

  const syncResourceList = (next: LearningResource[]) => {
    setItems(next);
    setResources(next);
    const titles: Record<string, string> = {};
    next.forEach((item) => {
      titles[item.id] = item.title;
    });
    setResourceTitles(titles);
  };

  const loadRecommendations = async (background = false) => {
    if (!background) setRecommendationLoading(true);
    try {
      const list = await getRecommendations(userId, 3);
      setRecommendations(list);
    } catch {
      setRecommendations([]);
    } finally {
      setRecommendationLoading(false);
    }
  };

  const handleDeleteResource = (r: LearningResource) => {
    Modal.confirm({
      title: `删除「${r.title}」？`,
      content: "删除后无法恢复，学习路径中的关联也会移除。",
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteResource(userId, r.id);
          const next = items.filter((x) => x.id !== r.id);
          syncResourceList(next);
          setSelectedIds((prev) => prev.filter((id) => id !== r.id));
          setRecommendations((prev) => prev.filter((rec) => rec.id !== r.id));
          if (starredIds.includes(r.id)) {
            const ids = starredIds.filter((x) => x !== r.id);
            setStarredIds(ids);
            await patchPreferences(userId, { starred_resource_ids: ids });
          }
          void loadRecommendations(true);
          message.success("已删除");
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : "删除失败");
        }
      },
    });
  };

  useEffect(() => {
    void getPreferences(userId)
      .then((p) => setStarredIds(p.starred_resource_ids || []))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    setItems(cachedResources);
    if (cachedResources.length > 0) {
      setLoading(false);
    }
  }, [cachedResources]);

  useEffect(() => {
    setItems([]);
    setLoading(true);
    setManageMode(false);
    setSelectedIds([]);
    setRecommendations([]);
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const itemIds = new Set(items.map((item) => item.id));
      const next = prev.filter((id) => itemIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [items]);

  useEffect(() => {
    if (pageTab !== "resources" || items.length === 0) {
      setRecommendations([]);
      return;
    }
    void loadRecommendations(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pageTab, items.length]);

  useEffect(() => {
    if (!pendingPreviewId) return;
    const id = pendingPreviewId;
    setPendingPreviewId(null);
    const hit = items.find((r) => r.id === id) ?? cachedResources.find((r) => r.id === id);
    if (hit) {
      setPreviewResource(hit);
    } else {
      openResourceById(id);
    }
  }, [pendingPreviewId, router, setPendingPreviewId, items, cachedResources]);

  const toggleStar = async (id: string) => {
    const next = starredIds.includes(id)
      ? starredIds.filter((x) => x !== id)
      : [...starredIds, id];
    setStarredIds(next);
    try {
      await patchPreferences(userId, { starred_resource_ids: next });
      message.success(next.includes(id) ? "已收藏" : "已取消收藏");
    } catch {
      setStarredIds(starredIds);
      message.error("收藏同步失败");
    }
  };

  const grouped = useMemo(
    () => groupResourcesByStage(items, learningPath),
    [items, learningPath]
  );

  const filteredGrouped = useMemo(
    () => filterGroupedResources(grouped, { search, category: activeCategory }),
    [grouped, search, activeCategory]
  );

  const pathSteps = learningPath?.steps ?? [];
  const doneSteps = pathSteps.filter((s) => s.status === "done").length;
  const activeStep = pathSteps.find((s) => s.status === "in_progress");
  const visibleCount = filteredGrouped.stages.reduce((n, s) => n + s.resourceCount, 0);
  const visibleResources = useMemo(() => {
    const resourceMap = new Map<string, LearningResource>();
    filteredGrouped.stages.forEach((stage) => {
      stage.categories.forEach((category) => {
        category.resources.forEach((resource) => {
          resourceMap.set(resource.id, resource);
        });
      });
    });
    return Array.from(resourceMap.values());
  }, [filteredGrouped]);
  const selectedResources = useMemo(() => {
    const idSet = new Set(selectedIds);
    return items.filter((resource) => idSet.has(resource.id));
  }, [items, selectedIds]);
  const recommendationCards = useMemo(
    () =>
      recommendations.map((rec) => {
        const resource = items.find((item) => item.id === rec.id);
        const uiType = mapApiType(resource?.type || rec.type);
        return {
          rec,
          resource,
          cfg: RESOURCE_CONFIG[uiType],
        };
      }),
    [items, recommendations]
  );
  const selectedCount = selectedResources.length;
  const allVisibleSelected =
    visibleResources.length > 0 &&
    visibleResources.every((resource) => selectedIds.includes(resource.id));

  const toggleManageMode = () => {
    const next = !manageMode;
    setManageMode(next);
    if (!next) setSelectedIds([]);
  };

  const toggleResourceSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectVisibleResources = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visibleResources.forEach((resource) => next.add(resource.id));
      return Array.from(next);
    });
  };

  const clearSelection = () => setSelectedIds([]);

  const handleBatchStar = async (star: boolean) => {
    if (!selectedCount) return;
    const selectedIdSet = new Set(selectedResources.map((resource) => resource.id));
    const next = star
      ? Array.from(new Set([...starredIds, ...Array.from(selectedIdSet)]))
      : starredIds.filter((id) => !selectedIdSet.has(id));

    setStarredIds(next);
    try {
      await patchPreferences(userId, { starred_resource_ids: next });
      message.success(star ? `已收藏 ${selectedCount} 项` : `已取消收藏 ${selectedCount} 项`);
    } catch {
      setStarredIds(starredIds);
      message.error("收藏同步失败");
    }
  };

  const handleBatchComplete = async () => {
    if (!selectedCount) return;
    const key = "resource-batch-complete";
    message.loading({ content: `正在标记 ${selectedCount} 项资源...`, key, duration: 0 });
    try {
      await Promise.all(
        selectedResources.map((resource) => recordResourceComplete(userId, resource.id))
      );
      message.destroy(key);
      message.success(`已标记完成 ${selectedCount} 项`);
      void loadRecommendations(true);
    } catch (e: unknown) {
      message.destroy(key);
      message.error(e instanceof Error ? e.message : "标记完成失败");
    }
  };

  const handleDownloadResource = async (r: LearningResource) => {
    const hide = message.loading(`正在准备「${r.title}」…`, 0);
    try {
      const result = await downloadResourceMarkdown(userId, r);
      hide();
      if (result.cancelled) return;
      if (result.ok) {
        message.success(`「${r.title}」${result.saveHint || "已保存到所选位置"}`);
      } else {
        message.warning(result.error || "另存为失败");
      }
    } catch (e: unknown) {
      hide();
      message.error(e instanceof Error ? e.message : "另存为失败");
    }
  };

  const openRegenerateModal = (r: LearningResource) => {
    setRegenResource(r);
    setRegenTags([]);
    setRegenRequirement("");
  };

  const closeRegenerateModal = () => {
    setRegenResource(null);
    setRegenTags([]);
    setRegenRequirement("");
  };

  const toggleRegenTag = (tag: string) => {
    setRegenTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const runRegenerateResource = () => {
    if (!regenResource) return;
    if (!regenRequirement.trim() && regenTags.length === 0) {
      message.warning("请选择一个修改方向，或写下你的具体要求");
      return;
    }

    const started = startResourceRegenerationTask({
      userId,
      resource: regenResource,
      requirements: regenRequirement.trim(),
      tags: regenTags,
    });
    if (started) {
      setRegenResource(null);
      setRegenTags([]);
      setRegenRequirement("");
    }
  };

  const handleBatchDownload = async () => {
    if (!selectedCount) return;
    const hide = message.loading(`正在准备另存为 ${selectedCount} 项…`, 0);
    let okCount = 0;
    let cancelledCount = 0;
    for (const r of selectedResources) {
      const result = await downloadResourceMarkdown(userId, r);
      if (result.cancelled) cancelledCount += 1;
      else if (result.ok) okCount += 1;
    }
    hide();
    if (okCount === selectedCount) {
      message.success(`已另存为 ${okCount} 项`);
    } else if (okCount > 0) {
      message.warning(
        `已保存 ${okCount}/${selectedCount} 项${cancelledCount ? `，${cancelledCount} 项已取消` : ""}`,
      );
    } else if (cancelledCount === selectedCount) {
      return;
    } else {
      message.error("另存为失败，请重试");
    }
  };

  const handleBatchDelete = () => {
    if (!selectedCount) return;
    Modal.confirm({
      title: `删除选中的 ${selectedCount} 项资源？`,
      content: "删除后无法恢复，学习路径中的关联也会移除。",
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        const selectedIdSet = new Set(selectedResources.map((resource) => resource.id));
        try {
          await Promise.all(
            selectedResources.map((resource) => deleteResource(userId, resource.id))
          );
          const next = items.filter((resource) => !selectedIdSet.has(resource.id));
          syncResourceList(next);
          setSelectedIds((prev) => prev.filter((id) => !selectedIdSet.has(id)));
          setRecommendations((prev) => prev.filter((rec) => !selectedIdSet.has(rec.id)));
          if (starredIds.some((id) => selectedIdSet.has(id))) {
            const ids = starredIds.filter((id) => !selectedIdSet.has(id));
            setStarredIds(ids);
            await patchPreferences(userId, { starred_resource_ids: ids });
          }
          message.success(`已删除 ${selectedCount} 项`);
          void loadRecommendations(true);
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : "批量删除失败");
        }
      },
    });
  };

  useEffect(() => {
    void listLibraries(userId)
      .then(setLibraries)
      .catch(() => {});
  }, [userId, pageTab, genModalOpen]);

  const setGenTypeCount = (apiType: string, value: number | null) => {
    setGenTypeCounts((prev) => ({
      ...prev,
      [apiType]: clampGenTypeCount(value),
    }));
  };

  const buildGenerateOptions = async (): Promise<{
    resourceTypes: string[];
    resourceTypeCounts: ResourceGenTypeCounts;
    libraryId?: string;
    newLibraryName?: string;
    deepThinking?: boolean;
  }> => {
    const counts = normalizeGenTypeCounts(genTypeCounts);
    const base = { deepThinking, resourceTypeCounts: counts, resourceTypes: expandGenTypeCounts(counts) };
    if (genSource === "new") {
      if (!newLibraryName.trim()) {
        throw new Error("请输入新资料库名称");
      }
      const files = pendingFiles
        .map((f) => f.originFileObj)
        .filter(Boolean) as File[];
      if (files.length > 0) {
        setPreparingLibrary(true);
        setGenStage("正在创建资料库并上传文件…");
        setGenProgress(8);
        try {
          const lib = await createLibrary(userId, newLibraryName.trim());
          setGenProgress(12);
          setGenStage("正在解析文件并写入资料库…");
          await uploadLibraryFiles(userId, lib.id, files);
          setGenProgress(18);
          setGenStage("文件已入库，正在启动资源生成…");
          setSelectedLibraryId(lib.id);
          setGenSource("library");
          setLibraries((prev) => [lib, ...prev.filter((x) => x.id !== lib.id)]);
          return { ...base, libraryId: lib.id };
        } finally {
          setPreparingLibrary(false);
        }
      }
      return {
        ...base,
        newLibraryName: newLibraryName.trim(),
      };
    }
    if (genSource === "library" && selectedLibraryId) {
      return { ...base, libraryId: selectedLibraryId };
    }
    return base;
  };

  const runCreateLibrary = async () => {
    if (!newLibraryName.trim()) {
      message.warning("请输入新资料库名称");
      return;
    }
    const files = pendingFiles
      .map((f) => f.originFileObj)
      .filter(Boolean) as File[];
    if (!files.length) {
      message.warning("请选择要上传的文件");
      return;
    }

    setPreparingLibrary(true);
    setGenStage("正在创建资料库…");
    setGenProgress(10);
    const msgKey = "library-create";
    message.loading({ content: "正在创建资料库并入库…", key: msgKey, duration: 0 });
    try {
      const lib = await createLibrary(userId, newLibraryName.trim());
      setGenProgress(35);
      setGenStage("正在解析文件并写入资料库…");
      const res = await uploadLibraryFiles(userId, lib.id, files);
      setGenProgress(100);
      message.destroy(msgKey);
      if (res.errors?.length) {
        message.warning(`部分文件失败：${res.errors.join("；")}`);
      }
      message.success(
        `资料库「${lib.name}」已创建，入库 ${res.file_count} 个文件，${res.ingested_chunks} 个知识片段`
      );
      setLibraries((prev) => [lib, ...prev.filter((x) => x.id !== lib.id)]);
      setGenModalOpen(false);
      setPendingFiles([]);
      resetGenForm();
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("lp-resources-tab", "libraries");
      }
      setPageTab("libraries");
      router.push(`/resources/library/${encodeURIComponent(lib.id)}`);
    } catch (e: unknown) {
      message.destroy(msgKey);
      message.error(e instanceof Error ? e.message : "创建资料库失败");
    } finally {
      setPreparingLibrary(false);
      setGenStage("");
      setGenProgress(0);
    }
  };

  const isLibraryOnlyMode = genSource === "new";

  const runStreamGenerate = async () => {
    if (isLibraryOnlyMode) return;
    if (!topic.trim()) {
      message.warning("请输入生成主题");
      return;
    }
    if (!genSource) {
      setGenSource("web");
    }
    if (totalGenCount(genTypeCounts) === 0) {
      message.warning("请至少为一种资源类型设置生成数量");
      return;
    }
    if (genSource === "library" && !selectedLibraryId) {
      message.warning("请选择资料库，或切换为「新建资料库 / 全网检索」");
      return;
    }
    if (genSource === "new" && !newLibraryName.trim()) {
      message.warning("请输入新资料库名称");
      return;
    }

    setGenerating(true);
    setGenStage("正在准备生成…");
    setGenProgress(2);
    const effectiveSource = genSource || "web";
    const webMode = effectiveSource === "web";
    const msgKey = "resource-gen";
    message.loading({ content: "正在准备并生成资源…", key: msgKey, duration: 0 });
    try {
      const options = await buildGenerateOptions();
      const before = items.length;
      await streamGenerateResources(
        userId,
        topic.trim(),
        {
          onProgress: (stage, progress, meta) => {
            const text =
              stage === "done"
                ? "生成完成"
                : formatGenStageLabel(stage, GEN_STAGE_LABELS, meta);
            const pct =
              typeof progress === "number"
                ? progress
                : (() => {
                    const stages = buildGenProgressStages(
                      options.resourceTypeCounts,
                      webMode,
                      options.deepThinking ?? deepThinking
                    );
                    const idx = stages.indexOf(stage);
                    if (idx < 0) return 0;
                    return Math.min(99, Math.round(((idx + 1) / stages.length) * 99));
                  })();
            setGenStage(text);
            setGenProgress((prev) => Math.max(prev, pct));
            message.loading({ content: `生成中：${text}（${pct}%）`, key: msgKey, duration: 0 });
          },
          onError: (err) => {
            throw new Error(err);
          },
        },
        options
      );
      const list = await listResources(userId);
      setItems(list);
      setResources(list);
      void loadRecommendations(true);
      const created = Math.max(0, list.length - before);
      message.destroy(msgKey);
      if (created > 0) {
        message.success(`已新增 ${created} 项，资源库共 ${list.length} 项`);
      } else {
        message.success(`资源库已更新，共 ${list.length} 项`);
      }
      setGenModalOpen(false);
      setPendingFiles([]);
    } catch (e: unknown) {
      message.destroy(msgKey);
      message.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
      setGenStage("");
      setGenProgress(0);
      setPreparingLibrary(false);
    }
  };

  return (
    <div>
      <ResourcePreviewDrawer
        open={Boolean(previewResource)}
        resource={previewResource}
        onClose={() => setPreviewResource(null)}
        onOpenFull={(r) => {
          setPreviewResource(null);
          openResourceById(r.id);
        }}
      />
      <PageHeader
        title="学习资源库"
        subtitle={
          pathSteps.length
            ? `${items.length} 项资源 · ${pathSteps.length} 个学习阶段 · 按阶段与类型浏览`
            : `${items.length} 项资源 · 按主题阶段与类型浏览`
        }
        icon={<BookOutlined />}
        extra={
          <div className="lp-resource-header-actions">
            {pageTab === "resources" && (
              <Button
                icon={<SettingOutlined />}
                type={manageMode ? "primary" : "default"}
                onClick={toggleManageMode}
              >
                {manageMode ? "退出管理" : "管理资源"}
              </Button>
            )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={generating}
            onClick={openGenModal}
          >
            生成资源
          </Button>
          </div>
        }
      />
      <Modal
        title={isLibraryOnlyMode ? "新建资料库" : "AI 生成学习资源"}
        open={genModalOpen}
        onCancel={() => {
          if (!generating && !preparingLibrary) {
            setGenModalOpen(false);
            resetGenForm();
          }
        }}
        maskClosable={!generating && !preparingLibrary}
        width={520}
        destroyOnClose={false}
        className="lp-resource-gen-modal"
        footer={
          <div className="lp-resource-gen-footer">
            <Button
              onClick={() => {
                setGenModalOpen(false);
                setPendingFiles([]);
              }}
              disabled={generating || preparingLibrary}
            >
              取消
            </Button>
            <Button
              type="primary"
              icon={isLibraryOnlyMode ? <CloudUploadOutlined /> : <PlusOutlined />}
              loading={generating || preparingLibrary}
              onClick={() =>
                void (isLibraryOnlyMode ? runCreateLibrary() : runStreamGenerate())
              }
            >
              {isLibraryOnlyMode ? "创建并入库" : "开始生成"}
            </Button>
          </div>
        }
      >
        <div className="lp-resource-gen-form">
          {(generating || preparingLibrary) && (
            <div className="lp-resource-gen-progress">
              <div className="lp-resource-gen-progress-head">
                <Spin size="small" />
                <Text type="secondary">
                  {preparingLibrary
                    ? genStage || "正在创建资料库并上传文件…"
                    : genStage || "正在生成资源…"}
                </Text>
                <span className="lp-resource-gen-progress-pct">{genProgress}%</span>
              </div>
              <Progress
                percent={genProgress}
                showInfo={false}
                status="active"
                strokeColor={{ "0%": "#1677ff", "100%": "#36cfc9" }}
                trailColor="rgba(22,119,255,0.12)"
                size={6}
              />
            </div>
          )}
          <div className="lp-resource-gen-field">
            <Text className="lp-resource-gen-label">资料来源</Text>
            <Radio.Group
              value={genSource || undefined}
              onChange={(e) => setGenSource(e.target.value as GenSource)}
              className="lp-resource-gen-source"
            >
              <Radio value="library">依据已有资料库</Radio>
              <Radio value="new">新建资料库</Radio>
              <Radio value="web">无资料库 · 全网检索</Radio>
            </Radio.Group>
          </div>
          {!isLibraryOnlyMode && (
            <div className="lp-resource-gen-field">
              <Text className="lp-resource-gen-label">生成主题</Text>
              <Input
                placeholder="例如：线性回归、梯度下降"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
          )}
          {genSource === "library" && (
            <div className="lp-resource-gen-field">
              <Text className="lp-resource-gen-label">选择资料库</Text>
              <Select
                style={{ width: "100%" }}
                placeholder="选择用于生成的资料库"
                value={selectedLibraryId ?? undefined}
                onChange={(v) => {
                  setSelectedLibraryId(v);
                  setReplanLibraryId(v ?? null);
                }}
                options={libraries.map((l) => ({
                  value: l.id,
                  label: `${l.name}${l.chunk_count ? ` (${l.chunk_count} 片段)` : " (空)"}`,
                }))}
                allowClear
              />
            </div>
          )}
          {genSource === "new" && (
            <>
              <Text type="secondary" className="lp-resource-gen-hint" style={{ marginTop: -4 }}>
                仅创建资料库并上传文件，不会生成 AI 资源。需要生成时请选「依据已有资料库」或「全网检索」。
              </Text>
              <div className="lp-resource-gen-field">
                <Text className="lp-resource-gen-label">新资料库名称</Text>
                <Input
                  placeholder="例如：机器学习讲义合集"
                  value={newLibraryName}
                  onChange={(e) => setNewLibraryName(e.target.value)}
                />
              </div>
              <div className="lp-resource-gen-field">
                <Text className="lp-resource-gen-label">上传文件（可多选）</Text>
                <Upload
                  multiple
                  fileList={pendingFiles}
                  beforeUpload={() => false}
                  onChange={({ fileList }) => {
                    const rejected = fileList.filter(
                      (f) =>
                        f.name &&
                        uploadExtensions.length > 0 &&
                        !isAllowedUploadFile(f.name, uploadExtensions)
                    );
                    if (rejected.length) {
                      message.warning(
                        `不支持 ${rejected.map((f) => f.name).join("、")}，请选择 PDF、PPT、Word 等格式`
                      );
                    }
                    setPendingFiles(
                      fileList.filter(
                        (f) =>
                          !f.name ||
                          !uploadExtensions.length ||
                          isAllowedUploadFile(f.name, uploadExtensions)
                      )
                    );
                  }}
                  accept={buildUploadAccept(uploadExtensions)}
                  className="lp-resource-gen-upload"
                >
                  <Button icon={<CloudUploadOutlined />} disabled={generating || preparingLibrary}>
                    选择文件
                  </Button>
                </Upload>
                <Text type="secondary" className="lp-resource-gen-upload-hint">
                  {pendingFiles.length > 0
                    ? `已选择 ${pendingFiles.length} 个文件，点击「创建并入库」即可写入资料库`
                    : `支持 ${formatExtensionsHint(uploadExtensions)}，请至少选择 1 个文件`}
                </Text>
              </div>
            </>
          )}
          {!isLibraryOnlyMode && (
          <div className="lp-resource-gen-field">
            <div className="lp-resource-gen-type-head">
              <Text className="lp-resource-gen-label">资源类型</Text>
              <div className="lp-resource-gen-type-presets">
                <button
                  type="button"
                  className="lp-resource-gen-preset"
                  onClick={() => setGenTypeCounts(standardGenTypeCounts())}
                >
                  标准套件
                </button>
                <button
                  type="button"
                  className="lp-resource-gen-preset"
                  onClick={() => setGenTypeCounts(allGenTypeCounts(1))}
                >
                  全选 ×1
                </button>
                <button
                  type="button"
                  className="lp-resource-gen-preset"
                  onClick={() => setGenTypeCounts(emptyGenTypeCounts())}
                >
                  全不选
                </button>
              </div>
            </div>
            <div className="lp-resource-gen-types">
              {GENERATABLE_RESOURCE_TYPES.map(({ api, ui }) => {
                const cfg = RESOURCE_CONFIG[ui];
                const count = clampGenTypeCount(genTypeCounts[api]);
                const active = count > 0;
                return (
                  <div
                    key={api}
                    className={`lp-resource-gen-type-row${active ? " lp-resource-gen-type-row--active" : ""}`}
                    style={{ "--type-color": cfg.color } as React.CSSProperties}
                  >
                    <button
                      type="button"
                      className="lp-resource-gen-type"
                      onClick={() => setGenTypeCount(api, active ? 0 : 1)}
                    >
                      <span className="lp-resource-gen-type-icon">{cfg.icon}</span>
                      <span>{cfg.label}</span>
                    </button>
                    <InputNumber
                      min={0}
                      max={MAX_RESOURCE_GEN_PER_TYPE}
                      value={count}
                      size="small"
                      controls
                      className="lp-resource-gen-type-count"
                      onChange={(value) => setGenTypeCount(api, value)}
                    />
                  </div>
                );
              })}
            </div>
            <Text type="secondary" className="lp-resource-gen-hint">
              已选 {totalGenCount(genTypeCounts)} 项（每种类型单次最多 {MAX_RESOURCE_GEN_PER_TYPE} 个）。
            </Text>
          </div>
          )}
        </div>
      </Modal>
      <Modal
        title="重新生成资源"
        open={Boolean(regenResource)}
        onCancel={closeRegenerateModal}
        maskClosable
        destroyOnClose={false}
        width={540}
        className="lp-resource-regen-modal"
        footer={
          <div className="lp-resource-gen-footer">
            <Button onClick={closeRegenerateModal}>
              取消
            </Button>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={runRegenerateResource}
            >
              开始重新生成
            </Button>
          </div>
        }
      >
        {regenResource && (
          <div className="lp-resource-regen-form">
            <div className="lp-resource-regen-current">
              <Text type="secondary">当前资源</Text>
              <Text strong>{regenResource.title}</Text>
              <Text type="secondary">
                {RESOURCE_CONFIG[mapApiType(regenResource.type) as keyof typeof RESOURCE_CONFIG]
                  ?.label || regenResource.type}
              </Text>
            </div>
            <div className="lp-resource-regen-tags">
              {REGEN_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`lp-resource-regen-tag${regenTags.includes(tag) ? " lp-resource-regen-tag--active" : ""}`}
                  onClick={() => toggleRegenTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
            <Input.TextArea
              rows={4}
              value={regenRequirement}
              onChange={(e) => setRegenRequirement(e.target.value)}
              placeholder="写下你希望这份资源怎么改，比如：难度再高一点，多给 3 个例题，每一步写清为什么。"
            />
            <Text type="secondary" className="lp-resource-regen-hint">
              会保留原资源 ID 并覆盖内容，学习路径里对应的资源会同步变成新版。
            </Text>
          </div>
        )}
      </Modal>
      <div className="lp-resource-tabs">
        <button
          type="button"
          className={`lp-resource-tab${pageTab === "resources" ? " lp-resource-tab--active" : ""}`}
          onClick={() => setPageTab("resources")}
        >
          学习资源
        </button>
        <button
          type="button"
          className={`lp-resource-tab${pageTab === "libraries" ? " lp-resource-tab--active" : ""}`}
          onClick={() => {
            setPageTab("libraries");
            setManageMode(false);
            setSelectedIds([]);
          }}
        >
          课程资料库
        </button>
      </div>
      <div className="lp-page-body lp-resource-page">
        {pageTab === "libraries" ? (
          <ResourceLibraryPanel
            selectedId={selectedLibraryId}
            onSelect={(id) => {
              setSelectedLibraryId(id);
              if (id) setGenSource("library");
            }}
          />
        ) : (
          <>
        <section className="lp-resource-role-panel" aria-label="资源库角色">
          <div className="lp-resource-role-copy">
            <span>内容资产库</span>
            <strong>资源库负责沉淀材料，学习路径负责决定这些材料什么时候被使用。</strong>
            <p>
              收藏、重生成和完成记录都会保留在资源库；如果某个资源已经绑定到路径，重生成后路径会继续引用新版内容。
            </p>
          </div>
          <div className="lp-resource-role-actions">
            <Button size="small" onClick={() => router.push("/path")}>
              回到路径
            </Button>
            <Button size="small" type="primary" ghost onClick={() => void loadRecommendations(false)}>
              刷新推荐
            </Button>
          </div>
        </section>

        {pathSteps.length > 0 && (
          <div className="lp-resource-summary">
            <div className="lp-resource-summary-icon">
              <CompassOutlined />
            </div>
            <div className="lp-resource-summary-main">
              <Text strong className="lp-resource-summary-title">
                学习路径进度
              </Text>
              <Text type="secondary" className="lp-resource-summary-desc">
                {activeStep
                  ? `当前阶段：${activeStep.title}`
                  : doneSteps === pathSteps.length
                    ? "全部阶段已完成"
                    : "按路径阶段组织你的学习资源"}
              </Text>
              <div className="lp-resource-summary-track">
                {pathSteps.map((step) => {
                  const meta = STAGE_STATUS_META[
                    step.status === "done"
                      ? "done"
                      : step.status === "in_progress"
                        ? "in_progress"
                        : "pending"
                  ];
                  return (
                    <div
                      key={step.order}
                      className={`lp-resource-summary-step lp-resource-summary-step--${step.status}`}
                      style={{ "--step-color": meta.color } as React.CSSProperties}
                      title={step.title}
                    >
                      <span className="lp-resource-summary-step-num">{step.order}</span>
                      <span className="lp-resource-summary-step-label">{step.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="lp-resource-summary-stats">
              <span className="lp-resource-summary-stat">
                <strong>{doneSteps}</strong>/{pathSteps.length} 阶段
              </span>
              <span className="lp-resource-summary-stat">
                显示 <strong>{visibleCount}</strong> 项
              </span>
            </div>
          </div>
        )}

        {!manageMode && (recommendationLoading || recommendationCards.length > 0) && (
          <section className="lp-resource-recommend-panel">
            <div className="lp-resource-recommend-head">
              <div className="lp-resource-recommend-title">
                <span className="lp-resource-recommend-bulb">
                  <BulbOutlined />
                </span>
                <div>
                  <Text strong>当前推荐</Text>
                  <Text type="secondary">此刻优先看这几项</Text>
                </div>
              </div>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={recommendationLoading}
                onClick={() => void loadRecommendations(false)}
              >
                刷新
              </Button>
            </div>
            {recommendationLoading && recommendationCards.length === 0 ? (
              <div className="lp-resource-recommend-loading">
                <Spin size="small" />
              </div>
            ) : (
              <div className="lp-resource-recommend-grid">
                {recommendationCards.map(({ rec, resource, cfg }, index) => (
                  <button
                    key={rec.id}
                    type="button"
                    className="lp-resource-recommend-card"
                    style={{ "--rec-accent": cfg.color } as React.CSSProperties}
                    onClick={() => openResourceById(rec.id)}
                  >
                    <span className="lp-resource-recommend-rank">{index + 1}</span>
                    <span className="lp-resource-recommend-icon">{cfg.icon}</span>
                    <span className="lp-resource-recommend-copy">
                      <span className="lp-resource-recommend-name">{rec.title}</span>
                      <span className="lp-resource-recommend-reason">
                        {rec.reason || resource?.topic || rec.topic || "适合当前阶段"}
                      </span>
                    </span>
                    <ArrowRightOutlined className="lp-resource-recommend-arrow" />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="lp-resource-filters">
          <span className="lp-resource-filters-label">资源类型</span>
          <div className="lp-resource-filter-chips">
            {CATEGORY_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`lp-resource-filter-chip${activeCategory === chip.key ? " lp-resource-filter-chip--active" : ""}`}
                onClick={() => setActiveCategory(chip.key)}
              >
                {chip.key !== "all" && (
                  <span
                    className="lp-resource-filter-chip-dot"
                    style={{
                      background:
                        RESOURCE_CONFIG[chip.key as keyof typeof RESOURCE_CONFIG]?.color,
                    }}
                  />
                )}
                {chip.label}
              </button>
            ))}
          </div>
          <Input
            className="lp-resource-search"
            prefix={<SearchOutlined style={{ color: "var(--lp-text-secondary, #94a3b8)" }} />}
            placeholder="搜索资源..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </div>

        {manageMode && (
          <div className="lp-resource-manage-bar">
            <div className="lp-resource-manage-info">
              <span>已选</span>
              <strong>{selectedCount}</strong>
              <span>项</span>
              {allVisibleSelected && <Text type="secondary">当前筛选已全选</Text>}
            </div>
            <div className="lp-resource-manage-actions">
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                disabled={visibleResources.length === 0 || allVisibleSelected}
                onClick={selectVisibleResources}
              >
                全选当前 {visibleResources.length}
              </Button>
              <Button
                size="small"
                icon={<CloseOutlined />}
                disabled={!selectedCount}
                onClick={clearSelection}
              >
                清空
              </Button>
              <Button
                size="small"
                icon={<StarOutlined />}
                disabled={!selectedCount}
                onClick={() => void handleBatchStar(true)}
              >
                收藏
              </Button>
              <Button
                size="small"
                icon={<StarOutlined />}
                disabled={!selectedCount}
                onClick={() => void handleBatchStar(false)}
              >
                取消收藏
              </Button>
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                disabled={!selectedCount}
                onClick={() => void handleBatchComplete()}
              >
                标记完成
              </Button>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                disabled={!selectedCount}
                onClick={handleBatchDownload}
              >
                另存为
              </Button>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!selectedCount}
                onClick={handleBatchDelete}
              >
                删除
              </Button>
            </div>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="lp-resource-empty">
            <Spin />
          </div>
        ) : visibleCount === 0 ? (
          <div className="lp-resource-empty">
            {items.length === 0
              ? "暂无资源，点击「生成资源」或由智能对话触发"
              : "没有匹配的资源，试试调整搜索或类型筛选"}
          </div>
        ) : (
          <ResourceJourneyView
            stages={filteredGrouped.stages}
            starredIds={starredIds}
            onStar={(id) => void toggleStar(id)}
            onPreview={openPreview}
            onDownload={(r) => void handleDownloadResource(r)}
            onRegenerate={openRegenerateModal}
            onDelete={handleDeleteResource}
            manageMode={manageMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleResourceSelection}
          />
        )}

        </>
        )}
      </div>
    </div>
  );
}
