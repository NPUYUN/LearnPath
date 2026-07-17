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
  Select,
  Upload,
  Progress,
  InputNumber,
  Checkbox,
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
  createResourceGenerationJob,
  listLibraries,
  createLibrary,
  createFromTemplate,
  uploadLibraryFiles,
  type CreateFromTemplateOptions,
  type LearningResource,
  type ResourceRecommendation,
  type ResourceLibrary,
  type ResourceTemplateInfo,
  type PathStep,
  type GenerateResourceOptions,
  listResourceTemplates,
} from "@/lib/api";
import {
  GENERATABLE_RESOURCE_TYPES,
  mapApiType,
  RESOURCE_CONFIG,
} from "@/lib/resourceConfig";
import {
  allGenTypeCounts,
  clampGenTypeCount,
  emptyGenTypeCounts,
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
import ReviewCardGenerateModal from "@/components/ReviewCardGenerateModal";
import ReviewCardsPanel from "@/components/ReviewCardsPanel";
import ResourceTemplateCenter from "@/components/ResourceTemplateCenter";
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
import { collectMajorReviewTopics } from "@/lib/reviewCardTopics";
import { openResourceView } from "@/lib/resourceViewCache";
import ReadOutlined from "@ant-design/icons/ReadOutlined";
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
import DatabaseOutlined from "@ant-design/icons/DatabaseOutlined";
import FolderAddOutlined from "@ant-design/icons/FolderAddOutlined";
import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import DownOutlined from "@ant-design/icons/DownOutlined";
import UpOutlined from "@ant-design/icons/UpOutlined";

const { Text } = Typography;

type GenSource = "existing_library" | "uploaded" | "empty" | "web" | "";

const GEN_SOURCE_OPTIONS: Array<{
  value: Exclude<GenSource, "">;
  title: string;
  description: string;
  result: string;
  icon: React.ReactNode;
}> = [
  {
    value: "existing_library",
    title: "用已有资料库生成资源",
    description: "复用资料库说明、文件与知识索引生成配套内容。",
    result: "写回当前资料库 + 学习资源列表",
    icon: <DatabaseOutlined />,
  },
  {
    value: "uploaded",
    title: "上传资料并新建资料库",
    description: "先解析上传文件并建立索引，再生成学习资源。",
    result: "新资料库 + 学习资源列表",
    icon: <CloudUploadOutlined />,
  },
  {
    value: "empty",
    title: "按主题建库并生成资源",
    description: "不用上传文件，围绕主题创建资料库和完整资源。",
    result: "新资料库 + 学习资源列表",
    icon: <FolderAddOutlined />,
  },
  {
    value: "web",
    title: "直接生成资源",
    description: "不创建资料库，按主题快速生成通用学习资源。",
    result: "仅保存到学习资源列表",
    icon: <ThunderboltOutlined />,
  },
];

const RESOURCE_TYPE_DESCRIPTIONS: Record<string, string> = {
  doc: "概念讲解、例题与自检",
  mindmap: "梳理知识关系与易错点",
  quiz: "分层练习、答案与详解",
  reading: "拓展方向与阅读任务",
  media: "教学图、流程与分镜",
  code: "可运行代码与实践说明",
  ppt: "可直接讲授的课件结构",
  design: "完整教学流程与互动设计",
  project: "可落地的实践任务",
};

function flattenPathSteps(steps: PathStep[]): PathStep[] {
  return steps.flatMap((step) => [step, ...flattenPathSteps(step.substeps || [])]);
}

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
  const [reviewCardModalOpen, setReviewCardModalOpen] = useState(false);
  const [genWizardStep, setGenWizardStep] = useState<1 | 2>(1);
  const [pageTab, setPageTab] = useState("resources");
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<ResourceRecommendation[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationsExpanded, setRecommendationsExpanded] = useState(false);
  const [templates, setTemplates] = useState<ResourceTemplateInfo[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem("lp-resources-tab") === "libraries") {
      setPageTab("libraries");
      sessionStorage.removeItem("lp-resources-tab");
    }
    try {
      localStorage.removeItem(`lp_review_cards_${userId}`);
    } catch {
      /* 清理旧版本本地复习卡缓存 */
    }
  }, [userId]);
  const [libraries, setLibraries] = useState<ResourceLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [genSource, setGenSource] = useState<GenSource>("");
  const [newLibraryName, setNewLibraryName] = useState("");
  const [genRequirements, setGenRequirements] = useState("");
  const [customTypeCounts, setCustomTypeCounts] = useState(false);
  const [genTypeCounts, setGenTypeCounts] = useState<ResourceGenTypeCounts>(standardGenTypeCounts);
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const uploadExtensions = useSupportedUploadFormats(genModalOpen);
  const [preparingLibrary, setPreparingLibrary] = useState(false);
  const [attachToPath, setAttachToPath] = useState(false);
  const [pathAttachMode, setPathAttachMode] = useState<"auto" | "manual">("auto");
  const [selectedPathStepKey, setSelectedPathStepKey] = useState<string | undefined>();
  const [previewResource, setPreviewResource] = useState<LearningResource | null>(null);
  const [regenResource, setRegenResource] = useState<LearningResource | null>(null);
  const [regenTags, setRegenTags] = useState<string[]>([]);
  const [regenRequirement, setRegenRequirement] = useState("");
  const resourceJob = useAppStore((s) => s.activeResourceGenerationJob);
  const setResourceJob = useAppStore((s) => s.setActiveResourceGenerationJob);
  const setResourceJobPanelMode = useAppStore((s) => s.setResourceGenerationPanelMode);

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
    setGenSource("empty");
    setSelectedLibraryId(null);
    setNewLibraryName("");
    setGenRequirements("");
    setCustomTypeCounts(false);
    setPendingFiles([]);
    setGenTypeCounts(standardGenTypeCounts());
    setAttachToPath(Boolean(learningPath?.steps?.length));
    setPathAttachMode("auto");
    setSelectedPathStepKey(undefined);
    setGenWizardStep(1);
  };

  const openGenModal = () => {
    if (resourceJob?.status === "queued" || resourceJob?.status === "running") {
      setGenWizardStep(2);
      setGenModalOpen(true);
      return;
    }
    setResourceJob(null);
    resetGenForm();
    setGenModalOpen(true);
  };

  const openResourceById = (id: string, resource?: LearningResource) => {
    if (resource) {
      openResourceView(router, resource, userId);
      return;
    }
    const hit =
      items.find((r) => r.id === id) ??
      cachedResources.find((r) => r.id === id);
    openResourceView(router, hit ?? id, userId);
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

  const loadTemplates = async (background = false) => {
    if (!background) setTemplateLoading(true);
    try {
      const list = await listResourceTemplates(userId);
      setTemplates(list);
    } catch {
      setTemplates([]);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleCreateFromTemplate = async (
    templateId: string,
    options?: CreateFromTemplateOptions,
  ) => {
    setCreatingTemplateId(templateId);
    try {
      const result = await createFromTemplate(userId, templateId, options);
      message.success(result.message || "模板资源已创建");
      // 保留原资源列表刷新逻辑，只在模板创建后复用同一套同步流程。
      await load(true);
      void loadRecommendations(true);
      setPageTab("resources");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "从模板创建失败");
      throw e;
    } finally {
      setCreatingTemplateId(null);
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
    if (pageTab !== "resources") return;
    void loadTemplates(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pageTab]);

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

  const pathSteps = learningPath?.steps ?? [];

  const learningItems = useMemo(
    () => items.filter((r) => r.type !== "review_card"),
    [items]
  );
  const reviewCards = useMemo(
    () => items.filter((r) => r.type === "review_card"),
    [items]
  );
  const topicSuggestions = useMemo(() => {
    const sources: string[] = [];
    flattenPathSteps(pathSteps).forEach((step) => {
      if (step.title?.trim()) sources.push(step.title);
    });
    learningItems.forEach((r) => {
      if (r.topic?.trim()) sources.push(r.topic);
    });
    return collectMajorReviewTopics(sources);
  }, [learningItems, pathSteps]);

  const grouped = useMemo(
    () => groupResourcesByStage(learningItems, learningPath),
    [learningItems, learningPath]
  );

  const filteredGrouped = useMemo(
    () => filterGroupedResources(grouped, { search, category: activeCategory }),
    [grouped, search, activeCategory]
  );

  const doneSteps = pathSteps.filter((s) => s.status === "done").length;
  const activeStep = pathSteps.find((s) => s.status === "in_progress");
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
  const visibleCount = visibleResources.length;
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
  const primaryRecommendation = recommendationCards[0];
  const additionalRecommendations = recommendationCards.slice(1);
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

  const buildGenerateOptions = async (): Promise<GenerateResourceOptions> => {
    const counts = normalizeGenTypeCounts(genTypeCounts);
    const selectedTypes = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([type]) => type);
    const base: GenerateResourceOptions = {
      deepThinking,
      resourceTypes: selectedTypes,
      resourceTypeCounts: customTypeCounts ? counts : {},
      requirements: genRequirements.trim(),
      attachToPath: attachToPath && Boolean(learningPath?.steps?.length),
      pathAttachMode: attachToPath ? pathAttachMode : "none",
      pathStepKey: attachToPath && pathAttachMode === "manual" ? selectedPathStepKey : undefined,
    };
    if (genSource === "uploaded") {
      if (!newLibraryName.trim()) {
        throw new Error("请输入资料库名称");
      }
      const files = pendingFiles
        .map((f) => f.originFileObj)
        .filter(Boolean) as File[];
      if (!files.length) {
        throw new Error("请选择要上传的文件");
      }
      setPreparingLibrary(true);
      setGenStage("正在创建资料库并上传文件…");
      setGenProgress(8);
      try {
        const lib = await createLibrary(userId, newLibraryName.trim(), "", {
          requirements: genRequirements.trim(),
          sourceMode: "upload",
        });
        setGenProgress(12);
        setGenStage("正在解析文件并写入资料库文档…");
        await uploadLibraryFiles(userId, lib.id, files, { requirements: genRequirements.trim() });
        setGenProgress(18);
        setGenStage("资料库文档已生成，正在启动资源生成…");
        setSelectedLibraryId(lib.id);
        setLibraries((prev) => [lib, ...prev.filter((x) => x.id !== lib.id)]);
        return { ...base, libraryId: lib.id, generationSource: "uploaded" };
      } finally {
        setPreparingLibrary(false);
      }
    }
    if (genSource === "existing_library" && selectedLibraryId) {
      return { ...base, libraryId: selectedLibraryId, generationSource: "existing_library" };
    }
    if (genSource === "empty") {
      if (!newLibraryName.trim()) throw new Error("请输入要新建的资料库名称");
      return {
        ...base,
        newLibraryName: newLibraryName.trim() || undefined,
        generationSource: "empty",
      };
    }
    return { ...base, newLibraryName: undefined, libraryId: undefined, generationSource: "web" };
  };

  const runStreamGenerate = async () => {
    if (resourceJob?.status === "queued" || resourceJob?.status === "running") {
      message.warning("已有资源生成任务正在后台执行");
      return;
    }
    const effectiveTopic = topic.trim() || newLibraryName.trim();
    if (!effectiveTopic) {
      message.warning("请输入复习主题或资料库名称");
      return;
    }
    if (!genSource) {
      setGenSource("empty");
    }
    const selectedCount = Object.values(normalizeGenTypeCounts(genTypeCounts)).filter((n) => n > 0).length;
    if (selectedCount === 0) {
      message.warning("请至少选择一种资源类型");
      return;
    }
    if (genSource === "existing_library" && !selectedLibraryId) {
      message.warning("请选择资料库，或切换为其他生成方式");
      return;
    }
    if (genSource === "uploaded" && !pendingFiles.length) {
      message.warning("请上传用于生成的资料文件");
      return;
    }

    setGenerating(true);
    setGenStage("正在准备生成…");
    setGenProgress(2);
    const msgKey = "resource-gen";
    message.loading({ content: "正在准备并生成资源…", key: msgKey, duration: 0 });
    try {
      const options = await buildGenerateOptions();
      const job = await createResourceGenerationJob(userId, effectiveTopic, options);
      setResourceJob(job);
      setResourceJobPanelMode("open");
      message.destroy(msgKey);
      message.success("资源已转入后台生成，可以关闭弹窗继续使用其他页面");
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

  const allPathSteps = flattenPathSteps(pathSteps);
  const resourceJobRunning = resourceJob?.status === "queued" || resourceJob?.status === "running";
  const normalizedGenCounts = normalizeGenTypeCounts(genTypeCounts);
  const selectedTypeCount = Object.values(normalizedGenCounts).filter((count) => count > 0).length;
  const selectedItemCount = totalGenCount(genTypeCounts);
  const selectedLibrary = libraries.find((library) => library.id === selectedLibraryId);
  const selectedSource = GEN_SOURCE_OPTIONS.find((option) => option.value === genSource);
  const destinationLabel =
    genSource === "existing_library"
      ? selectedLibrary?.name || "所选资料库"
      : genSource === "uploaded" || genSource === "empty"
        ? newLibraryName.trim() || "待创建资料库"
        : "学习资源列表";
  const pathUsageSummary = !pathSteps.length || !attachToPath
    ? "仅保存资源，不同步学习路径"
    : pathAttachMode === "manual"
      ? `加入路径步骤「${allPathSteps.find((step) => String(step.id || step.order) === selectedPathStepKey)?.title || "待选择"}」`
      : "自动加入当前学习路径";
  const saveSummary = genSource === "web"
    ? "仅保存到学习资源列表"
    : "保存到资料库和学习资源列表";
  const generationSummaryLines = [
    genSource === "existing_library"
      ? `使用「${destinationLabel}」`
      : genSource === "web"
        ? "不创建资料库"
        : `将创建「${destinationLabel}」`,
    `生成 ${selectedTypeCount} 类资源${customTypeCounts ? `，共 ${selectedItemCount} 项` : ""}`,
    pathUsageSummary,
    saveSummary,
  ];
  const validationError = (() => {
    if (!genSource) return "请选择生成方式";
    if (genSource === "existing_library" && !selectedLibraryId) return "请选择资料库";
    if ((genSource === "uploaded" || genSource === "empty") && !newLibraryName.trim()) {
      return "请填写资料库名称";
    }
    if (genSource === "uploaded" && pendingFiles.length === 0) return "请上传至少一个文件";
    if (!topic.trim()) return "请填写复习主题";
    if (selectedTypeCount === 0) return "请至少选择一种资源类型";
    if (attachToPath && pathAttachMode === "manual" && !selectedPathStepKey) {
      return "请选择学习路径阶段";
    }
    return "";
  })();
  const footerSummary = `将基于「${topic.trim() || "待填写主题"}」生成 ${selectedTypeCount} 类资源，${
    genSource === "web" ? "保存到学习资源列表" : `保存到「${destinationLabel}」及学习资源列表`
  }，${pathUsageSummary}。`;

  return (
    <div>
      <ResourcePreviewDrawer
        open={Boolean(previewResource)}
        resource={previewResource}
        onClose={() => setPreviewResource(null)}
        onOpenFull={(r) => {
          setPreviewResource(null);
          openResourceById(r.id, r);
        }}
      />
      <ReviewCardGenerateModal
        open={reviewCardModalOpen}
        userId={userId}
        topicSuggestions={topicSuggestions}
        onClose={() => setReviewCardModalOpen(false)}
        onCreated={() => {
          void load(true);
          setPageTab("review_cards");
        }}
      />
      <PageHeader
        title="学习资源库"
        subtitle={
          pathSteps.length
            ? `${learningItems.length} 项学习资源 · ${pathSteps.length} 个路径阶段 · 按阶段与类型浏览`
            : `${learningItems.length} 项学习资源 · 按主题与类型浏览`
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
            <Button icon={<ReadOutlined />} onClick={() => setReviewCardModalOpen(true)}>
              生成复习卡
            </Button>
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
        title={
          <div className="lp-resource-gen-wizard-head">
            <div>
              <div className="lp-resource-gen-wizard-title">生成资料库与学习资源</div>
              <div className="lp-resource-gen-wizard-subtitle">先确定资源归属，再集中配置生成内容</div>
            </div>
            <div className="lp-resource-gen-steps" aria-label="生成步骤">
              <button
                type="button"
                className={`lp-resource-gen-step${genWizardStep === 1 ? " is-active" : " is-done"}`}
                onClick={() => !resourceJobRunning && setGenWizardStep(1)}
              >
                <span>1</span>
                <strong>选择生成方式</strong>
              </button>
              <i />
              <button
                type="button"
                className={`lp-resource-gen-step${genWizardStep === 2 ? " is-active" : ""}`}
                onClick={() => genSource && setGenWizardStep(2)}
              >
                <span>2</span>
                <strong>配置并生成</strong>
              </button>
            </div>
          </div>
        }
        open={genModalOpen}
        onCancel={() => {
          if (!preparingLibrary) {
            setGenModalOpen(false);
            if (!resourceJobRunning) resetGenForm();
          }
        }}
        maskClosable
        width={1080}
        destroyOnHidden={false}
        className="lp-resource-gen-modal lp-resource-gen-wizard-modal"
        footer={
          <div className="lp-resource-gen-footer lp-resource-gen-wizard-footer">
            <div className="lp-resource-gen-footer-copy">
              <strong>{genWizardStep === 1 ? selectedSource?.title || "请选择生成方式" : footerSummary}</strong>
              <span className={genWizardStep === 2 && validationError ? "is-error" : ""}>
                {genWizardStep === 1
                  ? selectedSource
                    ? `结果：${selectedSource.result}`
                    : "选择后即可继续配置资源类型与保存方式"
                  : validationError || `已配置 ${selectedTypeCount} 类资源，可以开始生成`}
              </span>
            </div>
            <div className="lp-resource-gen-footer-actions">
              {genWizardStep === 2 && !resourceJobRunning && (
                <Button type="text" onClick={() => setGenWizardStep(1)}>上一步</Button>
              )}
              <Button
                onClick={() => {
                  setGenModalOpen(false);
                  setPendingFiles([]);
                }}
                disabled={preparingLibrary}
              >
                {resourceJobRunning ? "后台继续" : "取消"}
              </Button>
              {genWizardStep === 1 ? (
                <Button type="primary" disabled={!genSource} onClick={() => setGenWizardStep(2)}>
                  下一步：配置资源
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  loading={generating || preparingLibrary}
                  disabled={resourceJobRunning || Boolean(validationError)}
                  onClick={() => void runStreamGenerate()}
                >
                  开始生成（预计 {selectedTypeCount} 类）
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="lp-resource-gen-wizard-body">
          {(generating || preparingLibrary || resourceJob) && (
            <div className="lp-resource-gen-progress">
              <div className="lp-resource-gen-progress-head">
                {resourceJob?.status === "done" ? (
                  <CheckCircleOutlined style={{ color: "#16a34a" }} />
                ) : resourceJob?.status === "error" ? (
                  <CloseOutlined style={{ color: "#dc2626" }} />
                ) : (
                  <Spin size="small" />
                )}
                <Text type="secondary">
                  {preparingLibrary
                    ? genStage || "正在创建资料库并上传文件…"
                    : resourceJob
                      ? `${resourceJob.stage}${resourceJob.sub_stage ? ` · ${resourceJob.sub_stage}` : ""}`
                      : genStage || "正在生成资源…"}
                </Text>
                <span className="lp-resource-gen-progress-pct">{resourceJob?.progress ?? genProgress}%</span>
              </div>
              <Progress
                percent={resourceJob?.progress ?? genProgress}
                showInfo={false}
                status={resourceJob?.status === "error" ? "exception" : resourceJob?.status === "done" ? "success" : "active"}
                strokeColor={{ "0%": "#1677ff", "100%": "#36cfc9" }}
                trailColor="rgba(22,119,255,0.12)"
                size={6}
              />
              {resourceJob && (
                <Text type="secondary" className="lp-resource-gen-hint">
                  {resourceJob.status === "error"
                    ? `失败原因：${resourceJob.error || resourceJob.sub_stage}`
                    : `${resourceJob.current_resource_type ? `当前类型：${resourceJob.current_resource_type} · ` : ""}已耗时 ${Math.floor((resourceJob.elapsed_seconds || 0) / 60)} 分 ${String((resourceJob.elapsed_seconds || 0) % 60).padStart(2, "0")} 秒`}
                </Text>
              )}
            </div>
          )}

          {genWizardStep === 1 ? (
            <section className="lp-resource-gen-source-step">
              <div className="lp-resource-gen-section-intro">
                <strong>资源从哪里来，最后保存到哪里？</strong>
                <span>选择最符合当前任务的方式，下一步再配置主题与资源类型。</span>
              </div>
              <div className="lp-resource-gen-source-grid">
                {GEN_SOURCE_OPTIONS.map((option) => {
                  const active = genSource === option.value;
                  return (
                    <button
                      type="button"
                      key={option.value}
                      className={`lp-resource-gen-source-card${active ? " is-active" : ""}`}
                      onClick={() => setGenSource(option.value)}
                    >
                      <span className="lp-resource-gen-source-card-icon">{option.icon}</span>
                      <span className="lp-resource-gen-source-card-copy">
                        <strong>{option.title}</strong>
                        <small>{option.description}</small>
                        <em>结果：{option.result}</em>
                      </span>
                      <CheckCircleOutlined className="lp-resource-gen-source-check" />
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="lp-resource-gen-config-layout">
              <div className="lp-resource-gen-config-left">
                <section className="lp-resource-gen-group-card">
                  <div className="lp-resource-gen-group-title">
                    <span>01</span><strong>基础信息</strong>
                  </div>
                  <div className="lp-resource-gen-group-fields">
                    {genSource === "existing_library" && (
                      <div className="lp-resource-gen-field">
                        <Text className="lp-resource-gen-label">选择资料库</Text>
                        <Select
                          style={{ width: "100%" }}
                          placeholder="选择用于生成的资料库"
                          value={selectedLibraryId ?? undefined}
                          onChange={(value) => {
                            setSelectedLibraryId(value);
                            setReplanLibraryId(value ?? null);
                          }}
                          options={libraries.map((library) => ({
                            value: library.id,
                            label: `${library.name}${library.chunk_count ? ` (${library.chunk_count} 片段)` : " (空)"}`,
                          }))}
                          allowClear
                        />
                      </div>
                    )}
                    {(genSource === "uploaded" || genSource === "empty") && (
                      <div className="lp-resource-gen-field">
                        <Text className="lp-resource-gen-label">资料库名称</Text>
                        <Input
                          placeholder="例如：机器学习期末复习库"
                          value={newLibraryName}
                          onChange={(event) => setNewLibraryName(event.target.value)}
                        />
                      </div>
                    )}
                    {genSource === "uploaded" && (
                      <div className="lp-resource-gen-field">
                        <Text className="lp-resource-gen-label">上传文件</Text>
                        <Upload
                          multiple
                          fileList={pendingFiles}
                          beforeUpload={() => false}
                          onChange={({ fileList }) => {
                            const rejected = fileList.filter(
                              (file) => file.name && uploadExtensions.length > 0 && !isAllowedUploadFile(file.name, uploadExtensions)
                            );
                            if (rejected.length) message.warning(`不支持 ${rejected.map((file) => file.name).join("、")}`);
                            setPendingFiles(fileList.filter(
                              (file) => !file.name || !uploadExtensions.length || isAllowedUploadFile(file.name, uploadExtensions)
                            ));
                          }}
                          accept={buildUploadAccept(uploadExtensions)}
                          className="lp-resource-gen-upload"
                        >
                          <Button icon={<CloudUploadOutlined />} disabled={generating || preparingLibrary}>选择文件</Button>
                        </Upload>
                        <Text type="secondary" className="lp-resource-gen-upload-hint">
                          {pendingFiles.length
                            ? `已选择 ${pendingFiles.length} 个文件`
                            : `支持 ${formatExtensionsHint(uploadExtensions)}，请至少选择 1 个文件`}
                        </Text>
                      </div>
                    )}
                    <div className="lp-resource-gen-field">
                      <Text className="lp-resource-gen-label">复习主题</Text>
                      <Input
                        placeholder="例如：线性回归、梯度下降"
                        value={topic}
                        onChange={(event) => setTopic(event.target.value)}
                      />
                    </div>
                    <div className="lp-resource-gen-field">
                      <Text className="lp-resource-gen-label">诉求（可选）</Text>
                      <Input.TextArea
                        rows={2}
                        placeholder="例如：重点补充公式推导和代码练习"
                        value={genRequirements}
                        onChange={(event) => setGenRequirements(event.target.value)}
                      />
                    </div>
                  </div>
                </section>

                <section className="lp-resource-gen-group-card">
                  <div className="lp-resource-gen-group-title">
                    <span>02</span><strong>保存与使用</strong>
                  </div>
                  <div className="lp-resource-gen-path-option">
                    <Checkbox
                      checked={attachToPath}
                      disabled={!pathSteps.length}
                      onChange={(event) => {
                        setAttachToPath(event.target.checked);
                        if (event.target.checked) setPathAttachMode("auto");
                      }}
                    >
                      生成后加入当前学习路径
                    </Checkbox>
                    {!pathSteps.length ? (
                      <Text type="secondary">当前暂无学习路径，生成后仅保存资源</Text>
                    ) : attachToPath ? (
                      <>
                        <div className="lp-resource-gen-path-modes">
                          <button
                            type="button"
                            className={pathAttachMode === "auto" ? "is-active" : ""}
                            onClick={() => { setPathAttachMode("auto"); setSelectedPathStepKey(undefined); }}
                          >自动匹配路径步骤</button>
                          <button
                            type="button"
                            className={pathAttachMode === "manual" ? "is-active" : ""}
                            onClick={() => setPathAttachMode("manual")}
                          >手动选择路径阶段</button>
                          <button type="button" onClick={() => setAttachToPath(false)}>仅生成资源</button>
                        </div>
                        {pathAttachMode === "manual" && (
                          <Select
                            style={{ width: "100%" }}
                            placeholder="选择要挂载的路径阶段"
                            value={selectedPathStepKey}
                            onChange={setSelectedPathStepKey}
                            options={allPathSteps.map((step) => ({
                              value: String(step.id || step.order),
                              label: step.title,
                            }))}
                          />
                        )}
                      </>
                    ) : (
                      <Text type="secondary">仅保存资源，不更新路径</Text>
                    )}
                  </div>
                </section>

                <section className="lp-resource-gen-group-card lp-resource-gen-summary-card">
                  <div className="lp-resource-gen-group-title">
                    <span>03</span><strong>生成摘要</strong>
                  </div>
                  <ul>
                    {generationSummaryLines.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </section>
              </div>

              <section className="lp-resource-gen-types-panel">
                <div className="lp-resource-gen-type-head">
                  <div>
                    <strong>资源类型</strong>
                    <span>选择要生成的学习资产，默认每类生成 1 份</span>
                  </div>
                  <div className="lp-resource-gen-type-presets">
                    <button type="button" className="lp-resource-gen-preset" onClick={() => setGenTypeCounts(standardGenTypeCounts())}>标准套件</button>
                    <button type="button" className="lp-resource-gen-preset" onClick={() => setGenTypeCounts(allGenTypeCounts(1))}>全选</button>
                    <button type="button" className="lp-resource-gen-preset" onClick={() => setGenTypeCounts(emptyGenTypeCounts())}>清空</button>
                    <button
                      type="button"
                      className={`lp-resource-gen-preset${customTypeCounts ? " lp-resource-gen-preset--active" : ""}`}
                      onClick={() => setCustomTypeCounts((value) => !value)}
                    >自定义数量</button>
                  </div>
                </div>
                <div className="lp-resource-gen-types">
                  {GENERATABLE_RESOURCE_TYPES.map(({ api, ui }) => {
                    const config = RESOURCE_CONFIG[ui];
                    const count = clampGenTypeCount(genTypeCounts[api]);
                    const active = count > 0;
                    return (
                      <div
                        key={api}
                        className={`lp-resource-gen-type-card${active ? " is-active" : ""}`}
                        style={{ "--type-color": config.color } as React.CSSProperties}
                      >
                        <button type="button" onClick={() => setGenTypeCount(api, active ? 0 : 1)}>
                          <span className="lp-resource-gen-type-icon">{config.icon}</span>
                          <strong>{config.label}</strong>
                          <small>{RESOURCE_TYPE_DESCRIPTIONS[api]}</small>
                          <CheckCircleOutlined className="lp-resource-gen-type-check" />
                        </button>
                        {customTypeCounts && (
                          <InputNumber
                            min={0}
                            max={MAX_RESOURCE_GEN_PER_TYPE}
                            value={count}
                            size="small"
                            controls
                            className="lp-resource-gen-type-count"
                            onChange={(value) => setGenTypeCount(api, value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <Text type="secondary" className="lp-resource-gen-hint">
                  {customTypeCounts
                    ? `共 ${selectedItemCount} 项，每种类型最多 ${MAX_RESOURCE_GEN_PER_TYPE} 个`
                    : `已选择 ${selectedTypeCount} 类资源`}
                </Text>
              </section>
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
          className={`lp-resource-tab${pageTab === "review_cards" ? " lp-resource-tab--active" : ""}`}
          onClick={() => {
            setPageTab("review_cards");
            setManageMode(false);
            setSelectedIds([]);
          }}
        >
          复习卡
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
              if (id) setGenSource("existing_library");
            }}
          />
        ) : pageTab === "review_cards" ? (
          <ReviewCardsPanel
            userId={userId}
            cards={reviewCards}
            loading={loading}
            onRefresh={() => void load(true)}
            onPreview={openPreview}
            onOpenFull={(r) => openResourceById(r.id, r)}
            onDelete={handleDeleteResource}
            onGenerate={() => setReviewCardModalOpen(true)}
          />
        ) : (
          <>
        {!manageMode &&
          (pathSteps.length > 0 || recommendationLoading || recommendationCards.length > 0) && (
            <section className="lp-resource-focus-panel" aria-labelledby="lp-resource-focus-title">
              <div className="lp-resource-focus-head">
                <div className="lp-resource-focus-heading">
                  <span className="lp-resource-focus-heading-icon">
                    <CompassOutlined />
                  </span>
                  <div>
                    <Text strong id="lp-resource-focus-title">继续学习</Text>
                    <Text type="secondary">沿当前路径直接进入最值得学习的资源</Text>
                  </div>
                </div>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={recommendationLoading}
                  onClick={() => void loadRecommendations(false)}
                >
                  刷新推荐
                </Button>
              </div>

              <div className="lp-resource-focus-body">
                {pathSteps.length > 0 && (
                  <div className="lp-resource-focus-path">
                    <span className="lp-resource-focus-label">当前路径</span>
                    <strong>
                      {activeStep
                        ? activeStep.title
                        : doneSteps === pathSteps.length
                          ? "全部阶段已完成"
                          : "准备开始学习"}
                    </strong>
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
                    <div className="lp-resource-focus-path-meta">
                      <span><strong>{doneSteps}</strong>/{pathSteps.length} 阶段完成</span>
                      <span>当前显示 <strong>{visibleCount}</strong> 项资源</span>
                    </div>
                  </div>
                )}

                <div className="lp-resource-focus-recommendation">
                  <span className="lp-resource-focus-label">
                    <BulbOutlined /> 首选资源
                  </span>
                  {recommendationLoading && !primaryRecommendation ? (
                    <div className="lp-resource-focus-loading">
                      <Spin size="small" />
                      <Text type="secondary">正在匹配当前学习状态</Text>
                    </div>
                  ) : primaryRecommendation ? (
                    <button
                      type="button"
                      className="lp-resource-focus-primary"
                      style={{ "--rec-accent": primaryRecommendation.cfg.color } as React.CSSProperties}
                      onClick={() => openResourceById(primaryRecommendation.rec.id)}
                    >
                      <span className="lp-resource-recommend-icon">{primaryRecommendation.cfg.icon}</span>
                      <span className="lp-resource-recommend-copy">
                        <span className="lp-resource-recommend-name">{primaryRecommendation.rec.title}</span>
                        <span className="lp-resource-recommend-reason">
                          {primaryRecommendation.rec.reason ||
                            primaryRecommendation.resource?.topic ||
                            primaryRecommendation.rec.topic ||
                            "适合当前阶段"}
                        </span>
                      </span>
                      <span className="lp-resource-focus-action">
                        开始学习 <ArrowRightOutlined />
                      </span>
                    </button>
                  ) : (
                    <Text type="secondary">当前路径暂无可推荐资源</Text>
                  )}
                </div>
              </div>

              {additionalRecommendations.length > 0 && (
                <div className="lp-resource-focus-more">
                  <Button
                    type="text"
                    size="small"
                    icon={recommendationsExpanded ? <UpOutlined /> : <DownOutlined />}
                    onClick={() => setRecommendationsExpanded((value) => !value)}
                  >
                    {recommendationsExpanded
                      ? "收起备选推荐"
                      : `查看另外 ${additionalRecommendations.length} 项推荐`}
                  </Button>
                  {recommendationsExpanded && (
                    <div className="lp-resource-recommend-grid">
                      {additionalRecommendations.map(({ rec, resource, cfg }, index) => (
                        <button
                          key={rec.id}
                          type="button"
                          className="lp-resource-recommend-card"
                          style={{ "--rec-accent": cfg.color } as React.CSSProperties}
                          onClick={() => openResourceById(rec.id)}
                        >
                          <span className="lp-resource-recommend-rank">{index + 2}</span>
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

        {!manageMode && (
          <div className="lp-resource-template-lower">
            <ResourceTemplateCenter
              loading={templateLoading}
              creatingId={creatingTemplateId}
              templates={templates}
              onCreate={handleCreateFromTemplate}
            />
          </div>
        )}

        </>
        )}
      </div>
    </div>
  );
}
