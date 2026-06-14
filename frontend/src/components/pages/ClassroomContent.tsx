"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Button, Input, Progress, Spin, Tag, Tooltip, message } from "antd";
import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import CheckCircleOutlined from "@ant-design/icons/CheckCircleOutlined";
import ClockCircleOutlined from "@ant-design/icons/ClockCircleOutlined";
import ExperimentOutlined from "@ant-design/icons/ExperimentOutlined";
import FileAddOutlined from "@ant-design/icons/FileAddOutlined";
import FileTextOutlined from "@ant-design/icons/FileTextOutlined";
import PauseCircleOutlined from "@ant-design/icons/PauseCircleOutlined";
import PlayCircleOutlined from "@ant-design/icons/PlayCircleOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import QuestionCircleOutlined from "@ant-design/icons/QuestionCircleOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import SwapOutlined from "@ant-design/icons/SwapOutlined";
import VideoCameraOutlined from "@ant-design/icons/VideoCameraOutlined";
import {
  apiUrl,
  chat,
  exportClassroomPptx,
  generateClassroomQuiz,
  listResources,
  parseClassroomMaterials,
  startClassroomGenerationJob,
  type ClassroomSession,
  type ClassroomSlide,
  type ClassroomVisualBlock,
  type LearningResource,
} from "@/lib/api";
import { clientNavigate } from "@/lib/clientNav";
import { classroomResultMatchesSession, getActiveClassroomSnapshot, persistActiveClassroom } from "@/lib/classroomActive";
import { displayCourseName, useAppStore, type ClassroomSessionSeed } from "@/store/appStore";

type ClassroomMode = "normal" | "slow" | "example" | "practice" | "confused";
type WizardStep = 1 | 2 | 3;
type TeachingMode = "直觉优先" | "例题驱动" | "慢速拆解" | "项目实践" | "挑战拔高";
type DepthLevel = "基础入门" | "标准掌握" | "进阶提高" | "挑战推导" | "项目应用";
type ClassroomSignal = "confused" | "slow" | "example" | "practice" | "mastered";
type ClassroomQuiz = {
  id: string;
  question: string;
  options: { id: string; text: string }[];
  answerId: string;
  explanation: string;
  transfer: string;
};

type ClassroomFeedbackEvent = {
  id: string;
  signal: ClassroomSignal;
  label: string;
  slideTitle: string;
  at: string;
};

type LocalMaterial = {
  id: string;
  name: string;
  size: number;
  excerpt: string;
  status: "parsing" | "parsed" | "recorded" | "error";
  error?: string;
};

const DEFAULT_SESSION: ClassroomSessionSeed = {
  stepKey: "demo-classroom",
  title: "线性回归直觉课",
  objective: "理解线性回归为什么是在寻找一条最合适的线，并能说出损失函数的直觉含义。",
  resourceIds: [],
  estimatedMinutes: 20,
  depthLevel: "标准掌握",
  courseName: "机器学习导论",
  source: "manual",
};

const MODE_LABEL: Record<ClassroomMode, string> = {
  normal: "标准节奏",
  slow: "慢速讲解",
  example: "换个例子",
  practice: "课堂练习",
  confused: "重新拆解",
};

const FALLBACK_SCRIPT: Record<ClassroomMode, string> = {
  normal: "我们先把这节课抓成一句话：先理解它想解决什么问题，再看公式或步骤。",
  slow: "我会讲慢一点。你先不用记全部细节，只抓住每一步是在降低哪种困难。",
  example: "换个例子：把它想成一次路线规划，目标不是背地图，而是知道每个路口为什么这样转。",
  practice: "来一道小题：请用一句话说出本节概念要解决的问题，再举一个你自己的例子。",
  confused: "卡住很正常。我们先拆回最小单位：输入是什么，输出是什么，中间哪一步让你不确定。",
};

const TEACHING_MODES: TeachingMode[] = ["直觉优先", "例题驱动", "慢速拆解", "项目实践", "挑战拔高"];
const DEPTH_LEVELS: { value: DepthLevel; title: string; desc: string }[] = [
  { value: "基础入门", title: "基础入门", desc: "先建立直觉，用最小例题讲清楚" },
  { value: "标准掌握", title: "标准掌握", desc: "定义、例题、误区和迁移练习完整覆盖" },
  { value: "进阶提高", title: "进阶提高", desc: "加入推导、边界条件和综合题" },
  { value: "挑战推导", title: "挑战推导", desc: "强调证明链、反例和高阶思考题" },
  { value: "项目应用", title: "项目应用", desc: "从真实任务建模、实验和结果解释展开" },
];
const DEPTH_KEYWORDS: Record<DepthLevel, string[]> = {
  基础入门: ["直觉建立", "最小例题"],
  标准掌握: ["标准例题", "迁移练习"],
  进阶提高: ["完整推导", "边界条件", "综合例题"],
  挑战推导: ["形式化定义", "证明链", "反例分析", "挑战题"],
  项目应用: ["建模任务", "实验思路", "结果解释"],
};
const AI_MATERIAL_OPTIONS = ["生活化例子", "3 道检查题", "代码演示", "易错点清单", "思维导图骨架"];
const AI_MATERIAL_POOLS = [
  ["生活化例子", "3 道检查题", "代码演示", "易错点清单", "思维导图骨架"],
  ["一分钟导入", "课堂追问", "反例讲解", "公式拆解", "课后小测"],
  ["类比故事", "错因诊断", "项目任务", "术语卡片", "复盘提纲"],
  ["可视化讲解", "分层练习", "挑战题", "课堂板书", "常见问答"],
];
const GENERATION_STAGES = [
  "整理参考材料",
  "读取学习画像",
  "规划课堂结构",
  "生成讲义主线",
  "生成课件页面",
  "生成教学配图",
  "设计互动检查",
  "生成课后作业",
  "检查内容一致性",
];

const CLASSROOM_SIGNAL_META: Record<
  ClassroomSignal,
  { label: string; mode: ClassroomMode; delta: { confusion?: number; load?: number; curiosity?: number; mastery?: number; pace?: number } }
> = {
  confused: {
    label: "听不懂",
    mode: "confused",
    delta: { confusion: 18, load: 12, mastery: -6, pace: -10 },
  },
  slow: {
    label: "讲慢点",
    mode: "slow",
    delta: { load: 8, pace: -14 },
  },
  example: {
    label: "换个例子",
    mode: "example",
    delta: { curiosity: 10, confusion: 6 },
  },
  practice: {
    label: "来道题",
    mode: "practice",
    delta: { curiosity: 6, mastery: 8 },
  },
  mastered: {
    label: "继续",
    mode: "normal",
    delta: { mastery: 10, confusion: -8, load: -5, pace: 5 },
  },
};

function buildPreviewSlides(session: ClassroomSessionSeed): ClassroomSlide[] {
  return [
    {
      kicker: "01 / 目标",
      title: session.title,
      body: session.objective || "先建立核心直觉，再用一个最小例子检查是否理解。",
      board: ["本节只解决一个核心问题", "先直觉，后细节", "最后用小题确认"],
      teacher_note: "等待生成后，会结合画像和所选资源改写。",
    },
    {
      kicker: "02 / 讲解",
      title: "形成本节讲义主线",
      body: "课堂会围绕当前路径节点生成讲解、课件、互动检查和课后任务。",
      board: ["选资源", "定节奏", "生成课堂"],
      teacher_note: "课堂内容将按学生状态调整密度和例子。",
    },
    {
      kicker: "03 / 检查",
      title: "用一个小任务收口",
      body: "课堂结束前保留一个检查题和少量课后任务，避免一次性负荷过高。",
      board: ["1 道检查题", "1 组课后任务", "回写学习反馈"],
      teacher_note: "下一步会接入课堂反馈回写画像。",
    },
  ];
}

function resourceTypeLabel(type: string) {
  const map: Record<string, string> = {
    doc: "文档",
    mindmap: "导图",
    quiz: "练习",
    reading: "阅读",
    media: "多模态",
    code: "代码",
    ppt: "课件",
    design: "设计",
    project: "项目",
  };
  return map[type] || type || "资源";
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((x) => x.trim()).filter(Boolean)));
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampPercent(value: number) {
  return Math.round(clamp(value, 0, 100));
}

type SlideLayout = "cover" | "problem" | "concept" | "timeline" | "example" | "mistake" | "quiz" | "summary";
type SlideAccent = "blue" | "teal" | "amber" | "indigo" | "green" | "rose" | "violet" | "cyan";

function normalizeSlideLayout(layout?: string): SlideLayout {
  const allowed: SlideLayout[] = ["cover", "problem", "concept", "timeline", "example", "mistake", "quiz", "summary"];
  return allowed.includes(layout as SlideLayout) ? (layout as SlideLayout) : "concept";
}

function normalizeSlideAccent(accent?: string): SlideAccent {
  const allowed: SlideAccent[] = ["blue", "teal", "amber", "indigo", "green", "rose", "violet", "cyan"];
  return allowed.includes(accent as SlideAccent) ? (accent as SlideAccent) : "teal";
}

function getSlideVisualLabel(layout?: string) {
  const map: Record<SlideLayout, string> = {
    cover: "课程封面",
    problem: "问题场景",
    concept: "核心概念",
    timeline: "讲义主线",
    example: "案例演示",
    mistake: "易错对照",
    quiz: "课堂检查",
    summary: "行动收束",
  };
  return map[normalizeSlideLayout(layout)] || "课堂页";
}

function renderClassroomVisualBlock(block: ClassroomVisualBlock, fallbackPoints: string[], index: number) {
  const type = (block.type || "process").toLowerCase();
  const title = block.title || (type === "exercise" ? "课堂检查" : type === "example" ? "示例拆解" : "知识结构");

  if ((type === "table" || type === "compare") && block.columns?.length && block.rows?.length) {
    const columns = block.columns.slice(0, 4);
    return (
      <div className="lp-slide-visual-block lp-slide-visual-block--table" key={`${title}-${index}`}>
        <strong>{title}</strong>
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.slice(0, 4).map((row, rowIndex) => (
              <tr key={`${title}-row-${rowIndex}`}>
                {columns.map((column, columnIndex) => (
                  <td key={`${column}-${columnIndex}`}>{row[columnIndex] || ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === "example" || type === "exercise" || type === "formula") {
    const steps = (block.steps?.length ? block.steps : fallbackPoints).slice(0, 4);
    return (
      <div className="lp-slide-visual-block lp-slide-visual-block--example" key={`${title}-${index}`}>
        <strong>{title}</strong>
        {block.question && <p>{block.question}</p>}
        <ol>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {block.answer && <em>{block.answer}</em>}
      </div>
    );
  }

  const steps = (block.steps?.length ? block.steps : block.items?.length ? block.items : fallbackPoints).slice(0, 5);
  return (
    <div className="lp-slide-visual-block lp-slide-visual-block--process" key={`${title}-${index}`}>
      <strong>{title}</strong>
      <div className="lp-slide-visual-steps">
        {steps.map((step, stepIndex) => (
          <span key={`${step}-${stepIndex}`}>
            <i>{String(stepIndex + 1).padStart(2, "0")}</i>
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildClassroomQuiz(
  slide: ClassroomSlide,
  checkQuestion: ClassroomSession["check_question"] | undefined,
  variant: number
): ClassroomQuiz {
  const points = unique([...(slide.board || []), slide.title, slide.body]).slice(0, 5);
  const correct = points[variant % Math.max(points.length, 1)] || slide.title || "先确认核心概念和适用条件";
  const distractors = unique([
    "直接记住结论，暂时不看条件",
    "先跳到复杂综合题，再回头补概念",
    "只看最终答案，不区分输入和输出",
    "把所有公式都背下来，不需要解释来源",
    ...points.filter((item) => item !== correct),
  ]).slice(0, 8);
  const optionTexts = unique([correct, ...distractors]).slice(0, 4);
  while (optionTexts.length < 4) optionTexts.push(`补充判断 ${optionTexts.length + 1}`);
  const rotated = optionTexts.map((text, index) => ({ id: String.fromCharCode(65 + index), text }));
  const shift = variant % rotated.length;
  const options = [...rotated.slice(shift), ...rotated.slice(0, shift)].map((item, index) => ({
    id: String.fromCharCode(65 + index),
    text: item.text,
  }));
  const answerId = options.find((item) => item.text === correct)?.id || "A";
  return {
    id: `${slide.title}-${variant}`,
    question:
      checkQuestion?.question && variant % 2 === 0
        ? `把这道检查题改成选择判断：${checkQuestion.question}`
        : `关于「${slide.title}」，这一页最应该先抓住哪一点？`,
    options,
    answerId,
    explanation: `这页的关键不是先追求完整结论，而是先抓住「${correct}」。它决定了后面的例子、公式或步骤应该怎么理解。`,
    transfer: `举一反三：如果题目换成另一个场景，也先问“输入是什么、目标是什么、当前最卡的条件是什么”，再套用「${correct}」这条主线。`,
  };
}

function buildAdaptiveGuidance(signals: {
  confusion: number;
  load: number;
  curiosity: number;
  mastery: number;
  pace: number;
}) {
  if (signals.confusion >= 62 || signals.load >= 70) {
    return "我会先停一下，把这页压成一个最小问题，再用更短的句子重讲。";
  }
  if (signals.curiosity >= 66 && signals.load < 62) {
    return "你现在的好奇度够高，可以补一个反例或拓展例子，但不额外增加公式负担。";
  }
  if (signals.mastery >= 68 && signals.confusion < 42) {
    return "你已经基本跟上了，下一步适合用一道小题确认能不能独立迁移。";
  }
  if (signals.pace < 42) {
    return "接下来我会放慢节奏，每次只推进一个概念。";
  }
  return "当前节奏可以保持，先讲核心直觉，再用一个最小例题收口。";
}

function buildDurationRecommendations(
  baseMinutes: number,
  profile: { knowledge_level?: string; pace_and_time?: string; cognitive_style?: string } | null,
  materialCount: number
) {
  const profileText = `${profile?.knowledge_level || ""} ${profile?.pace_and_time || ""} ${profile?.cognitive_style || ""}`;
  let adjustment = 0;
  if (/入门|基础|薄弱|碎片|少|短|慢/.test(profileText)) adjustment -= 1;
  if (/熟练|进阶|挑战|项目|充足|深入/.test(profileText)) adjustment += 1;
  if (materialCount >= 5) adjustment += 1;
  if (baseMinutes <= 12) adjustment -= 1;

  return [
    { band: "0-10", value: clamp(7 + adjustment, 5, 10), tone: "快速进入" },
    { band: "10-30", value: clamp(18 + adjustment * 3, 12, 28), tone: "标准课堂" },
    { band: "30-45", value: clamp(34 + adjustment * 4, 30, 42), tone: "深入讲透" },
  ];
}

function relevanceScore(resource: LearningResource, session: ClassroomSessionSeed) {
  if (session.resourceIds.includes(resource.id)) return 99;
  const target = `${session.title} ${session.objective}`.toLowerCase();
  const source = `${resource.title} ${resource.topic} ${resource.content.slice(0, 500)}`.toLowerCase();
  const rawTokens = target.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}|\d+/g) || [];
  const shortTokens = rawTokens.flatMap((token) => {
    if (!/[\u4e00-\u9fff]/.test(token) || token.length <= 4) return [token];
    const parts: string[] = [];
    for (let size = 2; size <= 4; size += 1) {
      for (let i = 0; i <= token.length - size; i += 1) parts.push(token.slice(i, i + size));
    }
    return [token, ...parts];
  });
  const tokens = unique(shortTokens).slice(0, 36);
  return tokens.reduce((score, token) => score + (source.includes(token) ? 1 : 0), 0);
}

export default function ClassroomContent() {
  const userId = useAppStore((s) => s.userId);
  const courseName = useAppStore((s) => s.courseName);
  const pendingSession = useAppStore((s) => s.pendingClassroomSession);
  const activeClassroomSeed = useAppStore((s) => s.activeClassroomSeed);
  const cachedResources = useAppStore((s) => s.resources);
  const profile = useAppStore((s) => s.profile);
  const setResources = useAppStore((s) => s.setResources);
  const activeClassroomResult = useAppStore((s) => s.activeClassroomResult);
  const activeClassroomJob = useAppStore((s) => s.activeClassroomJob);
  const setActiveClassroomJob = useAppStore((s) => s.setActiveClassroomJob);
  const setActiveClassroomResult = useAppStore((s) => s.setActiveClassroomResult);
  const setActiveClassroomSeed = useAppStore((s) => s.setActiveClassroomSeed);
  const setClassroomJobPanelMode = useAppStore((s) => s.setClassroomJobPanelMode);
  const session = pendingSession || activeClassroomSeed || {
    ...DEFAULT_SESSION,
    courseName: displayCourseName(courseName, userId),
  };

  const [mode, setMode] = useState<ClassroomMode>("normal");
  const [slideIndex, setSlideIndex] = useState(0);
  const [finishedTasks, setFinishedTasks] = useState<string[]>([]);
  const [resources, setLocalResources] = useState<LearningResource[]>(cachedResources);
  const [selectedIds, setSelectedIds] = useState<string[]>(session.resourceIds);
  const [loadingResources, setLoadingResources] = useState(cachedResources.length === 0);
  const [generated, setGenerated] = useState<ClassroomSession | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [duration, setDuration] = useState(session.estimatedMinutes || 20);
  const [teachingMode, setTeachingMode] = useState<TeachingMode>("直觉优先");
  const [depthLevel, setDepthLevel] = useState<DepthLevel>(
    (session.depthLevel as DepthLevel) || "标准掌握"
  );
  const [keywords, setKeywords] = useState<string[]>(["核心直觉", "易错点", "最小例题"]);
  const [customKeyword, setCustomKeyword] = useState("");
  const [localMaterials, setLocalMaterials] = useState<LocalMaterial[]>([]);
  const [aiMaterials, setAiMaterials] = useState<string[]>(["生活化例子", "3 道检查题"]);
  const [suggestedAiMaterials, setSuggestedAiMaterials] = useState<string[]>(AI_MATERIAL_OPTIONS);
  const [aiMaterialRefreshIndex, setAiMaterialRefreshIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState(GENERATION_STAGES[0]);
  const [classroomSignals, setClassroomSignals] = useState({
    confusion: 34,
    load: 48,
    curiosity: 55,
    mastery: 40,
    pace: 58,
  });
  const [feedbackEvents, setFeedbackEvents] = useState<ClassroomFeedbackEvent[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<ClassroomQuiz | null>(null);
  const [quizAnswer, setQuizAnswer] = useState("");
  const [quizFeedback, setQuizFeedback] = useState<"correct" | "wrong" | null>(null);
  const [showQuizAnalysis, setShowQuizAnalysis] = useState(false);
  const [quizVariant, setQuizVariant] = useState(0);
  const [quizGenerating, setQuizGenerating] = useState(false);
  const [classroomQuestion, setClassroomQuestion] = useState("");
  const [classroomAnswer, setClassroomAnswer] = useState("");
  const [classroomAnswering, setClassroomAnswering] = useState(false);

  useEffect(() => {
    setSelectedIds(session.resourceIds);
    let matchedResult = classroomResultMatchesSession(
      activeClassroomResult,
      activeClassroomSeed,
      session,
    )
      ? activeClassroomResult
      : null;
    if (
      !matchedResult &&
      activeClassroomJob?.status === "done" &&
      activeClassroomJob.result &&
      activeClassroomSeed &&
      classroomResultMatchesSession(activeClassroomJob.result, activeClassroomSeed, session)
    ) {
      matchedResult = activeClassroomJob.result;
      setActiveClassroomResult(activeClassroomJob.result);
    }
    setGenerated(matchedResult);
    setSlideIndex(0);
    setMode("normal");
    setWizardStep(1);
    setDuration(session.estimatedMinutes || 20);
    setDepthLevel((session.depthLevel as DepthLevel) || "标准掌握");
    setKeywords(["核心直觉", "易错点", "最小例题"]);
    setLocalMaterials([]);
    setAiMaterials(["生活化例子", "3 道检查题"]);
    setSuggestedAiMaterials(AI_MATERIAL_OPTIONS);
    setAiMaterialRefreshIndex(0);
    setGenerationProgress(0);
    setGenerationStage(GENERATION_STAGES[0]);
    setClassroomSignals({
      confusion: 34,
      load: 48,
      curiosity: 55,
      mastery: 40,
      pace: 58,
    });
    setFeedbackEvents([]);
    setActiveQuiz(null);
    setQuizAnswer("");
    setQuizFeedback(null);
    setShowQuizAnalysis(false);
    setQuizVariant(0);
    setQuizGenerating(false);
    setClassroomQuestion("");
    setClassroomAnswer("");
    setClassroomAnswering(false);
  }, [
    activeClassroomJob,
    activeClassroomResult,
    activeClassroomSeed,
    session.stepKey,
    session.title,
    session.resourceIds,
    session.estimatedMinutes,
    session.depthLevel,
    setActiveClassroomResult,
  ]);

  useEffect(() => {
    if (!activeClassroomResult || !activeClassroomSeed) return;
    if (!classroomResultMatchesSession(activeClassroomResult, activeClassroomSeed, session)) return;
    setGenerated(activeClassroomResult);
    setSlideIndex(0);
    setMode("normal");
    setFinishedTasks([]);
    setClassroomSignals({
      confusion: 34,
      load: 48,
      curiosity: 55,
      mastery: 40,
      pace: 58,
    });
    setFeedbackEvents([]);
  }, [activeClassroomResult, activeClassroomSeed, session]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingResources(true);
      try {
        const list = await listResources(userId);
        if (cancelled) return;
        setLocalResources(list);
        setResources(list);
      } catch {
        if (!cancelled) setLocalResources(cachedResources);
      } finally {
        if (!cancelled) setLoadingResources(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const pathResources = useMemo(
    () => resources.filter((r) => session.resourceIds.includes(r.id)),
    [resources, session.objective, session.resourceIds, session.title]
  );
  const otherResources = useMemo(
    () =>
      resources
        .filter((r) => !session.resourceIds.includes(r.id))
        .map((resource) => ({ resource, score: relevanceScore(resource, session) }))
        .sort((a, b) => b.score - a.score || a.resource.title.localeCompare(b.resource.title))
        .slice(0, 12)
        .map((item) => item.resource),
    [resources, session.resourceIds]
  );
  const selectedResources = useMemo(
    () => resources.filter((r) => selectedIds.includes(r.id)),
    [resources, selectedIds]
  );
  const materialCount = selectedIds.length + localMaterials.length + aiMaterials.length;
  const recommendedKeywords = useMemo(() => {
    const resourceTopics = selectedResources.flatMap((r) => [r.topic, r.title]).slice(0, 4);
    const depthTopics = DEPTH_KEYWORDS[depthLevel] || DEPTH_KEYWORDS["标准掌握"];
    return unique([
      "核心直觉",
      "易错点",
      "最小例题",
      "课堂检查",
      ...depthTopics,
      session.title,
      ...resourceTopics,
      duration >= 30 ? "完整推导" : "轻量讲解",
    ]).slice(0, 10);
  }, [depthLevel, duration, selectedResources, session.title]);
  const recommendedDurations = useMemo(
    () => buildDurationRecommendations(session.estimatedMinutes || 20, profile, materialCount),
    [materialCount, profile, session.estimatedMinutes]
  );

  useEffect(() => {
    const values = recommendedDurations.map((item) => item.value);
    if (!values.includes(duration)) {
      setDuration(recommendedDurations[1]?.value || 18);
    }
  }, [duration, recommendedDurations]);

  const activeSnapshot = getActiveClassroomSnapshot({
    job: activeClassroomJob,
    result: activeClassroomResult,
    seed: activeClassroomSeed,
  });
  const isCurrentClassroomJob =
    activeSnapshot.exists && activeSnapshot.stepKey === session.stepKey;
  const currentJobRunning = isCurrentClassroomJob && activeSnapshot.phase === "generating";
  const currentJobError = isCurrentClassroomJob && activeSnapshot.phase === "error";
  const currentJobProgress = currentJobRunning || currentJobError ? activeClassroomJob?.progress || 0 : 0;
  const currentJobStage =
    (currentJobRunning || currentJobError ? activeClassroomJob?.stage || activeSnapshot.title : "") ||
    GENERATION_STAGES[0];
  const classroomStatusLabel = generated
    ? "AI 课堂已生成"
    : currentJobRunning
      ? "后台生成中"
      : currentJobError
        ? "生成失败"
        : generating
          ? "正在生成"
          : "课前生成";

  const slides = generated?.slides?.length ? generated.slides : buildPreviewSlides(session);
  const slide = slides[Math.min(slideIndex, slides.length - 1)];
  const slideLayout = normalizeSlideLayout(slide.layout);
  const slideAccent = normalizeSlideAccent(slide.accent_color);
  const slideImageUrl = slide.image_url ? apiUrl(slide.image_url) : "";
  const slideIsImagePage = Boolean(slideImageUrl);
  const slideVisualBlocks = (slide.visual_blocks || []).filter(Boolean).slice(0, 2);
  const progress = Math.round(((Math.min(slideIndex, slides.length - 1) + 1) / slides.length) * 100);
  const sourceResources = generated?.source_resources || selectedResources;
  const visibleAiMaterialOptions = unique([...aiMaterials, ...suggestedAiMaterials]);
  const teacherScript =
    generated?.teacher_scripts?.[mode] ||
    (mode === "normal" ? generated?.slides?.[slideIndex]?.teacher_note : "") ||
    FALLBACK_SCRIPT[mode];
  const adaptiveGuidance = buildAdaptiveGuidance(classroomSignals);
  const adaptiveTeacherScript =
    mode === "normal" ? teacherScript : `${teacherScript}\n\n${adaptiveGuidance}`;
  const latestFeedback = feedbackEvents[0];
  const homework = generated?.homework?.length
    ? generated.homework
    : ["用一句话复述本节核心直觉", "完成 1 道最小检查题", "标记仍然卡住的一个概念"];
  const handout = generated?.handout?.length
    ? generated.handout
    : [
        {
          heading: "讲义生成中",
          content: "生成完成后，这里会呈现本节课的复习讲义、关键概念和课堂检查依据。",
        },
      ];

  useEffect(() => {
    setActiveQuiz(null);
    setQuizAnswer("");
    setQuizFeedback(null);
    setShowQuizAnalysis(false);
  }, [slideIndex]);

  const toggleTask = (task: string) => {
    setFinishedTasks((prev) =>
      prev.includes(task) ? prev.filter((item) => item !== task) : [...prev, task]
    );
  };

  const refreshClassroomQuiz = async (transfer = false) => {
    if (quizGenerating) return;
    const nextVariant = quizVariant + (transfer ? 2 : 1);
    setQuizVariant(nextVariant);
    setQuizAnswer("");
    setQuizFeedback(null);
    setShowQuizAnalysis(false);
    setMode("practice");
    setQuizGenerating(true);
    try {
      const result = await generateClassroomQuiz({
        user_id: userId,
        course_title: generated?.title || session.title,
        course_objective: generated?.objective || session.objective,
        slide_title: slide.title,
        slide_body: slide.body,
        slide_board: slide.board || [],
        teacher_note: slide.teacher_note || "",
        depth_level: generated?.depth_level || session.depthLevel || "标准掌握",
        previous_question: activeQuiz?.question || "",
        variant: nextVariant,
      });
      setActiveQuiz({
        id: result.id || `${slide.title}-${nextVariant}`,
        question: result.question,
        options: result.options,
        answerId: result.answer_id,
        explanation: result.explanation,
        transfer: result.transfer,
      });
    } catch (error: unknown) {
      setActiveQuiz(buildClassroomQuiz(slide, generated?.check_question, nextVariant));
      message.error(error instanceof Error ? error.message : "动态出题失败，已使用本地题目");
    } finally {
      setQuizGenerating(false);
    }
  };

  const answerClassroomQuiz = (optionId: string) => {
    if (!activeQuiz || quizAnswer) return;
    const isCorrect = optionId === activeQuiz.answerId;
    setQuizAnswer(optionId);
    setQuizFeedback(isCorrect ? "correct" : "wrong");
    setClassroomSignals((prev) => ({
      confusion: clampPercent(prev.confusion + (isCorrect ? -6 : 8)),
      load: clampPercent(prev.load + (isCorrect ? -3 : 5)),
      curiosity: clampPercent(prev.curiosity + (isCorrect ? 2 : 4)),
      mastery: clampPercent(prev.mastery + (isCorrect ? 8 : -4)),
      pace: clampPercent(prev.pace + (isCorrect ? 3 : -2)),
    }));
    if (isCorrect) {
      message.success("答对了，掌握度已上调");
    } else {
      message.info("这题先看解析，再换一个同类题");
      setShowQuizAnalysis(true);
    }
  };

  const askClassroomQuestion = async () => {
    const question = classroomQuestion.trim();
    if (!question || classroomAnswering) return;
    setClassroomAnswering(true);
    setClassroomAnswer("");
    setMode("normal");
    try {
      const context = [
        "你现在是 AI 课堂里的随堂老师，请只围绕当前这节课回答学生问题。",
        `课程：${generated?.title || session.title}`,
        `学习目标：${generated?.objective || session.objective}`,
        `当前页：${slide.title}`,
        `当前页说明：${slide.body}`,
        `当前页要点：${(slide.board || []).join("；") || "暂无"}`,
        `教师讲稿：${slide.teacher_note || teacherScript || "暂无"}`,
        `实时状态：困惑 ${classroomSignals.confusion}%，负荷 ${classroomSignals.load}%，好奇 ${classroomSignals.curiosity}%，掌握 ${classroomSignals.mastery}%`,
        "回答要求：先直接回答问题，再给一个最小例子或判断方法；不要泛泛鼓励，不要跑到其他章节；如果学生问题不清楚，先按当前页最可能的卡点回答。",
        `学生问题：${question}`,
      ].join("\n");
      const result = await chat(userId, context, false);
      setClassroomAnswer(result.reply || "我先把这个问题压缩一下：它和当前页的核心要点有关，但还需要再补一个具体例子。");
      setClassroomSignals((prev) => ({
        confusion: clampPercent(prev.confusion - 4),
        load: clampPercent(prev.load - 2),
        curiosity: clampPercent(prev.curiosity + 3),
        mastery: clampPercent(prev.mastery + 3),
        pace: prev.pace,
      }));
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : "课堂问答失败");
    } finally {
      setClassroomAnswering(false);
    }
  };

  const recordClassroomSignal = (signal: ClassroomSignal) => {
    const meta = CLASSROOM_SIGNAL_META[signal];
    setMode(meta.mode);
    setClassroomSignals((prev) => ({
      confusion: clampPercent(prev.confusion + (meta.delta.confusion || 0)),
      load: clampPercent(prev.load + (meta.delta.load || 0)),
      curiosity: clampPercent(prev.curiosity + (meta.delta.curiosity || 0)),
      mastery: clampPercent(prev.mastery + (meta.delta.mastery || 0)),
      pace: clampPercent(prev.pace + (meta.delta.pace || 0)),
    }));
    setFeedbackEvents((prev) => [
      {
        id: `${signal}-${Date.now()}`,
        signal,
        label: meta.label,
        slideTitle: slide.title,
        at: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      ...prev,
    ].slice(0, 5));
    if (signal === "practice") {
      void refreshClassroomQuiz();
    }
  };

  const toggleResource = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAiMaterial = (item: string) => {
    setAiMaterials((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  };

  const refreshAiMaterialOptions = () => {
    const nextIndex = aiMaterialRefreshIndex + 1;
    setAiMaterialRefreshIndex(nextIndex);
    setSuggestedAiMaterials(AI_MATERIAL_POOLS[nextIndex % AI_MATERIAL_POOLS.length]);
  };

  const toggleKeyword = (item: string) => {
    setKeywords((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : unique([...prev, item])));
  };

  const addCustomKeyword = () => {
    const value = customKeyword.trim();
    if (!value) return;
    setKeywords((prev) => unique([...prev, value]).slice(0, 12));
    setCustomKeyword("");
  };

  const handleLocalFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []).slice(0, 6);
    if (!files.length) return;
    const pendingItems: LocalMaterial[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      size: file.size,
      excerpt: "",
      status: "parsing",
    }));
    setLocalMaterials((prev) => {
      const next = [...prev];
      for (const item of pendingItems) {
        if (!next.some((x) => x.id === item.id)) next.push(item);
      }
      return next.slice(0, 8);
    });
    input.value = "";
    try {
      const result = await parseClassroomMaterials(userId, files);
      setLocalMaterials((prev) => {
        const next = prev.filter((item) => !pendingItems.some((p) => p.id === item.id));
        for (const item of result.materials) {
          next.push({
            id: item.id,
            name: item.title,
            size: item.size,
            excerpt: item.content_excerpt,
            status: item.status,
            error: item.error,
          });
        }
        return next.slice(0, 8);
      });
      const parsedCount = result.materials.filter((item) => item.status === "parsed").length;
      if (parsedCount) message.success(`已解析 ${parsedCount} 个文件`);
      if (parsedCount < result.materials.length) message.warning("部分文件未提取到正文，已保留文件信息");
    } catch (error: unknown) {
      setLocalMaterials((prev) =>
        prev.map((item) =>
          pendingItems.some((p) => p.id === item.id)
            ? {
                ...item,
                status: "error",
                error: error instanceof Error ? error.message : "解析失败",
              }
            : item
        )
      );
      message.error(error instanceof Error ? error.message : "文件解析失败");
    }
  };

  const nextSlide = () => {
    recordClassroomSignal("mastered");
    setSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
  };

  const handleGenerate = async () => {
    const state = useAppStore.getState();
    const active = getActiveClassroomSnapshot({
      job: state.activeClassroomJob,
      result: state.activeClassroomResult,
      seed: state.activeClassroomSeed,
    });
    if (active.phase === "generating" && active.stepKey === session.stepKey) {
      message.info("当前课堂正在生成中，可在右下角悬浮窗查看进度");
      return;
    }

    setGenerating(true);
    try {
      const seed: ClassroomSessionSeed = {
        stepKey: session.stepKey,
        title: session.title,
        objective: session.objective,
        resourceIds: session.resourceIds,
        estimatedMinutes: duration,
        depthLevel,
        courseName: session.courseName,
        source: pendingSession?.source ?? activeClassroomSeed?.source ?? "manual",
      };
      const job = await startClassroomGenerationJob({
        user_id: userId,
        step_key: session.stepKey,
        title: session.title,
        objective: session.objective,
        resource_ids: session.resourceIds,
        selected_resource_ids: selectedIds,
        estimated_minutes: duration,
        course_name: session.courseName,
        teaching_mode: teachingMode,
        depth_level: depthLevel,
        classroom_keywords: keywords,
        local_materials: localMaterials
          .filter((item) => item.status !== "error")
          .map((item) => ({
            title: item.name,
            content_excerpt: item.excerpt || item.error || "",
          })),
        ai_material_requests: aiMaterials,
      });
      setActiveClassroomSeed(seed);
      setActiveClassroomResult(null);
      setActiveClassroomJob(job);
      persistActiveClassroom({ jobId: job.id, seed });
      setClassroomJobPanelMode("open");
      setGenerationStage(job.stage);
      setGenerationProgress(job.progress);
      message.success("课堂已开始生成，可先去使用其他功能");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "课堂生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPptx = async () => {
    if (!generated) {
      message.warning("课堂生成完成后才能下载 PPT");
      return;
    }
    setExportingPptx(true);
    try {
      const blob = await exportClassroomPptx(userId, generated);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${generated.title || "AI课堂"}.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.success("PPT 已开始下载");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "PPT 下载失败");
    } finally {
      setExportingPptx(false);
    }
  };

  const renderResourceButton = (r: LearningResource, source: "path" | "library") => {
    const selected = selectedIds.includes(r.id);
    const relevant = source === "path" || relevanceScore(r, session) > 0;
    return (
      <button
        key={`${source}-${r.id}`}
        type="button"
        className={`lp-classroom-source-chip${selected ? " is-selected" : ""}`}
        onClick={() => toggleResource(r.id)}
      >
        <span className="lp-classroom-source-meta">
          <span>{source === "path" ? "路径" : resourceTypeLabel(r.type)}</span>
          {relevant && <em>相关</em>}
        </span>
        <strong>{r.title}</strong>
      </button>
    );
  };

  const renderWizard = () => (
    <section className="lp-classroom-wizard">
      <div className="lp-classroom-wizard-steps">
        {[
          { id: 1, label: "选资料" },
          { id: 2, label: "定节奏" },
          { id: 3, label: "确认课堂" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={`lp-classroom-step-pill${wizardStep === item.id ? " is-active" : ""}`}
            onClick={() => setWizardStep(item.id as WizardStep)}
          >
            <span>{item.id}</span>
            {item.label}
          </button>
        ))}
      </div>

      {(currentJobRunning || currentJobError) && (
        <div className={`lp-classroom-background-card${currentJobError ? " is-error" : ""}`}>
          <div className="lp-classroom-background-copy">
            <span>{currentJobError ? "生成失败" : "已挂到后台生成"}</span>
            <strong>{currentJobError ? "可以调整配置后重新生成" : "你可以继续使用其他功能"}</strong>
            <p>
              {currentJobError
                ? activeClassroomJob?.error || "课堂生成过程中出现问题"
                : "课堂生成任务会继续执行，右下角浮窗会实时显示进度；切到聊天、路径或资源库都不影响。"}
            </p>
          </div>
          <div className="lp-classroom-background-progress">
            <span>{currentJobStage}</span>
            <Progress
              percent={Math.max(0, Math.min(100, currentJobProgress))}
              showInfo={false}
              status={currentJobError ? "exception" : "active"}
            />
          </div>
          <div className="lp-classroom-background-actions">
            <Button onClick={() => clientNavigate("/chat")}>去聊天</Button>
            <Button onClick={() => clientNavigate("/path")}>回路径</Button>
          </div>
        </div>
      )}

      {wizardStep === 1 && (
        <div className="lp-classroom-wizard-panel">
          <div className="lp-classroom-panel-head">
            <span>第一步</span>
            <strong>选择这节课要参考的材料</strong>
          </div>
          <div className="lp-classroom-material-layout">
            <div className="lp-classroom-material-card is-wide">
              <div className="lp-classroom-card-title">
                <BookOutlined />
                <span>资源库</span>
              </div>
              <div className="lp-classroom-source-grid">
                {loadingResources ? (
                  <div className="lp-classroom-source-loading">
                    <Spin size="small" />
                    <span>正在读取资源库</span>
                  </div>
                ) : (
                  <>
                    {pathResources.map((r) => renderResourceButton(r, "path"))}
                    {otherResources.map((r) => renderResourceButton(r, "library"))}
                    {!resources.length && (
                      <span className="lp-classroom-empty-source">资源库暂无资料，也可以先用本地文件或 AI 补充。</span>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="lp-classroom-material-card">
              <div className="lp-classroom-card-title">
                <FileAddOutlined />
                <span>本地文件</span>
              </div>
              <label className="lp-classroom-upload-box">
                <input type="file" multiple onChange={handleLocalFiles} />
                <PlusOutlined />
                <strong>添加文件</strong>
                <small>支持 Word / PDF / PPT / 表格 / Markdown / 文本</small>
              </label>
              <div className="lp-classroom-mini-list">
                {localMaterials.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`lp-classroom-local-file is-${item.status}`}
                    onClick={() => setLocalMaterials((prev) => prev.filter((x) => x.id !== item.id))}
                  >
                    <span>{item.name}</span>
                    <small>
                      {item.status === "parsing"
                        ? "解析中..."
                        : item.status === "parsed"
                          ? `已解析 · ${formatFileSize(item.size)} · ${item.excerpt.length} 字`
                          : item.status === "recorded"
                            ? `已记录 · ${formatFileSize(item.size)}`
                            : item.error || "解析失败"}
                    </small>
                  </button>
                ))}
              </div>
            </div>

            <div className="lp-classroom-material-card">
              <div className="lp-classroom-card-title">
                <div>
                  <BulbOutlined />
                  <span>AI 现场补充</span>
                </div>
                <Button size="small" icon={<ReloadOutlined />} onClick={refreshAiMaterialOptions}>
                  刷新
                </Button>
              </div>
              <div className="lp-classroom-ai-materials">
                {visibleAiMaterialOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={aiMaterials.includes(item) ? "is-selected" : ""}
                    onClick={() => toggleAiMaterial(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="lp-classroom-wizard-actions">
            <Tag>{materialCount} 项材料</Tag>
            <Button type="primary" onClick={() => setWizardStep(2)}>
              下一步
            </Button>
          </div>
        </div>
      )}

      {wizardStep === 2 && (
        <div className="lp-classroom-wizard-panel">
          <div className="lp-classroom-panel-head">
            <span>第二步</span>
            <strong>调整课堂时间和讲授方式</strong>
          </div>
          <div className="lp-classroom-option-section">
            <div className="lp-classroom-option-title">
              <ClockCircleOutlined />
              <span>推荐时长</span>
            </div>
            <div className="lp-classroom-option-grid">
              {recommendedDurations.map((item) => (
                <button
                  key={item.band}
                  type="button"
                  className={`lp-classroom-option-card${duration === item.value ? " is-selected" : ""}`}
                  onClick={() => setDuration(item.value)}
                >
                  <em>{item.band} 分钟</em>
                  <strong>{item.value}</strong>
                  <span>{item.tone}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="lp-classroom-option-section">
            <div className="lp-classroom-option-title">
              <ExperimentOutlined />
              <span>课程深度</span>
            </div>
            <div className="lp-classroom-depth-grid">
              {DEPTH_LEVELS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={depthLevel === item.value ? "is-selected" : ""}
                  onClick={() => setDepthLevel(item.value)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="lp-classroom-option-section">
            <div className="lp-classroom-option-title">
              <PlayCircleOutlined />
              <span>讲授模式</span>
            </div>
            <div className="lp-classroom-mode-grid">
              {TEACHING_MODES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={teachingMode === item ? "is-selected" : ""}
                  onClick={() => setTeachingMode(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="lp-classroom-option-section">
            <div className="lp-classroom-option-title">
              <BulbOutlined />
              <span>课堂关键词</span>
            </div>
            <div className="lp-classroom-keyword-row">
              {recommendedKeywords.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={keywords.includes(item) ? "is-selected" : ""}
                  onClick={() => toggleKeyword(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="lp-classroom-custom-keyword">
              <Input
                value={customKeyword}
                onChange={(e) => setCustomKeyword(e.target.value)}
                onPressEnter={addCustomKeyword}
                placeholder="添加自定义关键词"
              />
              <Button icon={<PlusOutlined />} onClick={addCustomKeyword}>
                添加
              </Button>
            </div>
          </div>
          <div className="lp-classroom-wizard-actions">
            <Button onClick={() => setWizardStep(1)}>上一步</Button>
            <Button type="primary" onClick={() => setWizardStep(3)}>
              下一步
            </Button>
          </div>
        </div>
      )}

      {wizardStep === 3 && (
        <div className="lp-classroom-wizard-panel">
          <div className="lp-classroom-panel-head">
            <span>第三步</span>
            <strong>确认课堂蓝图</strong>
          </div>
          <div className="lp-classroom-blueprint">
            <div>
              <span>课堂主题</span>
              <strong>{session.title}</strong>
              <p>{session.objective}</p>
            </div>
            <div>
              <span>生成配置</span>
              <strong>
                {duration} 分钟 · {teachingMode} · {depthLevel}
              </strong>
              <p>{keywords.length ? keywords.join(" / ") : "未选择关键词"}</p>
            </div>
            <div>
              <span>课堂结构</span>
              <strong>导入 · 讲解 · 互动 · 总结 · 作业</strong>
              <p>会同时生成课件页面、教师讲稿、课堂检查题和课后任务。</p>
            </div>
          </div>
          {generating && (
            <div className="lp-classroom-generation-card">
              <div>
                <span>{generationStage}</span>
                <strong>{generationProgress}%</strong>
              </div>
              <Progress percent={generationProgress} showInfo={false} />
            </div>
          )}
          <div className="lp-classroom-wizard-actions">
            <Button onClick={() => setWizardStep(2)} disabled={generating}>
              上一步
            </Button>
            <Button
              type="primary"
              icon={<VideoCameraOutlined />}
              loading={generating}
              disabled={currentJobRunning}
              onClick={handleGenerate}
            >
              开始生成课堂
            </Button>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <main className="lp-classroom-page">
      <header className="lp-classroom-topbar">
        <Button icon={<ArrowLeftOutlined />} onClick={() => clientNavigate("/path")}>
          返回路径
        </Button>
        <div className="lp-classroom-title">
          <span>{session.courseName}</span>
          <strong>{generated?.title || session.title}</strong>
        </div>
        <Tag className="lp-classroom-live" icon={<VideoCameraOutlined />}>
          {classroomStatusLabel}
        </Tag>
      </header>

      {!generated && renderWizard()}

      {generated && (
        <>
          <section className="lp-classroom-shell">
            <aside className="lp-classroom-outline">
              <div className="lp-classroom-side-head">
                <BookOutlined />
                <span>本节目录</span>
              </div>
              {slides.map((item, index) => (
                <button
                  key={`${item.kicker}-${item.title}`}
                  type="button"
                  className={`lp-classroom-outline-item${index === slideIndex ? " is-active" : ""}`}
                  onClick={() => setSlideIndex(index)}
                >
                  <em>{item.kicker}</em>
                  <strong>{item.title}</strong>
                </button>
              ))}
              <div className="lp-classroom-resource-box">
                <span>参考资源</span>
                <strong>{sourceResources.length || 0}</strong>
                <small>
                  {sourceResources.length
                    ? sourceResources.slice(0, 3).map((r) => r.title).join(" / ")
                    : "未选择资源时按路径目标生成"}
                </small>
              </div>
              <Button
                block
                icon={<ReloadOutlined />}
                onClick={() => {
                  setGenerated(null);
                  setActiveClassroomResult(null);
                }}
                style={{ marginTop: 12 }}
              >
                重新配置
              </Button>
            </aside>

            <section className="lp-classroom-stage">
              <div
                className={`lp-classroom-slide lp-classroom-slide--${slideLayout} tone-${slideAccent}${
                  slideIsImagePage ? " lp-classroom-slide--image-page" : ""
                }`}
              >
                {slideIsImagePage && (
                  <img className="lp-classroom-slide-full-image" src={slideImageUrl} alt={slide.title} />
                )}
                <div className="lp-slide-canvas">
                  <div className="lp-slide-main">
                    <div className="lp-classroom-slide-kicker">{slide.kicker}</div>
                    <h1>{slide.title}</h1>
                    <p>{slide.body}</p>
                    <div className="lp-classroom-board">
                      {(slide.board || []).map((item, index) => (
                        <div key={`${item}-${index}`} className="lp-classroom-board-row">
                          <span>{index + 1}</span>
                          <strong>{item}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="lp-slide-visual" aria-hidden="true">
                    <div className="lp-slide-visual-chip">{getSlideVisualLabel(slide.layout)}</div>
                    {slideImageUrl ? (
                      <div className="lp-slide-image-frame">
                        <img src={slideImageUrl} alt="" />
                      </div>
                    ) : slideVisualBlocks.length ? (
                      <div className="lp-slide-visual-blocks">
                        {slideVisualBlocks.map((block, index) =>
                          renderClassroomVisualBlock(block, slide.board || [], index)
                        )}
                      </div>
                    ) : (
                      <div className="lp-slide-diagram">
                        {(slide.board || []).slice(0, 4).map((item, index) => (
                          <div key={`${item}-visual-${index}`} className="lp-slide-diagram-node">
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <em>{item.length > 12 ? `${item.slice(0, 12)}...` : item}</em>
                          </div>
                        ))}
                      </div>
                    )}
                    {slide.visual_theme && <small>{slide.visual_theme}</small>}
                  </div>
                  <div className="lp-slide-footer">
                    <span />
                    <strong>{slideIndex + 1} / {slides.length}</strong>
                  </div>
                </div>
              </div>
              <div className="lp-classroom-progress">
                <span>课堂进度</span>
                <Progress percent={progress} showInfo={false} />
                <strong>{progress}%</strong>
              </div>
              {mode === "practice" && (activeQuiz || quizGenerating) && (
                <div className="lp-classroom-quiz-card">
                  {!activeQuiz ? (
                    <div className="lp-classroom-quiz-loading">
                      <Spin size="small" />
                      <span>正在根据当前页生成一道新选择题...</span>
                    </div>
                  ) : (
                    <>
                  <div className="lp-classroom-quiz-head">
                    <div>
                      <span>课堂选择题</span>
                      <strong>{activeQuiz.question}</strong>
                    </div>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={quizGenerating}
                      onClick={() => void refreshClassroomQuiz()}
                    >
                      {quizGenerating ? "出题中" : "换一题"}
                    </Button>
                  </div>
                  <div className="lp-classroom-quiz-options">
                    {activeQuiz.options.map((option) => {
                      const isChosen = quizAnswer === option.id;
                      const isAnswer = activeQuiz.answerId === option.id;
                      const stateClass =
                        quizAnswer && isAnswer
                          ? " is-correct"
                          : quizAnswer && isChosen && !isAnswer
                            ? " is-wrong"
                            : "";
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`${isChosen ? "is-selected" : ""}${stateClass}`}
                          onClick={() => answerClassroomQuiz(option.id)}
                        >
                          <span>{option.id}</span>
                          <strong>{option.text}</strong>
                        </button>
                      );
                    })}
                  </div>
                  {quizFeedback && (
                    <div className={`lp-classroom-quiz-feedback is-${quizFeedback}`}>
                      <strong>{quizFeedback === "correct" ? "答对了" : "还差一步"}</strong>
                      <p>{quizFeedback === "correct" ? activeQuiz.explanation : activeQuiz.transfer}</p>
                      <div>
                        <Button size="small" onClick={() => setShowQuizAnalysis((prev) => !prev)}>
                          {showQuizAnalysis ? "收起解析" : "查看解析"}
                        </Button>
                        {quizFeedback === "wrong" && (
                          <Button
                            size="small"
                            type="primary"
                            loading={quizGenerating}
                            onClick={() => void refreshClassroomQuiz(true)}
                          >
                            举一反三
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  {showQuizAnalysis && (
                    <div className="lp-classroom-quiz-analysis">
                      <span>解析</span>
                      <p>{activeQuiz.explanation}</p>
                    </div>
                  )}
                    </>
                  )}
                </div>
              )}
              {mode !== "practice" && (
                <div className="lp-classroom-qa-card">
                  <div className="lp-classroom-qa-head">
                    <div>
                      <span>课堂问答</span>
                      <strong>围绕当前页提问，AI 会结合课堂内容回答</strong>
                    </div>
                  </div>
                  <div className="lp-classroom-qa-input">
                    <Input.TextArea
                      value={classroomQuestion}
                      onChange={(e) => setClassroomQuestion(e.target.value)}
                      onPressEnter={(e) => {
                        if (!e.shiftKey) {
                          e.preventDefault();
                          void askClassroomQuestion();
                        }
                      }}
                      autoSize={{ minRows: 2, maxRows: 4 }}
                      placeholder="例如：这个步骤为什么要先判断输入和输出？"
                    />
                    <Button type="primary" loading={classroomAnswering} onClick={() => void askClassroomQuestion()}>
                      提问
                    </Button>
                  </div>
                  {(classroomAnswering || classroomAnswer) && (
                    <div className="lp-classroom-qa-answer">
                      <span>{classroomAnswering ? "正在回答" : "AI 回答"}</span>
                      <p>{classroomAnswering ? "我正在结合当前页内容组织回答..." : classroomAnswer}</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <aside className="lp-classroom-teacher">
              <div className="lp-classroom-teacher-head">
                <div>
                  <span>AI 老师</span>
                  <strong>{MODE_LABEL[mode]}</strong>
                </div>
                <div className="lp-classroom-teacher-actions">
                  <Button size="small" disabled={!generated} loading={exportingPptx} onClick={handleExportPptx}>
                    下载 PPT
                  </Button>
                  <PlayCircleOutlined />
                </div>
              </div>
              <div className="lp-classroom-teacher-bubble">
                <p>{adaptiveTeacherScript}</p>
              </div>
              <div className="lp-classroom-realtime-panel">
                <div className="lp-classroom-realtime-head">
                  <span>实时课堂状态</span>
                  <strong>{adaptiveGuidance}</strong>
                </div>
                <div className="lp-classroom-realtime-grid">
                  {[
                    ["困惑", classroomSignals.confusion],
                    ["负荷", classroomSignals.load],
                    ["好奇", classroomSignals.curiosity],
                    ["掌握", classroomSignals.mastery],
                  ].map(([label, value]) => (
                    <div key={label} className="lp-classroom-realtime-meter">
                      <span>{label}</span>
                      <Progress percent={Number(value)} showInfo={false} size="small" />
                      <em>{value}%</em>
                    </div>
                  ))}
                </div>
                {latestFeedback && (
                  <div className="lp-classroom-feedback-note">
                    {latestFeedback.at} · 已根据“{latestFeedback.label}”调整讲法
                  </div>
                )}
              </div>
              <div className="lp-classroom-controls">
                <Tooltip title="降低讲解密度，回到最小概念">
                  <Button icon={<QuestionCircleOutlined />} onClick={() => recordClassroomSignal("confused")}>
                    听不懂
                  </Button>
                </Tooltip>
                <Button icon={<PauseCircleOutlined />} onClick={() => recordClassroomSignal("slow")}>
                  讲慢点
                </Button>
                <Button icon={<SwapOutlined />} onClick={() => recordClassroomSignal("example")}>
                  换个例子
                </Button>
                <Button icon={<ExperimentOutlined />} onClick={() => recordClassroomSignal("practice")}>
                  来道题
                </Button>
                <Button type="primary" onClick={nextSlide} disabled={slideIndex >= slides.length - 1}>
                  继续
                </Button>
              </div>
            </aside>
          </section>

          <section className="lp-classroom-homework">
            <div className="lp-classroom-handout">
              <div>
                <span>课堂讲义</span>
                <h2>本节复习材料</h2>
              </div>
              <div className="lp-classroom-handout-grid">
                {handout.slice(0, 4).map((item) => (
                  <article key={`${item.heading}-${item.content.slice(0, 12)}`}>
                    <strong>{item.heading}</strong>
                    <p>{item.content}</p>
                  </article>
                ))}
              </div>
            </div>
            <div>
              <span>课后任务</span>
              <h2>轻量巩固任务</h2>
            </div>
            {homework.map((task) => (
              <button
                key={task}
                type="button"
                className={finishedTasks.includes(task) ? "is-done" : ""}
                onClick={() => toggleTask(task)}
              >
                <CheckCircleOutlined />
                {task}
              </button>
            ))}
            <Button icon={<FileTextOutlined />} onClick={() => clientNavigate("/evaluation")}>
              去评估页
            </Button>
          </section>
        </>
      )}
    </main>
  );
}
