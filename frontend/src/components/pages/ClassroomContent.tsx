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
  exportClassroomPptx,
  generateClassroomInteraction,
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
type ClassroomPhase = "intro" | "explain" | "example" | "mini_quiz" | "feedback" | "summary";
type LessonEventType =
  | "lesson_started"
  | "phase_changed"
  | "slide_viewed"
  | "button_confused_clicked"
  | "button_slow_clicked"
  | "button_example_clicked"
  | "mini_quiz_started"
  | "quiz_answer_submitted"
  | "quiz_correct"
  | "quiz_wrong"
  | "knowledge_point_mastered"
  | "knowledge_point_stuck"
  | "lesson_completed";
type LessonEvent = {
  id: string;
  type: LessonEventType;
  at: string;
  slideIndex: number;
  phase: ClassroomPhase;
  knowledgePoint: string;
  detail?: string;
};
type QuizHistoryItem = {
  id: string;
  quizId?: string;
  question: string;
  selectedId: string;
  answerId: string;
  correct: boolean;
  knowledgePoint: string;
  slideIndex: number;
  level?: QuizLevel;
  type?: QuizType;
  diagnosis?: string;
  misconception?: string;
  remedialExplanation?: string;
  at: string;
};
type InteractionCard =
  | { type: "confused"; title: string; body: string; diagnosis?: string; steps?: string[] }
  | { type: "slow"; title: string; body: string; steps: string[] }
  | { type: "example"; title: string; body: string; knowledgePoint: string; helps: string; exampleType?: string; checkQuestion?: string };
type ClassroomQuiz = {
  id: string;
  question: string;
  options: { id: string; text: string; diagnosis?: string }[];
  answerId: string;
  explanation: string;
  transfer: string;
  level: QuizLevel;
  type: QuizType;
  targetKnowledgePoint: string;
  ability: string;
  misconception: string;
  remedialExplanation: string;
  diagnosis?: Record<string, string>;
};

type QuizLevel = "basic" | "application" | "trap" | "exam";
type QuizType = "single_choice" | "true_false";

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

const CLASSROOM_PHASES: { key: ClassroomPhase; label: string }[] = [
  { key: "intro", label: "目标导入" },
  { key: "explain", label: "核心讲解" },
  { key: "example", label: "例子演示" },
  { key: "mini_quiz", label: "课中小测" },
  { key: "feedback", label: "反馈纠错" },
  { key: "summary", label: "课堂总结" },
];

const CONFUSION_DIAGNOSES = ["概念没懂", "步骤没懂", "公式没懂", "例子没懂", "前置知识缺失"];
const EXAMPLE_TYPES = ["生活类比", "专业场景例子", "数值小例子", "反例 / 易错例子"];

const QUIZ_LEVEL_ORDER: QuizLevel[] = ["basic", "application", "trap", "exam"];
const QUIZ_LEVEL_LABEL: Record<QuizLevel, string> = {
  basic: "基础理解题",
  application: "应用判断题",
  trap: "易错辨析题",
  exam: "应试题 / 学科考察题",
};
const QUIZ_TYPE_LABEL: Record<QuizType, string> = {
  single_choice: "单选题",
  true_false: "判断题",
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
    label: "已掌握",
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

function formatElapsed(seconds?: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${rest} 秒`;
  return `${minutes} 分 ${String(rest).padStart(2, "0")} 秒`;
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
): any {
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

function getKnowledgePoints(session: ClassroomSession | null, slides: ClassroomSlide[]): string[] {
  const loose = session as (ClassroomSession & { knowledge_points?: unknown }) | null;
  const raw = loose?.knowledge_points;
  if (Array.isArray(raw)) {
    const values = raw
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          return String(rec.title || rec.name || rec.label || rec.point || "");
        }
        return "";
      })
      .filter(Boolean);
    if (values.length) return unique(values);
  }
  return unique(slides.map((item, index) => item.title || `第 ${index + 1} 页`));
}

function getKnowledgePointForSlide(
  session: ClassroomSession | null,
  slides: ClassroomSlide[],
  slideIndex: number
) {
  const points = getKnowledgePoints(session, slides);
  return points[Math.min(slideIndex, Math.max(points.length - 1, 0))] || slides[slideIndex]?.title || `第 ${slideIndex + 1} 页`;
}

function normalizeQuizOption(item: unknown, index: number): { id: string; text: string } {
  if (typeof item === "string") return { id: String.fromCharCode(65 + index), text: item };
  const rec = (item || {}) as Record<string, unknown>;
  return {
    id: String(rec.id || rec.key || rec.label || String.fromCharCode(65 + index)),
    text: String(rec.text || rec.content || rec.option || rec.value || `选项 ${index + 1}`),
  };
}

function normalizeLessonQuiz(raw: unknown, knowledgePoint: string, slideIndex: number): any {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const question = String(rec.question || rec.title || "");
  const rawOptions = Array.isArray(rec.options) ? rec.options : Array.isArray(rec.choices) ? rec.choices : [];
  const options = rawOptions.map(normalizeQuizOption).slice(0, 4);
  if (!question || options.length < 2) return null;
  const answerRaw = String(rec.answer_id || rec.answerId || rec.correct || rec.answer || options[0]?.id || "A");
  const answerByText = options.find((item) => item.text === answerRaw)?.id;
  return {
    id: String(rec.id || `${knowledgePoint}-${slideIndex}-mini`),
    question,
    options,
    answerId: answerByText || answerRaw || options[0].id,
    explanation: String(rec.explanation || rec.analysis || rec.reason || `这题检查的是「${knowledgePoint}」的核心理解。`),
    transfer: String(rec.transfer || rec.extension || "换一个场景时，先找输入、条件和目标，再判断答案。"),
  };
}

function findMiniQuiz(
  session: ClassroomSession | null,
  knowledgePoint: string,
  slideIndex: number
): any {
  const loose = session as (ClassroomSession & { mini_quiz?: unknown; mini_quizzes?: unknown }) | null;
  const raw = loose?.mini_quiz || loose?.mini_quizzes;
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const match =
      raw.find((item) => {
        const rec = (item || {}) as Record<string, unknown>;
        return rec.slide_index === slideIndex || rec.slideIndex === slideIndex || rec.knowledge_point === knowledgePoint;
      }) || raw[Math.min(slideIndex, raw.length - 1)] || raw[0];
    return normalizeLessonQuiz(match, knowledgePoint, slideIndex);
  }
  if (typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    const keyed = rec[knowledgePoint] || rec[String(slideIndex)] || rec[String(slideIndex + 1)];
    return normalizeLessonQuiz(keyed || raw, knowledgePoint, slideIndex);
  }
  return null;
}

function buildCheckQuestionQuiz(
  checkQuestion: ClassroomSession["check_question"] | undefined,
  knowledgePoint: string,
  slideIndex: number
): any {
  if (!checkQuestion?.question) return null;
  const expected = checkQuestion.expected_answer || `围绕「${knowledgePoint}」说明关键判断`;
  const options = unique([
    expected,
    "只记结论，不说明适用条件",
    "跳过当前知识点，直接做综合题",
    "只看答案，不解释中间步骤",
  ]).slice(0, 4).map((text, index) => ({ id: String.fromCharCode(65 + index), text }));
  return {
    id: `${knowledgePoint}-${slideIndex}-check`,
    question: checkQuestion.question,
    options,
    answerId: options[0]?.id || "A",
    explanation: checkQuestion.hint || `这道题用来确认你是否真正理解「${knowledgePoint}」。`,
    transfer: "如果答错，先回到当前页，把关键词和例子重新对齐，再换一道同类题。",
  };
}

function quizLevelFromVariant(variant: number): QuizLevel {
  return QUIZ_LEVEL_ORDER[Math.abs(variant) % QUIZ_LEVEL_ORDER.length] || "basic";
}

function makeSpecificQuiz(
  params: {
    id: string;
    level: QuizLevel;
    type: QuizType;
    knowledgePoint: string;
    question: string;
    options: { id: string; text: string; diagnosis: string }[];
    answerId: string;
    explanation: string;
    misconception: string;
    remedialExplanation: string;
  }
): ClassroomQuiz {
  return {
    id: params.id,
    level: params.level,
    type: params.type,
    targetKnowledgePoint: params.knowledgePoint,
    ability:
      params.level === "exam"
        ? "exam_reasoning"
        : params.level === "trap"
          ? "misconception_detection"
          : params.level === "application"
            ? "application"
            : "concept_understanding",
    question: params.question,
    options: params.options,
    answerId: params.answerId,
    explanation: params.explanation,
    transfer: params.remedialExplanation,
    misconception: params.misconception,
    remedialExplanation: params.remedialExplanation,
    diagnosis: Object.fromEntries(params.options.map((item) => [item.id, item.diagnosis])),
  };
}

function buildSpecificClassroomQuiz(
  slide: ClassroomSlide,
  checkQuestion: ClassroomSession["check_question"] | undefined,
  variant: number,
  targetLevel?: QuizLevel
): ClassroomQuiz {
  const level = targetLevel || quizLevelFromVariant(variant);
  const points = unique([...(slide.board || []), slide.title, slide.body]).slice(0, 5);
  const knowledgePoint = slide.title || points[0] || "当前知识点";
  const core = points[variant % Math.max(points.length, 1)] || knowledgePoint;
  const second = points[(variant + 1) % Math.max(points.length, 1)] || slide.body.slice(0, 28) || knowledgePoint;
  if (level === "trap") {
    return makeSpecificQuiz({
      id: `${knowledgePoint}-${variant}-trap`,
      level,
      type: "true_false",
      knowledgePoint,
      question: `判断：在“${knowledgePoint}”中，只要结论看起来符合“${core}”，即使没有检查适用条件，也可以认为推理成立。`,
      options: [
        { id: "T", text: "正确", diagnosis: "可能把结论相似误认为推理成立。" },
        { id: "F", text: "错误", diagnosis: "能意识到适用条件和推理依据必须同时成立。" },
      ],
      answerId: "F",
      explanation: `该命题错误。“${core}”必须和当前页给出的条件、对象、目标相匹配；结论相似不代表推理过程成立。`,
      misconception: "省略适用条件，凭结论相似做判断",
      remedialExplanation: `先找“${core}”依赖的条件，再判断新场景是否仍满足这些条件。`,
    });
  }
  if (level === "application") {
    return makeSpecificQuiz({
      id: `${knowledgePoint}-${variant}-application`,
      level,
      type: "single_choice",
      knowledgePoint,
      question: `把“${knowledgePoint}”用于一个新场景时，已知条件变化但目标仍和“${core}”有关，下一步最合理的是？`,
      options: [
        { id: "A", text: "重新列出输入、条件和目标，再选择对应方法", diagnosis: "能把知识点迁移到新条件。" },
        { id: "B", text: `直接沿用“${second}”中的处理过程`, diagnosis: "可能机械套用例题流程。" },
        { id: "C", text: "只看主题是否相同，不再检查边界条件", diagnosis: "忽略条件变化，容易误用方法。" },
        { id: "D", text: "先给出结论，再寻找支持理由", diagnosis: "推理顺序倒置，结论缺少依据。" },
      ],
      answerId: "A",
      explanation: `正确答案是 A。应用“${knowledgePoint}”时要先确认输入、条件和目标，再判断“${core}”是否适用。B/C 都忽略条件，D 缺少推理链。`,
      misconception: "把课堂示例机械套用到新条件",
      remedialExplanation: "做应用题时先写三行：输入是什么、条件是什么、要判断或求解什么。",
    });
  }
  if (level === "exam") {
    return makeSpecificQuiz({
      id: `${knowledgePoint}-${variant}-exam`,
      level,
      type: "single_choice",
      knowledgePoint,
      question: `应试题：围绕“${knowledgePoint}”，若题目要求你根据“${core}”完成推理，哪一种答题路径最稳妥？`,
      options: [
        { id: "A", text: "先写条件与目标，再列关键步骤，最后检查结果是否满足题设", diagnosis: "具备完整的条件分析和结果检验意识。" },
        { id: "B", text: "先选最像的公式，算完后不再回看题设", diagnosis: "可能公式套用正确但条件不匹配。" },
        { id: "C", text: "只写最终结论，省略中间推理", diagnosis: "无法验证过程，也难发现条件遗漏。" },
        { id: "D", text: "把相邻知识点的结论合并使用", diagnosis: "存在概念混淆，容易出现前提错误。" },
      ],
      answerId: "A",
      explanation: `正确答案是 A。应试题看重“条件分析 -> 方法选择 -> 关键步骤 -> 结果检验”。B 忽略题设，C 缺少过程，D 混淆知识点。`,
      misconception: "会选公式但缺少条件分析和结果检验",
      remedialExplanation: "把答案写成四段：题设条件、使用依据、关键步骤、结果回代或解释。",
    });
  }
  return makeSpecificQuiz({
    id: `${knowledgePoint}-${variant}-basic`,
    level: "basic",
    type: "single_choice",
    knowledgePoint,
    question: checkQuestion?.question && !/复述|核心直觉/.test(checkQuestion.question)
      ? checkQuestion.question
      : `在“${knowledgePoint}”这一页中，围绕“${core}”进行判断时，最需要先确认的是哪一项？`,
    options: [
      { id: "A", text: `${core}的适用条件以及它要解决的具体问题`, diagnosis: "能把知识点和适用条件联系起来。" },
      { id: "B", text: `只比较“${knowledgePoint}”里出现的关键词`, diagnosis: "可能把表面关键词当成理解依据。" },
      { id: "C", text: `先套用“${second}”，不检查问题条件`, diagnosis: "可能忽略条件，容易混用相邻知识点。" },
      { id: "D", text: "先看最终结论是否熟悉，再决定方法", diagnosis: "可能用记忆替代理解，无法处理变式题。" },
    ],
    answerId: "A",
    explanation: `正确答案是 A。学习“${knowledgePoint}”时，先确认“${core}”解决什么问题、在什么条件下使用，再进入公式、步骤或例子。`,
    misconception: "把关键词记忆误当作概念理解",
    remedialExplanation: `回到这一页时，先用一句话写出“${core}解决的问题”和“使用它前要检查的条件”。`,
  });
}

function normalizeSpecificQuizOption(item: unknown, index: number): { id: string; text: string; diagnosis?: string } {
  if (typeof item === "string") return { id: String.fromCharCode(65 + index), text: item };
  const rec = (item || {}) as Record<string, unknown>;
  return {
    id: String(rec.id || rec.key || rec.label || String.fromCharCode(65 + index)).slice(0, 1).toUpperCase(),
    text: String(rec.text || rec.content || rec.option || rec.value || `选项 ${index + 1}`),
    diagnosis: rec.diagnosis ? String(rec.diagnosis) : undefined,
  };
}

function normalizeSpecificLessonQuiz(raw: unknown, knowledgePoint: string, slideIndex: number): ClassroomQuiz | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const question = String(rec.question || rec.title || "");
  const level = QUIZ_LEVEL_ORDER.includes(rec.level as QuizLevel) ? (rec.level as QuizLevel) : "basic";
  const type = rec.type === "true_false" || rec.question_type === "true_false" ? "true_false" : "single_choice";
  const rawOptions = Array.isArray(rec.options) ? rec.options : Array.isArray(rec.choices) ? rec.choices : [];
  const options =
    type === "true_false"
      ? [
          { id: "T", text: "正确", diagnosis: "选择正确说明你认为命题的条件和结论能够对应。" },
          { id: "F", text: "错误", diagnosis: "选择错误说明你认为命题遗漏了条件、方向或适用范围。" },
        ]
      : rawOptions.map(normalizeSpecificQuizOption).slice(0, 4);
  if (!question || (type === "single_choice" && options.length !== 4) || (type === "true_false" && options.length !== 2)) return null;
  if (/复述本节课|核心直觉/.test(question)) return null;
  const answerRaw = String(rec.answer_id || rec.answerId || rec.correct || rec.answer || options[0]?.id || "A").slice(0, 1).toUpperCase();
  const answerByText = options.find((item) => item.text === answerRaw)?.id;
  const answerId = answerByText || answerRaw || options[0].id;
  const diagnosisRecord = typeof rec.diagnosis === "object" && rec.diagnosis ? (rec.diagnosis as Record<string, string>) : {};
  const normalizedOptions = options.map((item) => ({
    ...item,
    diagnosis: item.diagnosis || diagnosisRecord[item.id] || "该选项反映了对当前知识点的一个可能理解偏差。",
  }));
  return {
    id: String(rec.id || `${knowledgePoint}-${slideIndex}-${level}`),
    level,
    type,
    targetKnowledgePoint: String(rec.target_knowledge_point || rec.knowledge_point || knowledgePoint),
    ability: String(rec.ability || (level === "exam" ? "exam_reasoning" : "concept_understanding")),
    question,
    options: normalizedOptions,
    answerId,
    explanation: String(rec.explanation || rec.analysis || rec.reason || `这题检查的是“${knowledgePoint}”的具体理解。`),
    transfer: String(rec.transfer || rec.extension || rec.remedial_explanation || "换一个场景时，先确认条件、对象和目标，再选择方法。"),
    misconception: String(rec.misconception || "当前题目用于诊断具体误区。"),
    remedialExplanation: String(rec.remedial_explanation || rec.transfer || "回到当前页，重新对齐条件、概念和例子，再做同层题。"),
    diagnosis: Object.fromEntries(normalizedOptions.map((item) => [item.id, item.diagnosis || ""])),
  };
}

function findSpecificMiniQuiz(
  session: ClassroomSession | null,
  knowledgePoint: string,
  slideIndex: number,
  level?: QuizLevel,
  usedIds: string[] = [],
  usedTexts: string[] = []
): ClassroomQuiz | null {
  const loose = session as (ClassroomSession & { mini_quiz?: unknown; mini_quizzes?: unknown }) | null;
  const raw = loose?.mini_quizzes || loose?.mini_quiz;
  if (!raw) return null;
  const candidates = Array.isArray(raw)
    ? raw
    : typeof raw === "object"
      ? Object.values(raw as Record<string, unknown>)
      : [];
  const normalized = candidates
    .map((item, index) => normalizeSpecificLessonQuiz(item, knowledgePoint, index))
    .filter((item): item is ClassroomQuiz => Boolean(item))
    .filter((item) => !usedIds.includes(item.id) && !usedTexts.includes(item.question));
  const samePoint = normalized.filter((item) => item.targetKnowledgePoint === knowledgePoint || item.id.includes(String(slideIndex)));
  const pool = samePoint.length ? samePoint : normalized;
  return pool.find((item) => item.level === level) || pool[0] || null;
}

function buildSpecificCheckQuestionQuiz(
  checkQuestion: ClassroomSession["check_question"] | undefined,
  knowledgePoint: string,
  slideIndex: number,
  slide?: ClassroomSlide,
  level: QuizLevel = "basic"
): ClassroomQuiz | null {
  const baseSlide = slide || { title: knowledgePoint, body: "", board: [], teacher_note: "" };
  return buildSpecificClassroomQuiz(baseSlide as ClassroomSlide, checkQuestion, slideIndex + QUIZ_LEVEL_ORDER.indexOf(level), level);
}

function fallbackSlowSteps(knowledgePoint: string, slide: ClassroomSlide): string[] {
  const points = unique([...(slide.board || []), slide.body, knowledgePoint]).slice(0, 3);
  if (points.length >= 2) return points;
  return [
    `先说清「${knowledgePoint}」要解决什么问题`,
    "再找输入、条件和输出",
    "最后用一个最小例子验证理解",
  ];
}

function formatInteractionStep(step: unknown) {
  if (typeof step === "string") return step;
  if (step && typeof step === "object") {
    const rec = step as Record<string, unknown>;
    const title = String(rec.step_title || rec.title || "");
    const body = String(rec.step_content || rec.content || rec.body || "");
    return unique([title, body]).join("：") || JSON.stringify(rec);
  }
  return String(step || "");
}

function buildSummarySuggestion(args: {
  stuckKnowledgePoints: string[];
  wrongStreak: number;
  masteredKnowledgePoints: string[];
  confusedCount: number;
}) {
  if (args.stuckKnowledgePoints.length) return "建议回学习路径补资源，先把卡住的知识点重新看一遍。";
  if (args.wrongStreak >= 2) return "建议重新学习当前课堂，并优先使用课中小测检查理解。";
  if (args.masteredKnowledgePoints.length >= 2) return "建议进入下一路径节点，把当前掌握迁移到新任务里。";
  if (args.confusedCount >= 2) return "建议用讲慢点模式复习，把每个知识点拆成两三步。";
  return "建议完成课后任务，再进入评估页做一次轻量复盘。";
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

function buildSlideOutcomes(slide: ClassroomSlide): string[] {
  const learningGoals = Array.isArray(slide.learning_goal)
    ? slide.learning_goal
    : slide.learning_goal
      ? [slide.learning_goal]
      : [];
  const candidates = unique([
    ...learningGoals,
    ...(slide.key_points || []),
    ...(slide.bullets || []),
    ...(slide.board || []),
  ]).map((item) => item.trim()).filter((item) => item.length >= 4);
  if (candidates.length >= 2) return candidates.slice(0, 3);
  return unique([
    ...candidates,
    `用自己的话说明「${slide.title}」的核心含义`,
    `判断「${slide.title}」在什么条件下适用`,
    "知道下一步该用例题还是小测检查理解",
  ]).slice(0, 3);
}

function buildTeacherRecommendation(args: {
  phase: ClassroomPhase;
  mode: ClassroomMode;
  confusedCount: number;
  wrongStreak: number;
  hasPassedCurrentQuiz: boolean;
}) {
  if (args.phase === "summary") return "先看课后复习卡，再决定回看薄弱页还是进入评估。";
  if (args.phase === "feedback" && args.wrongStreak > 0) return "先对照错因看解析，再用“讲慢点”或“换个例子”补上缺口。";
  if (args.phase === "mini_quiz") return "先独立完成当前小题；答错时重点看错因，不要只记答案。";
  if (args.hasPassedCurrentQuiz) return "本页确认题已通过，可以点击“已掌握”进入下一页。";
  if (args.wrongStreak >= 2) return "连续答错，建议回到讲慢点模式，把条件和步骤逐项对齐。";
  if (args.mode === "slow") return "一次只看一个步骤，能复述后再进入下一小步。";
  if (args.mode === "example") return "把新例子和原概念逐项对应，再判断哪些条件没有变化。";
  if (args.mode === "confused" || args.confusedCount >= 2) return "先说出具体卡点，再换一种讲法，不急着继续翻页。";
  return "先理解本页核心直觉，再用一道最小确认题检查是否真的会了。";
}

function buildNaturalClassroomStatus(args: {
  confusion: number;
  load: number;
  wrongStreak: number;
  phase: ClassroomPhase;
}) {
  if (args.phase === "summary") return "当前状态：本节已完成，正在整理复习重点。";
  if (args.wrongStreak >= 2) return "当前状态：连续答错，建议回到讲慢点模式。";
  if (args.confusion >= 62 || args.load >= 70) return "当前状态：对本页仍有困惑，建议换个例子或分步讲解。";
  if (args.phase === "feedback") return "当前状态：正在消化反馈，先弄清错因再继续。";
  if (args.phase === "mini_quiz") return "当前状态：正在确认掌握，先独立作答。";
  return "当前状态：节奏正常，可以继续推进。";
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

  const [teacherMode, setTeacherMode] = useState<ClassroomMode>("normal");
  const mode = teacherMode;
  const setMode = setTeacherMode;
  const [slideIndex, setSlideIndex] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<ClassroomPhase>("intro");
  const [confusedCount, setConfusedCount] = useState(0);
  const [slowCount, setSlowCount] = useState(0);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [masteredKnowledgePoints, setMasteredKnowledgePoints] = useState<string[]>([]);
  const [stuckKnowledgePoints, setStuckKnowledgePoints] = useState<string[]>([]);
  const [masteredSlideIndexes, setMasteredSlideIndexes] = useState<number[]>([]);
  const [masteryCheckSlideIndex, setMasteryCheckSlideIndex] = useState<number | null>(null);
  const [quizHistory, setQuizHistory] = useState<QuizHistoryItem[]>([]);
  const [lessonEvents, setLessonEvents] = useState<LessonEvent[]>([]);
  const [interactionCard, setInteractionCard] = useState<InteractionCard | null>(null);
  const [interactionLoading, setInteractionLoading] = useState<ClassroomSignal | null>(null);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [slowStepIndex, setSlowStepIndex] = useState(0);
  const [interactionCounts, setInteractionCounts] = useState({ confused: 0, slow: 0, example: 0 });
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
  const [usedQuestionIds, setUsedQuestionIds] = useState<string[]>([]);
  const [usedQuestionTexts, setUsedQuestionTexts] = useState<string[]>([]);
  const [passedQuizLevels, setPassedQuizLevels] = useState<Record<string, QuizLevel[]>>({});
  const [highMasteryPoints, setHighMasteryPoints] = useState<string[]>([]);
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
    setCurrentPhase("intro");
    setConfusedCount(0);
    setSlowCount(0);
    setCorrectStreak(0);
    setWrongStreak(0);
    setMasteredKnowledgePoints([]);
    setStuckKnowledgePoints([]);
    setMasteredSlideIndexes([]);
    setMasteryCheckSlideIndex(null);
    setQuizHistory([]);
    setUsedQuestionIds([]);
    setUsedQuestionTexts([]);
    setPassedQuizLevels({});
    setHighMasteryPoints([]);
    setLessonEvents([]);
    setInteractionCard(null);
    setInteractionLoading(null);
    setDiagnosisOpen(false);
    setSlowStepIndex(0);
    setInteractionCounts({ confused: 0, slow: 0, example: 0 });
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
    setCurrentPhase("intro");
    setFinishedTasks([]);
    setConfusedCount(0);
    setSlowCount(0);
    setCorrectStreak(0);
    setWrongStreak(0);
    setMasteredKnowledgePoints([]);
    setStuckKnowledgePoints([]);
    setMasteredSlideIndexes([]);
    setMasteryCheckSlideIndex(null);
    setQuizHistory([]);
    setUsedQuestionIds([]);
    setUsedQuestionTexts([]);
    setPassedQuizLevels({});
    setHighMasteryPoints([]);
    setLessonEvents([]);
    setInteractionCard(null);
    setInteractionLoading(null);
    setDiagnosisOpen(false);
    setSlowStepIndex(0);
    setInteractionCounts({ confused: 0, slow: 0, example: 0 });
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
  const currentJobSubStage = currentJobRunning || currentJobError ? activeClassroomJob?.sub_stage || "" : "";
  const currentJobElapsed = currentJobRunning || currentJobError ? activeClassroomJob?.elapsed_seconds || 0 : 0;
  const currentJobStillRunning = currentJobRunning && currentJobElapsed >= 45;
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
  const knowledgePoints = useMemo(() => getKnowledgePoints(generated, slides), [generated, slides]);
  const currentKnowledgePoint = getKnowledgePointForSlide(generated, slides, slideIndex);
  const currentSlideIndex = slideIndex;
  const currentPassedQuizLevels = passedQuizLevels[currentKnowledgePoint] || [];
  const nextQuizLevel: QuizLevel = wrongStreak >= 2
    ? "basic"
    : QUIZ_LEVEL_ORDER.find((level) => !currentPassedQuizLevels.includes(level)) || "exam";
  const getNextLevelAfter = (level?: QuizLevel): QuizLevel => {
    const index = level ? QUIZ_LEVEL_ORDER.indexOf(level) : -1;
    return QUIZ_LEVEL_ORDER[(index + 1 + QUIZ_LEVEL_ORDER.length) % QUIZ_LEVEL_ORDER.length] || "basic";
  };
  const getRefreshQuizLevel = (transfer = false): QuizLevel => {
    if (wrongStreak >= 2 && !transfer) return "basic";
    if (activeQuiz) return getNextLevelAfter(activeQuiz.level);
    if (usedQuestionTexts.length > 0 || transfer) {
      const baseIndex = Math.max(0, quizVariant);
      return QUIZ_LEVEL_ORDER[baseIndex % QUIZ_LEVEL_ORDER.length] || nextQuizLevel;
    }
    return nextQuizLevel;
  };
  const hasPassedCurrentQuiz = quizHistory.some(
    (item) => item.slideIndex === currentSlideIndex && item.correct
  );
  const hasMasteredCurrentSlide = masteredSlideIndexes.includes(currentSlideIndex);
  const hasMasteredCurrentKnowledgePoint =
    hasMasteredCurrentSlide || masteredKnowledgePoints.includes(currentKnowledgePoint);
  const lessonSummarySuggestion = buildSummarySuggestion({
    stuckKnowledgePoints,
    wrongStreak,
    masteredKnowledgePoints,
    confusedCount,
  });
  const wrongQuizItems = quizHistory.filter((item) => !item.correct);
  const wrongQuizKnowledgePoints = unique(wrongQuizItems.map((item) => item.knowledgePoint)).filter(Boolean);
  const quizMisconceptions = wrongQuizItems
    .map((item) => `${item.knowledgePoint}：${item.diagnosis || item.misconception || `选择了 ${item.selectedId}，正确应为 ${item.answerId}`}`)
    .slice(0, 4);
  const sourceResources = generated?.source_resources || selectedResources;
  const visibleAiMaterialOptions = unique([...aiMaterials, ...suggestedAiMaterials]);
  const teacherScript =
    generated?.teacher_scripts?.[mode] ||
    (mode === "example"
      ? (generated?.teacher_scripts as ClassroomSession["teacher_scripts"] & { alternative_example?: string } | undefined)?.alternative_example
      : "") ||
    (mode === "normal" ? generated?.slides?.[slideIndex]?.teacher_note : "") ||
    generated?.teacher_scripts?.normal ||
    (mode !== "normal" ? generated?.slides?.[slideIndex]?.teacher_note : "") ||
    FALLBACK_SCRIPT[mode];
  const adaptiveGuidance = buildAdaptiveGuidance(classroomSignals);
  const slideOutcomes = buildSlideOutcomes(slide);
  const teacherRecommendation = buildTeacherRecommendation({
    phase: currentPhase,
    mode,
    confusedCount,
    wrongStreak,
    hasPassedCurrentQuiz,
  });
  const naturalClassroomStatus = buildNaturalClassroomStatus({
    confusion: classroomSignals.confusion,
    load: classroomSignals.load,
    wrongStreak,
    phase: currentPhase,
  });
  const adaptiveTeacherScript =
    mode === "normal" ? teacherScript : `${teacherScript}\n\n${adaptiveGuidance}`;
  const latestFeedback = feedbackEvents[0];
  const weakSlideIndexes = Array.from(new Set([
    ...wrongQuizItems.map((item) => item.slideIndex),
    ...lessonEvents.filter((item) => item.type === "knowledge_point_stuck").map((item) => item.slideIndex),
  ])).filter((index) => index >= 0 && index < slides.length);
  const stuckSlideIndexes = weakSlideIndexes.filter((index) => !masteredSlideIndexes.includes(index));
  const reviewCorePoints = unique([
    ...masteredKnowledgePoints,
    ...knowledgePoints,
    ...slideOutcomes,
  ]).slice(0, 3);
  const reviewMistakes = unique([
    ...wrongQuizItems.map((item) => item.diagnosis || item.misconception || "条件与结论没有对齐"),
    "只记结论，没有同时检查适用条件",
    "会跟着例题做，但换一个场景就机械套用",
  ]).slice(0, 2);
  const representativeQuestion = wrongQuizItems[0]?.question || generated?.check_question?.question || "请用自己的话说明本节课最核心的判断依据。";
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

  const logLessonEvent = (type: LessonEventType, detail = "") => {
    setLessonEvents((prev) => [
      {
        id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        at: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        slideIndex: currentSlideIndex,
        phase: currentPhase,
        knowledgePoint: currentKnowledgePoint,
        detail,
      },
      ...prev,
    ].slice(0, 80));
  };

  const adjustClassroomSignals = (delta: {
    confusion?: number;
    load?: number;
    curiosity?: number;
    mastery?: number;
    pace?: number;
  }) => {
    setClassroomSignals((prev) => ({
      confusion: clampPercent(prev.confusion + (delta.confusion || 0)),
      load: clampPercent(prev.load + (delta.load || 0)),
      curiosity: clampPercent(prev.curiosity + (delta.curiosity || 0)),
      mastery: clampPercent(prev.mastery + (delta.mastery || 0)),
      pace: clampPercent(prev.pace + (delta.pace || 0)),
    }));
  };

  const changePhase = (phase: ClassroomPhase, detail = "") => {
    setCurrentPhase((prev) => {
      if (prev !== phase) {
        const event: LessonEvent = {
          id: `phase_changed-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: "phase_changed",
          at: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
          slideIndex: currentSlideIndex,
          phase,
          knowledgePoint: currentKnowledgePoint,
          detail: detail || `${prev} -> ${phase}`,
        };
        setLessonEvents((events) => [
          event,
          ...events,
        ].slice(0, 80));
      }
      return phase;
    });
  };

  useEffect(() => {
    setActiveQuiz(null);
    setMasteryCheckSlideIndex(null);
    setQuizAnswer("");
    setQuizFeedback(null);
    setShowQuizAnalysis(false);
    setInteractionCard(null);
    setDiagnosisOpen(false);
    setSlowStepIndex(0);
    if (currentPhase !== "summary") {
      setCurrentPhase(slideIndex === 0 ? "intro" : "explain");
    }
  }, [slideIndex]);

  useEffect(() => {
    if (!generated) return;
    setLessonEvents([
      {
        id: `lesson_started-${Date.now()}`,
        type: "lesson_started",
        at: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        slideIndex: 0,
        phase: "intro",
        knowledgePoint: getKnowledgePointForSlide(generated, generated.slides?.length ? generated.slides : slides, 0),
        detail: generated.title || session.title,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated?.id]);

  useEffect(() => {
    if (!generated) return;
    logLessonEvent("slide_viewed", slide.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated?.id, slideIndex]);

  useEffect(() => {
    if (!generated || currentPhase === "summary") return;
    const timer = window.setInterval(() => {
      adjustClassroomSignals({
        confusion: confusedCount === 0 || mode !== "confused" ? -1 : 0,
        load: wrongStreak === 0 ? -1 : 0,
        mastery: correctStreak >= 2 ? 1 : 0,
      });
    }, 30000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated?.id, currentPhase, confusedCount, wrongStreak, correctStreak, mode]);

  const toggleTask = (task: string) => {
    setFinishedTasks((prev) =>
      prev.includes(task) ? prev.filter((item) => item !== task) : [...prev, task]
    );
  };

  const activateQuiz = (quiz: ClassroomQuiz | null) => {
    setActiveQuiz(quiz);
    if (!quiz) return;
    setUsedQuestionIds((prev) => unique([...prev, quiz.id]).slice(-60));
    setUsedQuestionTexts((prev) => unique([...prev, quiz.question]).slice(-60));
  };

  const refreshClassroomQuiz = async (transfer = false) => {
    if (quizGenerating) return;
    const nextVariant = quizVariant + (transfer ? 2 : 1);
    const targetLevel = getRefreshQuizLevel(transfer);
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
        target_level: targetLevel,
        used_question_texts: usedQuestionTexts,
        wrong_streak: wrongStreak,
        correct_levels: currentPassedQuizLevels,
      });
      activateQuiz({
        id: result.id || `${slide.title}-${nextVariant}`,
        question: result.question,
        options: result.options.map((item) => ({
          id: item.id || item.key || "",
          text: item.text,
          diagnosis: item.diagnosis || result.diagnosis?.[item.id || item.key || ""],
        })),
        answerId: result.answer_id,
        explanation: result.explanation,
        transfer: result.transfer,
        diagnosis: result.diagnosis,
        level: result.level || targetLevel,
        type: result.type || (result.question_type === "true_false" ? "true_false" : "single_choice"),
        targetKnowledgePoint: result.target_knowledge_point || currentKnowledgePoint,
        ability: result.ability || "concept_understanding",
        misconception: result.misconception || "当前题目用于诊断具体误区。",
        remedialExplanation: result.remedial_explanation || result.transfer || "回到当前页，重新对齐条件、概念和例子。",
      });
    } catch (error: unknown) {
      activateQuiz(buildSpecificClassroomQuiz(slide, generated?.check_question, nextVariant, targetLevel));
      message.error(error instanceof Error ? error.message : "动态出题失败，已使用本地题目");
    } finally {
      setQuizGenerating(false);
    }
  };

  const startMiniQuiz = (source: "button" | "mastered" = "button") => {
    changePhase("mini_quiz", source === "mastered" ? "掌握前检查" : "进入课中小测");
    setMasteryCheckSlideIndex(source === "mastered" ? currentSlideIndex : null);
    setMode("practice");
    setInteractionCard(null);
    setQuizAnswer("");
    setQuizFeedback(null);
    setShowQuizAnalysis(false);
    logLessonEvent("mini_quiz_started", source);
    const requestedLevel = source === "button" && activeQuiz ? getNextLevelAfter(activeQuiz.level) : nextQuizLevel;
    const quiz =
      findSpecificMiniQuiz(generated, currentKnowledgePoint, currentSlideIndex, requestedLevel, usedQuestionIds, usedQuestionTexts) ||
      buildSpecificCheckQuestionQuiz(generated?.check_question, currentKnowledgePoint, currentSlideIndex, slide, requestedLevel);
    if (!quiz) {
      activateQuiz(null);
      message.info("当前知识点暂无题目，可以先继续讲解或换个例子。");
      return;
    }
    activateQuiz(quiz);
  };

  const submitClassroomQuiz = () => {
    if (!activeQuiz || !quizAnswer || quizFeedback) return;
    const normalizedAnswer = quizAnswer.trim().toLowerCase();
    const expected = activeQuiz.answerId.trim().toLowerCase();
    const isCorrect = quizAnswer === activeQuiz.answerId || normalizedAnswer === expected;
    setQuizFeedback(isCorrect ? "correct" : "wrong");
    const record: QuizHistoryItem = {
      id: `${activeQuiz.id}-${Date.now()}`,
      quizId: activeQuiz.id,
      question: activeQuiz.question,
      selectedId: quizAnswer,
      answerId: activeQuiz.answerId,
      correct: isCorrect,
      knowledgePoint: currentKnowledgePoint,
      slideIndex: currentSlideIndex,
      level: activeQuiz.level,
      type: activeQuiz.type,
      diagnosis: activeQuiz.diagnosis?.[quizAnswer] || activeQuiz.options.find((item) => item.id === quizAnswer)?.diagnosis,
      misconception: activeQuiz.misconception,
      remedialExplanation: activeQuiz.remedialExplanation || activeQuiz.transfer,
      at: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };
    setQuizHistory((prev) => [record, ...prev].slice(0, 30));
    logLessonEvent("quiz_answer_submitted", quizAnswer);
    adjustClassroomSignals({
      confusion: isCorrect ? -9 : 10,
      load: isCorrect ? -5 : 7,
      curiosity: isCorrect ? 2 : 4,
      mastery: isCorrect ? 9 : -4,
      pace: isCorrect ? 3 : -2,
    });
    if (isCorrect) {
      setCorrectStreak((prev) => prev + 1);
      setWrongStreak(0);
      setPassedQuizLevels((prev) => ({
        ...prev,
        [currentKnowledgePoint]: unique([...(prev[currentKnowledgePoint] || []), activeQuiz.level]) as QuizLevel[],
      }));
      logLessonEvent("quiz_correct", activeQuiz.question);
      changePhase("feedback", "小测正确");
      if (masteryCheckSlideIndex === currentSlideIndex) {
        setMasteredSlideIndexes((prev) => Array.from(new Set([...prev, currentSlideIndex])));
        setMasteredKnowledgePoints((prev) => unique([...prev, currentKnowledgePoint]));
        setStuckKnowledgePoints((prev) => prev.filter((item) => item !== currentKnowledgePoint));
        logLessonEvent("knowledge_point_mastered", `确认题通过:${activeQuiz.id}`);
      }
      if (activeQuiz.level === "exam") {
        setHighMasteryPoints((prev) => unique([...prev, currentKnowledgePoint]));
        setMasteredKnowledgePoints((prev) => unique([...prev, currentKnowledgePoint]));
        logLessonEvent("knowledge_point_mastered", currentKnowledgePoint);
      } else if (activeQuiz.level === "trap" || correctStreak + 1 >= 2) {
        setMasteredKnowledgePoints((prev) => unique([...prev, currentKnowledgePoint]));
      }
      message.success(
        masteryCheckSlideIndex === currentSlideIndex
          ? "确认通过，本页已标记掌握；再次点击“已掌握”继续"
          : "答对了，这次结果可作为本页掌握确认"
      );
    } else {
      setWrongStreak((prev) => prev + 1);
      setCorrectStreak(0);
      setStuckKnowledgePoints((prev) => unique([...prev, currentKnowledgePoint]));
      logLessonEvent("quiz_wrong", JSON.stringify({
        quiz_id: activeQuiz.id,
        knowledge_point: currentKnowledgePoint,
        selected: quizAnswer,
        correct_answer: activeQuiz.answerId,
        diagnosis: record.diagnosis || activeQuiz.misconception,
        remedial_explanation: activeQuiz.remedialExplanation || activeQuiz.transfer,
        slide_index: currentSlideIndex,
      }));
      logLessonEvent("knowledge_point_stuck", currentKnowledgePoint);
      changePhase("feedback", "小测错误");
      setMode("practice");
      message.info("这题先看解析，再换一个同类题");
      setShowQuizAnalysis(true);
    }
  };

  const askClassroomQuestion = async (quickQuestion?: string) => {
    const question = (quickQuestion || classroomQuestion).trim();
    if (!question || classroomAnswering) return;
    setClassroomQuestion(question);
    setClassroomAnswering(true);
    setClassroomAnswer("");
    setMode("normal");
    try {
      const result = await generateClassroomInteraction({
        user_id: userId,
        session_id: generated?.id || session.stepKey,
        action: "qa",
        question,
        slide_index: currentSlideIndex,
        slide,
        knowledge_point: currentKnowledgePoint,
        teacher_script: slide.teacher_note || teacherScript,
        long_term_profile: (profile || {}) as Record<string, unknown>,
        realtime_state: classroomSignals,
        lesson_events: lessonEvents.slice(0, 12) as unknown as Record<string, unknown>[],
        interaction_history: feedbackEvents.slice(0, 8) as unknown as Record<string, unknown>[],
      });
      setClassroomAnswer(result.body || `围绕「${slide.title}」，先看本页的条件、方法和结论是否一一对应。`);
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

  const requestClassroomInteraction = async (
    action: "confused" | "slow" | "example",
    options: { diagnosis?: string; exampleType?: string; clickCount?: number } = {},
  ) => {
    const fallback =
      action === "confused"
        ? {
            type: "confused" as const,
            title: `针对性解释：${currentKnowledgePoint}`,
            diagnosis: options.diagnosis || "概念没懂",
            body: `诊断结果：${options.diagnosis || "概念没懂"}。先把「${currentKnowledgePoint}」压缩成一个最小问题：它要判断什么、依据什么规则、得到什么结论。`,
            steps: [`先找「${slide.title}」的对象`, "再找条件或公式", "最后看结论是否符合目标"],
          }
        : action === "slow"
          ? {
              type: "slow" as const,
              title: `分步讲解：${currentKnowledgePoint}`,
              body: `我把「${currentKnowledgePoint}」拆成几个小步，每次只看一步。`,
              steps: fallbackSlowSteps(currentKnowledgePoint, slide).slice(0, 4),
            }
          : {
              type: "example" as const,
              title: `${options.exampleType || "生活类比"}：${currentKnowledgePoint}`,
              body: `例子描述：把「${currentKnowledgePoint}」放到「${options.exampleType || "生活类比"}」里理解，先看输入，再看规则，最后看输出。`,
              knowledgePoint: currentKnowledgePoint,
              helps: `帮助理解「${currentKnowledgePoint}」中的条件、规则和结论。`,
              exampleType: options.exampleType,
              checkQuestion: "换一个输入时，你能说出规则会先检查哪一步吗？",
            };
    setInteractionLoading(action);
    try {
      const result = await generateClassroomInteraction({
        user_id: userId,
        session_id: generated?.id || session.stepKey,
        action,
        diagnosis: options.diagnosis,
        example_type: options.exampleType,
        click_count: options.clickCount || 1,
        slide_index: currentSlideIndex,
        slide,
        knowledge_point: currentKnowledgePoint,
        teacher_script: slide.teacher_note || teacherScript,
        long_term_profile: (profile || {}) as Record<string, unknown>,
        realtime_state: classroomSignals,
        lesson_events: lessonEvents.slice(0, 12) as unknown as Record<string, unknown>[],
        interaction_history: feedbackEvents.slice(0, 8) as unknown as Record<string, unknown>[],
      });
      if (action === "confused") {
        setInteractionCard({
          type: "confused",
          title: result.title || fallback.title,
          diagnosis: result.diagnosis || options.diagnosis,
          body: result.body || fallback.body,
          steps: result.steps?.length ? result.steps : fallback.steps,
        });
      } else if (action === "slow") {
        setInteractionCard({
          type: "slow",
          title: result.title || fallback.title,
          body: result.body || fallback.body,
              steps: result.steps?.length ? result.steps.slice(0, 4) : fallback.steps || fallbackSlowSteps(currentKnowledgePoint, slide),
        });
        setSlowStepIndex(0);
      } else {
        setInteractionCard({
          type: "example",
          title: result.title || fallback.title,
          body: result.body || fallback.body,
          knowledgePoint: result.knowledge_point || currentKnowledgePoint,
          helps: result.helps || fallback.helps || `帮助理解「${currentKnowledgePoint}」中的条件、规则和结论。`,
          exampleType: result.example_type || options.exampleType,
          checkQuestion: result.check_question || fallback.checkQuestion,
        });
      }
    } catch {
      setInteractionCard(fallback);
    } finally {
      setInteractionLoading(null);
    }
  };

  const handleConfusionDiagnosis = async (diagnosis: string) => {
    setDiagnosisOpen(false);
    adjustClassroomSignals({ confusion: 8, load: 5, mastery: -3 });
    await requestClassroomInteraction("confused", {
      diagnosis,
      clickCount: interactionCounts.confused,
    });
  };

  const recordClassroomSignal = (signal: ClassroomSignal) => {
    const meta = CLASSROOM_SIGNAL_META[signal];
    setMode(meta.mode);
    adjustClassroomSignals(meta.delta);
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
    if (signal === "confused") {
      const nextCount = confusedCount + 1;
      setConfusedCount(nextCount);
      setInteractionCounts((prev) => ({ ...prev, confused: prev.confused + 1 }));
      changePhase("feedback", "学生反馈听不懂");
      logLessonEvent("button_confused_clicked", currentKnowledgePoint);
      setStuckKnowledgePoints((prev) => unique([...prev, currentKnowledgePoint]));
      setDiagnosisOpen(true);
      setInteractionCard(null);
      if (nextCount >= 2) message.info("已经连续卡住两次，要不要讲慢点？");
      return;
    }
    if (signal === "slow") {
      const nextSlow = slowCount + 1;
      setSlowCount(nextSlow);
      setInteractionCounts((prev) => ({ ...prev, slow: prev.slow + 1 }));
      changePhase("explain", "讲慢点");
      logLessonEvent("button_slow_clicked", currentKnowledgePoint);
      void requestClassroomInteraction("slow", { clickCount: nextSlow });
      return;
    }
    if (signal === "example") {
      const nextExample = interactionCounts.example + 1;
      const exampleType = EXAMPLE_TYPES[(nextExample - 1) % EXAMPLE_TYPES.length];
      setInteractionCounts((prev) => ({ ...prev, example: prev.example + 1 }));
      changePhase("example", "换个例子");
      logLessonEvent("button_example_clicked", currentKnowledgePoint);
      void requestClassroomInteraction("example", { clickCount: nextExample, exampleType });
      return;
    }
    if (signal === "practice") {
      startMiniQuiz("button");
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
    if (currentPhase === "summary") return;
    if (!hasPassedCurrentQuiz && !hasMasteredCurrentSlide) {
      const quiz =
        findSpecificMiniQuiz(generated, currentKnowledgePoint, currentSlideIndex, nextQuizLevel, usedQuestionIds, usedQuestionTexts) ||
        buildSpecificCheckQuestionQuiz(generated?.check_question, currentKnowledgePoint, currentSlideIndex, slide, nextQuizLevel);
      if (!quiz) {
        message.warning("当前页缺少可用确认题，暂不能标记掌握；请先换个例子或来道题。");
        return;
      }
      startMiniQuiz("mastered");
      message.info("先用一道确认题检查是否真正掌握");
      return;
    }
    setMode("normal");
    setMasteryCheckSlideIndex(null);
    setInteractionCard(null);
    setMasteredSlideIndexes((prev) => Array.from(new Set([...prev, currentSlideIndex])));
    setMasteredKnowledgePoints((prev) => unique([...prev, currentKnowledgePoint]));
    logLessonEvent("knowledge_point_mastered", currentKnowledgePoint);
    adjustClassroomSignals({ confusion: -10, load: -7, mastery: 12, pace: 5 });
    if (slideIndex >= slides.length - 1) {
      changePhase("summary", "最后一个知识点已掌握");
      logLessonEvent("lesson_completed", generated?.title || session.title);
      adjustClassroomSignals({ confusion: -8, load: -8, mastery: 10 });
      message.success("本节课已完成，已生成课堂总结");
      return;
    }
    setSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
    changePhase("explain", "进入下一知识点");
    message.success("已掌握，进入下一知识点");
  };

  const getOutlineStatus = (index: number) => {
    if (index === currentSlideIndex && currentPhase !== "summary") return { key: "current", label: "当前" };
    if (masteredSlideIndexes.includes(index)) return { key: "mastered", label: "已掌握" };
    if (
      wrongQuizItems.some((item) => item.slideIndex === index) ||
      lessonEvents.some((item) => item.type === "knowledge_point_stuck" && item.slideIndex === index)
    ) return { key: "stuck", label: "卡住" };
    if (
      index < currentSlideIndex ||
      lessonEvents.some((item) => item.type === "slide_viewed" && item.slideIndex === index)
    ) return { key: "learned", label: "已学" };
    return { key: "pending", label: "待学" };
  };

  const restartWeakSlides = () => {
    const targetIndex = weakSlideIndexes[0] ?? Math.max(0, currentSlideIndex - 1);
    setSlideIndex(targetIndex);
    setMode("slow");
    setCurrentPhase("explain");
    setMasteryCheckSlideIndex(null);
    setQuizFeedback(null);
    setQuizAnswer("");
    message.info(`已回到第 ${targetIndex + 1} 页，建议先用“讲慢点”补齐卡点`);
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
            {currentJobSubStage && <small>{currentJobSubStage}</small>}
            <Progress
              percent={Math.max(0, Math.min(100, currentJobProgress))}
              format={(percent) => `${percent || 0}%`}
              status={currentJobError ? "exception" : "active"}
            />
            <div className="lp-classroom-progress-meta">
              <strong>{currentJobProgress}%</strong>
              <em>已耗时 {formatElapsed(currentJobElapsed)}</em>
              {currentJobStillRunning && <em>仍在生成，请稍候</em>}
            </div>
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
              <Progress percent={generationProgress} />
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
          <section className="lp-classroom-phase-bar" aria-label="课堂阶段">
            {CLASSROOM_PHASES.map((phase, index) => (
              <div
                key={phase.key}
                className={`lp-classroom-phase-item${phase.key === currentPhase ? " is-active" : ""}${
                  CLASSROOM_PHASES.findIndex((item) => item.key === currentPhase) > index ? " is-done" : ""
                }`}
              >
                <span>{index + 1}</span>
                <strong>{phase.label}</strong>
              </div>
            ))}
          </section>
          <section className="lp-classroom-shell">
            <aside className="lp-classroom-outline">
              <div className="lp-classroom-side-head">
                <BookOutlined />
                <span>本节目录</span>
              </div>
              {slides.map((item, index) => {
                const status = getOutlineStatus(index);
                return (
                  <button
                    key={`${item.kicker}-${item.title}`}
                    type="button"
                    className={`lp-classroom-outline-item${index === slideIndex ? " is-active" : ""} is-${status.key}`}
                    onClick={() => setSlideIndex(index)}
                  >
                    <em>{item.kicker}</em>
                    <strong>{item.title}</strong>
                    <small>{status.label}</small>
                  </button>
                );
              })}
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
              {currentPhase === "summary" ? (
                <div className="lp-classroom-summary-panel">
                  <span>课堂总结</span>
                  <h2>{generated.title || session.title}</h2>
                  <p>{generated.objective || session.objective}</p>
                  <div className="lp-classroom-summary-grid">
                    <article>
                      <strong>已掌握页面 / 知识点</strong>
                      <p>
                        {masteredSlideIndexes.length
                          ? masteredSlideIndexes.map((index) => `第 ${index + 1} 页 ${slides[index]?.title || ""}`).join(" / ")
                          : masteredKnowledgePoints.length
                            ? masteredKnowledgePoints.join(" / ")
                            : "暂无明确掌握点"}
                      </p>
                    </article>
                    <article>
                      <strong>卡住页面 / 知识点</strong>
                      <p>
                        {stuckSlideIndexes.length
                          ? stuckSlideIndexes.map((index) => `第 ${index + 1} 页 ${slides[index]?.title || ""}`).join(" / ")
                          : stuckKnowledgePoints.length
                            ? stuckKnowledgePoints.join(" / ")
                            : "暂无明显卡点"}
                      </p>
                    </article>
                    <article>
                      <strong>互动次数</strong>
                      <p>听不懂 {confusedCount} 次 · 讲慢点 {slowCount} 次</p>
                    </article>
                    <article>
                      <strong>小测结果</strong>
                      <p>
                        共做 {quizHistory.length} 题 · 正确 {quizHistory.filter((item) => item.correct).length} 题 · 错误{" "}
                        {wrongQuizItems.length} 题
                      </p>
                    </article>
                    <article>
                      <strong>错题知识点</strong>
                      <p>{wrongQuizKnowledgePoints.length ? wrongQuizKnowledgePoints.join(" / ") : "暂无错题知识点"}</p>
                    </article>
                    <article>
                      <strong>主要误区</strong>
                      <p>{quizMisconceptions.length ? quizMisconceptions.join("；") : "暂无明显误区"}</p>
                    </article>
                  </div>
                  <div className="lp-classroom-summary-next">
                    <strong>下一步建议</strong>
                    <p>{lessonSummarySuggestion}</p>
                  </div>
                  <div className="lp-classroom-review-card">
                    <div className="lp-classroom-review-head">
                      <span>课后复习卡</span>
                      <strong>3 个核心点 · 2 个易错点 · 1 道代表题</strong>
                    </div>
                    <div className="lp-classroom-review-columns">
                      <article>
                        <strong>核心点</strong>
                        <ol>{reviewCorePoints.map((item) => <li key={item}>{item}</li>)}</ol>
                      </article>
                      <article>
                        <strong>易错点</strong>
                        <ol>{reviewMistakes.map((item) => <li key={item}>{item}</li>)}</ol>
                      </article>
                    </div>
                    <div className="lp-classroom-review-question">
                      <strong>代表题</strong>
                      <p>{representativeQuestion}</p>
                    </div>
                  </div>
                  <div className="lp-classroom-summary-actions">
                    <Button onClick={() => clientNavigate("/path")}>返回学习路径</Button>
                    <Button disabled={!weakSlideIndexes.length && !stuckKnowledgePoints.length} onClick={restartWeakSlides}>
                      重新学习薄弱页
                    </Button>
                    <Button icon={<FileTextOutlined />} onClick={() => clientNavigate("/evaluation")}>
                      去评估页
                    </Button>
                    <Button disabled={!generated} loading={exportingPptx} onClick={handleExportPptx}>
                      导出 PPT
                    </Button>
                  </div>
                </div>
              ) : (
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
              )}
              <div className="lp-classroom-progress">
                <span>课堂进度</span>
                <Progress percent={progress} showInfo={false} />
                <strong>{progress}%</strong>
                <Tag color={hasMasteredCurrentKnowledgePoint ? "green" : "blue"}>
                  {hasMasteredCurrentKnowledgePoint ? "当前知识点已掌握" : `当前进度：第 ${slideIndex + 1} 页 / 共 ${slides.length} 页`}
                </Tag>
              </div>
              {currentPhase !== "summary" && (
                <div className="lp-classroom-outcomes">
                  <strong>学完本页你应该能：</strong>
                  <div>
                    {slideOutcomes.map((item) => <span key={item}>{item}</span>)}
                  </div>
                </div>
              )}
              {diagnosisOpen && mode !== "practice" && (
                <div className="lp-classroom-interaction-card is-confused">
                  <span>卡点诊断</span>
                  <strong>你主要卡在哪里？</strong>
                  <p>先选一个最接近的卡点，我再根据当前页、讲稿和你的课堂状态生成针对性解释。</p>
                  <div className="lp-classroom-diagnosis-options">
                    {CONFUSION_DIAGNOSES.map((item) => (
                      <Button
                        key={item}
                        loading={interactionLoading === "confused"}
                        onClick={() => void handleConfusionDiagnosis(item)}
                      >
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {interactionLoading && !diagnosisOpen && (
                <div className="lp-classroom-interaction-card is-loading">
                  <Spin size="small" />
                  <strong>正在结合当前课堂状态生成新的讲法...</strong>
                </div>
              )}
              {interactionCard && mode !== "practice" && (
                <div className={`lp-classroom-interaction-card is-${interactionCard.type}`}>
                  <span>
                    {interactionCard.type === "confused"
                      ? "降维解释"
                      : interactionCard.type === "slow"
                        ? "慢速拆解"
                        : "例子演示"}
                  </span>
                  <strong>{interactionCard.title}</strong>
                  {interactionCard.type === "confused" && interactionCard.diagnosis && (
                    <small>诊断结果：{interactionCard.diagnosis}</small>
                  )}
                  <p>{interactionCard.body}</p>
                  {"steps" in interactionCard && interactionCard.steps?.length && interactionCard.type !== "slow" ? (
                    <ol>
                      {interactionCard.steps.map((step, index) => (
                        <li key={`${formatInteractionStep(step)}-${index}`}>{formatInteractionStep(step)}</li>
                      ))}
                    </ol>
                  ) : null}
                  {interactionCard.type === "slow" && interactionCard.steps.length > 0 && (
                    <div className="lp-classroom-slow-step">
                      <span>
                        第 {Math.min(slowStepIndex + 1, interactionCard.steps.length)} / {interactionCard.steps.length} 小步
                      </span>
                      <p>{formatInteractionStep(interactionCard.steps[Math.min(slowStepIndex, interactionCard.steps.length - 1)])}</p>
                      <div>
                        <Button
                          size="small"
                          disabled={slowStepIndex >= interactionCard.steps.length - 1}
                          onClick={() => setSlowStepIndex((prev) => Math.min(prev + 1, interactionCard.steps.length - 1))}
                        >
                          下一小步
                        </Button>
                        <Button
                          size="small"
                          onClick={() => {
                            adjustClassroomSignals({ confusion: -5, load: -4, mastery: 4 });
                            message.success("好，这一步已记为理解");
                          }}
                        >
                          能理解
                        </Button>
                        <Button
                          size="small"
                          onClick={() => {
                            adjustClassroomSignals({ confusion: 6, load: 4, mastery: -2 });
                            void requestClassroomInteraction("confused", {
                              diagnosis: "步骤没懂",
                              clickCount: interactionCounts.confused + 1,
                            });
                          }}
                        >
                          还是不懂
                        </Button>
                      </div>
                    </div>
                  )}
                  {"helps" in interactionCard && (
                    <small>
                      {interactionCard.exampleType ? `例子类型：${interactionCard.exampleType} · ` : ""}
                      对应知识点：{interactionCard.knowledgePoint} · 帮助理解：{interactionCard.helps}
                    </small>
                  )}
                  {"checkQuestion" in interactionCard && interactionCard.checkQuestion && (
                    <div className="lp-classroom-example-check">小问题：{interactionCard.checkQuestion}</div>
                  )}
                </div>
              )}
              {mode === "practice" && (
                <div className="lp-classroom-quiz-card">
                  {quizGenerating ? (
                    <div className="lp-classroom-quiz-loading">
                      <Spin size="small" />
                      <span>正在根据当前页生成一道新选择题...</span>
                    </div>
                  ) : !activeQuiz ? (
                    <div className="lp-classroom-quiz-loading">
                      <QuestionCircleOutlined />
                      <span>当前知识点暂无题目，可以先继续讲解、换个例子，或进入下一部分。</span>
                    </div>
                  ) : (
                    <>
                  <div className="lp-classroom-quiz-head">
                    <div>
                      <span>课堂选择题</span>
                      <span>{QUIZ_LEVEL_LABEL[activeQuiz.level]} · {QUIZ_TYPE_LABEL[activeQuiz.type]}</span>
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
                        quizFeedback && isAnswer
                          ? " is-correct"
                          : quizFeedback && isChosen && !isAnswer
                            ? " is-wrong"
                            : "";
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`${isChosen ? "is-selected" : ""}${stateClass}`}
                          onClick={() => {
                            if (!quizFeedback) setQuizAnswer(option.id);
                          }}
                        >
                          <span>{option.id}</span>
                          <strong>{option.text}</strong>
                        </button>
                      );
                    })}
                  </div>
                  {!activeQuiz.options.length && (
                    <Input.TextArea
                      value={quizAnswer}
                      onChange={(event) => setQuizAnswer(event.target.value)}
                      disabled={Boolean(quizFeedback)}
                      autoSize={{ minRows: 2, maxRows: 4 }}
                      placeholder="输入你的答案，再点击提交答案"
                    />
                  )}
                  <div className="lp-classroom-quiz-submit-row">
                    <Button type="primary" disabled={!quizAnswer || Boolean(quizFeedback)} onClick={submitClassroomQuiz}>
                      提交答案
                    </Button>
                    {quizAnswer && !quizFeedback && <span>已选择：{quizAnswer}</span>}
                  </div>
                  {quizFeedback && (
                    <div className={`lp-classroom-quiz-feedback is-${quizFeedback}`}>
                      <strong>{quizFeedback === "correct" ? "答对了" : "还差一步"}</strong>
                      <p>{quizFeedback === "correct" ? activeQuiz.explanation : activeQuiz.remedialExplanation || activeQuiz.transfer || activeQuiz.explanation}</p>
                      {quizFeedback === "wrong" && (
                        <div className="lp-classroom-quiz-diagnosis">
                          <p>你选择了：{quizAnswer}</p>
                          <p>暴露的误区：{activeQuiz.diagnosis?.[quizAnswer] || activeQuiz.options.find((item) => item.id === quizAnswer)?.diagnosis || activeQuiz.misconception}</p>
                          <p>正确思路：{activeQuiz.explanation}</p>
                          <div className="lp-classroom-quiz-analysis is-inline">
                            <span>解析</span>
                            <p>{activeQuiz.explanation}</p>
                          </div>
                          <p>下一步建议：{activeQuiz.level === "exam" ? "你对基础概念可能已有理解，但在综合应用、计算或条件分析上还需要巩固。" : activeQuiz.remedialExplanation}</p>
                        </div>
                      )}
                      {activeQuiz.diagnosis?.[quizAnswer] && <p>选项诊断：{activeQuiz.diagnosis[quizAnswer]}</p>}
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
                        <Button size="small" onClick={() => changePhase("explain", "回到讲解")}>
                          回到讲解
                        </Button>
                        <Button size="small" onClick={() => recordClassroomSignal("slow")}>
                          讲慢点
                        </Button>
                        <Button size="small" onClick={() => recordClassroomSignal("example")}>
                          换个例子
                        </Button>
                        {quizFeedback === "correct" && (
                          <Button size="small" type="primary" onClick={nextSlide}>
                            已掌握，进入下一页
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
              {mode !== "practice" && currentPhase !== "summary" && (
                <div className="lp-classroom-qa-card">
                  <div className="lp-classroom-qa-head">
                    <div>
                      <span>课堂问答</span>
                      <strong>围绕当前页提问，AI 会结合课堂内容回答</strong>
                    </div>
                  </div>
                  <div className="lp-classroom-qa-prompts" aria-label="快捷提问">
                    {["这页一句话总结", "给我举个更简单的例子", "这页容易错在哪里"].map((prompt) => (
                      <Button key={prompt} size="small" disabled={classroomAnswering} onClick={() => void askClassroomQuestion(prompt)}>
                        {prompt}
                      </Button>
                    ))}
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
              <div className="lp-classroom-current-advice">
                <span>当前建议</span>
                <strong>{teacherRecommendation}</strong>
              </div>
              <div className="lp-classroom-teacher-bubble">
                <span>讲解 / 反馈</span>
                <p>{adaptiveTeacherScript}</p>
              </div>
              <div className="lp-classroom-realtime-panel">
                <div className="lp-classroom-realtime-head">
                  <span>学习状态</span>
                  <strong>{naturalClassroomStatus}</strong>
                  <small>{adaptiveGuidance}</small>
                </div>
                <div className="lp-classroom-realtime-grid is-secondary">
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
              <div className="lp-classroom-next-label">下一步操作</div>
              <div className="lp-classroom-controls">
                <Tooltip title="降低讲解密度，回到最小概念">
                  <Button disabled={currentPhase === "summary"} icon={<QuestionCircleOutlined />} loading={interactionLoading === "confused"} onClick={() => recordClassroomSignal("confused")}>
                    听不懂
                  </Button>
                </Tooltip>
                <Button disabled={currentPhase === "summary"} icon={<PauseCircleOutlined />} loading={interactionLoading === "slow"} onClick={() => recordClassroomSignal("slow")}>
                  讲慢点
                </Button>
                <Button disabled={currentPhase === "summary"} icon={<SwapOutlined />} loading={interactionLoading === "example"} onClick={() => recordClassroomSignal("example")}>
                  换个例子
                </Button>
                <Button disabled={currentPhase === "summary"} icon={<ExperimentOutlined />} onClick={() => recordClassroomSignal("practice")}>
                  来道题
                </Button>
                <Button type="primary" onClick={nextSlide} disabled={currentPhase === "summary"}>
                  {hasPassedCurrentQuiz || hasMasteredCurrentSlide ? "已掌握，继续" : "已掌握"}
                </Button>
              </div>
            </aside>
          </section>

          <details className="lp-classroom-homework">
            <summary>展开课后任务和讲义摘录</summary>
            <div className="lp-classroom-homework-body">
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
            </div>
          </details>
        </>
      )}
    </main>
  );
}
