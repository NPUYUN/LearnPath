import { clearAccessToken, clearAuthSession, getAccessToken, setAccessToken } from "@/store/authStore";
import { apiUrl } from "./apiBase";
import { decodeStreamTextPayload, parseSseBlock } from "./sseParse";
import {
  buildMasteryRecord,
  formatReviewLabel,
  loadLocalMasteryRecords,
  recordLookupKey,
  saveLocalMasteryRecord,
} from "./masteryStorage";

export { apiUrl };

export function authHeaders(extra?: HeadersInit, json = true): HeadersInit {
  const token = getAccessToken();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function handleResponse(res: Response): Promise<Response> {
  if (res.status === 401) {
    clearAccessToken();
    clearAuthSession();
    throw new Error("登录已过期，请重新登录");
  }
  return res;
}

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { detail?: string };
    if (typeof data.detail === "string") {
      if (data.detail === "Not Found" && res.status === 404) {
        return `请求的资源不存在（404），请确认后端已更新并完成重启`;
      }
      return data.detail;
    }
  } catch {
    /* ignore */
  }
  return text || `请求失败（${res.status}）`;
}

export type StudentProfile = {
  user_id: string;
  knowledge_level: string;
  learning_goal: string;
  cognitive_style: string;
  error_prone_topics: string[];
  preferred_modality: string;
  pace_and_time: string;
  recent_progress: string;
};

export type RealtimeLearningState = {
  user_id: string;
  emotion: "neutral" | "confused" | "frustrated" | "excited" | "tired" | "anxious";
  implicit_emotion: string;
  engagement: "low" | "medium" | "high";
  confusion_level: number;
  curiosity_level: number;
  cognitive_load_level: number;
  frustration_level: number;
  confidence_level: number;
  initiative_level: number;
  curiosity_topics: string[];
  stuck_topics: string[];
  language_style: string;
  preferred_reply_style: string;
  cognitive_load: "low" | "medium" | "high";
  next_best_action: string;
  confidence: number;
  evidence: string[];
  updated_at?: string;
};

export type LearningResource = {
  id: string;
  type: string;
  title: string;
  content: string;
  sources: string[];
  topic: string;
  generation_mode?: string;
  library_id?: string;
  library_name?: string;
  metadata?: ResourceMetadata;
  status?: "draft" | "published";
};

export type ResourceMetadata = {
  knowledge_points: string[];
  difficulty: "basic" | "intermediate" | "advanced" | "exam";
  learning_purpose: "preview" | "explain" | "practice" | "review" | "exam" | "classroom" | "project";
  used_for: ("path" | "classroom" | "quiz" | "review")[];
  recommended_stage: string;
  estimated_minutes: number;
  prerequisites: string[];
  summary: string;
  learning_before_tip: string;
  learning_after_check: string;
  suitable_scenarios: string[];
  next_step: string;
  expected_outcome: string;
  source_library_id: string;
  source_files: string[];
  path_step_key: string;
  quality_score: number;
  quality_reason: string;
  quality_issues: string[];
  quality_tags: string[];
  quality_dimensions: Record<string, number>;
  review_attempts: number;
  full_rewrite_attempted: boolean;
  classroom_ready: boolean;
  classroom_missing: string[];
  duplicate_of: string;
  formula_issues: string[];
  quiz_invalid_questions: number[];
  quiz_semantic_verified: boolean;
  quiz_semantic_review: Record<string, unknown>;
  generated_context: Record<string, unknown>;
  path_attachment_warning: string;
};

export type PathStep = {
  id?: string;
  order: number;
  title: string;
  objective: string;
  resource_ids: string[];
  estimated_minutes: number;
  status: string;
  substeps?: PathStep[];
};

export type LearningPath = {
  user_id: string;
  steps: PathStep[];
  version: number;
};

export type ResourceSummary = {
  id: string;
  type: string;
  title: string;
};

export type ClassroomVisualBlock = {
  type: "table" | "compare" | "process" | "example" | "exercise" | "formula" | "diagram" | string;
  title?: string;
  columns?: string[];
  rows?: string[][];
  steps?: string[];
  items?: string[];
  question?: string;
  answer?: string;
  expression?: string;
  latex?: string;
  formula?: string;
  explanation?: string;
  analysis?: string;
  solution?: string;
  difficulty?: string;
  level?: string;
};

export type ClassroomSlide = {
  kicker: string;
  title: string;
  body: string;
  board: string[];
  learning_goal?: string | string[];
  key_points?: string[];
  bullets?: string[];
  teacher_note?: string;
  intuition?: string;
  worked_example?: string;
  quick_check?: string;
  layout?: "cover" | "problem" | "concept" | "timeline" | "example" | "mistake" | "quiz" | "summary" | string;
  visual_theme?: string;
  accent_color?: "blue" | "teal" | "amber" | "indigo" | "green" | "rose" | "violet" | "cyan" | string;
  visual_prompt?: string;
  visual_blocks?: ClassroomVisualBlock[];
  image_url?: string;
};

export type ClassroomTeacherScripts = {
  normal: string;
  confused: string;
  slow: string;
  example: string;
  practice: string;
};

export type ClassroomHandoutSection = {
  heading: string;
  content: string;
};

export type ClassroomSession = {
  id: string;
  title: string;
  objective: string;
  course_name: string;
  estimated_minutes: number;
  depth_level?: string;
  slides: ClassroomSlide[];
  handout?: ClassroomHandoutSection[];
  teacher_scripts: ClassroomTeacherScripts;
  check_question: {
    question: string;
    expected_answer: string;
    hint: string;
  };
  mini_quizzes?: ClassroomQuizResponse[];
  homework: string[];
  source_resources: { id: string; type: string; title: string; topic: string }[];
  prompt_summary: string;
  personalization_brief: string;
};

export type ClassroomQuizInput = {
  user_id: string;
  course_title: string;
  course_objective: string;
  slide_title: string;
  slide_body: string;
  slide_board: string[];
  teacher_note?: string;
  depth_level?: string;
  previous_question?: string;
  variant?: number;
  target_level?: "basic" | "application" | "trap" | "exam";
  used_question_texts?: string[];
  wrong_streak?: number;
  correct_levels?: string[];
};

export type ClassroomQuizResponse = {
  id: string;
  question: string;
  options: { id: string; key?: string; text: string; diagnosis?: string }[];
  answer_id: string;
  explanation: string;
  transfer: string;
  question_type: string;
  difficulty: string;
  diagnosis?: Record<string, string>;
  level?: "basic" | "application" | "trap" | "exam";
  type?: "single_choice" | "true_false";
  target_knowledge_point?: string;
  ability?: string;
  misconception?: string;
  remedial_explanation?: string;
};

export type ClassroomGenerationJob = {
  id: string;
  user_id: string;
  title: string;
  status: "queued" | "running" | "done" | "error";
  stage: string;
  sub_stage?: string;
  progress: number;
  result?: ClassroomSession | null;
  error?: string;
  elapsed_seconds?: number;
  heartbeat_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type ClassroomInteractionInput = {
  user_id: string;
  session_id?: string;
  action: "confused" | "slow" | "example" | "qa";
  question?: string;
  diagnosis?: string;
  example_type?: string;
  click_count?: number;
  slide_index?: number;
  slide?: Partial<ClassroomSlide>;
  knowledge_point?: string;
  teacher_script?: string;
  long_term_profile?: Record<string, unknown>;
  realtime_state?: Record<string, unknown>;
  lesson_events?: Record<string, unknown>[];
  interaction_history?: Record<string, unknown>[];
};

export type ClassroomInteractionResponse = {
  action: "confused" | "slow" | "example" | "qa";
  title: string;
  body: string;
  steps: string[];
  diagnosis?: string;
  example_type?: string;
  knowledge_point?: string;
  helps?: string;
  check_question?: string;
};

export type StreamChatCallbacks = {
  onToken?: (t: string) => void;
  onDone?: (reply: string) => void;
  onIntent?: (intent: string) => void;
  onProgress?: (
    stage: string,
    progress?: number,
    meta?: { resource_type?: string; variant?: number; variant_total?: number }
  ) => void;
  onProfile?: (profile: StudentProfile) => void;
  onRealtimeState?: (state: RealtimeLearningState) => void;
  onResources?: (items: ResourceSummary[]) => void;
  onPath?: (info: { steps: number; version: number }) => void;
  onError?: (msg: string) => void;
};

function emitStreamProgress(data: string, callbacks: StreamChatCallbacks) {
  try {
    const p = JSON.parse(data) as {
      stage?: string;
      progress?: number;
      resource_type?: string;
      variant?: number;
      variant_total?: number;
    };
    callbacks.onProgress?.(p.stage || data, p.progress, {
      resource_type: p.resource_type,
      variant: p.variant,
      variant_total: p.variant_total,
    });
  } catch {
    callbacks.onProgress?.(data);
  }
}

export type HealthResponse = {
  status: string;
  service?: string;
  llm?: {
    routing?: string;
    primary_provider?: string;
    aux_provider?: string;
    primary_mock?: boolean;
    has_spark_key?: boolean;
    has_aux_key?: boolean;
  };
};

export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(apiUrl("/api/health"), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export async function checkHealth(): Promise<boolean> {
  const h = await getHealth();
  return h?.status === "ok";
}

const LLM_ROUTING_LABELS: Record<string, string> = {
  kimi_all: "Kimi",
  spark_primary_aux_secondary: "星火主 · 辅助模型推荐",
  aux_only: "辅助云端模型",
  spark_only: "讯飞星火",
  mock: "Mock 演示",
};

export function formatLlmRouting(routing?: string): string {
  if (!routing) return "";
  return LLM_ROUTING_LABELS[routing] || routing;
}

export async function chat(userId: string, message: string, deepThinking = false) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ user_id: userId, message, stream: false, deep_thinking: deepThinking }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    reply: string;
    profile?: StudentProfile;
    realtime_state?: RealtimeLearningState;
    resources?: ResourceSummary[];
  }>;
}

export async function streamChat(
  userId: string,
  message: string,
  callbacks: StreamChatCallbacks,
  chunkSize = 8,
  deepThinking = false,
  webSearch = false,
  attachmentContext = "",
  attachments: ChatAttachment[] = [],
  timeoutMs?: number
) {
  const controller = new AbortController();
  const effectiveTimeout = timeoutMs ?? (deepThinking ? 180000 : 90000);
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);
  let res: Response;
  try {
    res = await handleResponse(
      await fetch(apiUrl("/api/chat/stream"), {
        method: "POST",
        headers: authHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          user_id: userId,
          message,
          stream: true,
          chunk_size: chunkSize,
          deep_thinking: deepThinking,
          web_search: webSearch,
          attachment_context: attachmentContext,
          attachments,
        }),
      })
    );
  } catch (e: unknown) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`请求超时（${Math.round(effectiveTimeout / 1000)}s），请稍后重试或关闭深度思考`);
    }
    if (
      e instanceof TypeError ||
      (e instanceof Error && /failed to fetch|network error|load failed/i.test(e.message))
    ) {
      throw new Error(
        "与后端的连接中断（常见于后端热重载或服务未启动）。请运行 stop.bat 再 start.bat 重启后重试。",
      );
    }
    throw e;
  }
  clearTimeout(timer);
  if (!res.ok || !res.body) throw new Error("流式请求失败");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastReply = "";
  let gotToken = false;

  try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const normalized = buffer.replace(/\r\n/g, "\n");
    const parts = normalized.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const { event, data: rawData } = parseSseBlock(part);
      const data =
        event === "token" || event === "done"
          ? decodeStreamTextPayload(rawData)
          : rawData;
      if (event === "token" && data) {
        gotToken = true;
        callbacks.onToken?.(data);
      }
      if (event === "intent" && data) callbacks.onIntent?.(data);
      if (event === "progress" && data) {
        emitStreamProgress(data, callbacks);
      }
      if (event === "profile" && data) {
        try {
          callbacks.onProfile?.(JSON.parse(data) as StudentProfile);
        } catch {
          /* ignore */
        }
      }
      if (event === "realtime_state" && data) {
        try {
          callbacks.onRealtimeState?.(JSON.parse(data) as RealtimeLearningState);
        } catch {
          /* ignore */
        }
      }
      if (event === "resources" && data) {
        try {
          callbacks.onResources?.(JSON.parse(data) as ResourceSummary[]);
        } catch {
          /* ignore */
        }
      }
      if (event === "path" && data) {
        try {
          callbacks.onPath?.(JSON.parse(data) as { steps: number; version: number });
        } catch {
          /* ignore */
        }
      }
      if (event === "error" && data) {
        callbacks.onError?.(data);
        if (!gotToken) callbacks.onToken?.(`⚠️ ${data}`);
        callbacks.onDone?.(data.startsWith("⚠️") ? data : `⚠️ ${data}`);
        return;
      }
      if (event === "done") lastReply = data;
    }
  }
  } catch (e: unknown) {
    if (
      e instanceof TypeError ||
      (e instanceof Error && /failed to fetch|network error|load failed/i.test(e.message))
    ) {
      throw new Error(
        "流式连接中断（后端可能正在重启）。请运行 stop.bat 再 start.bat，然后重新发送消息。",
      );
    }
    throw e;
  }
  if (!lastReply && !gotToken) {
    const fallback = "未收到助手回复，请检查后端服务或 Kimi API 配置后重试。";
    callbacks.onError?.(fallback);
    callbacks.onToken?.(`⚠️ ${fallback}`);
    callbacks.onDone?.(`⚠️ ${fallback}`);
    return;
  }
  callbacks.onDone?.(lastReply);
}

export async function streamTutor(
  userId: string,
  question: string,
  topic: string,
  callbacks: StreamChatCallbacks,
  chunkSize = 8,
  deepThinking = false
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/tutor/stream"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: userId,
        question,
        topic,
        chunk_size: chunkSize,
        deep_thinking: deepThinking,
      }),
    })
  );
  if (!res.ok || !res.body) throw new Error("辅导流式请求失败");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastReply = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const normalized = buffer.replace(/\r\n/g, "\n");
    const parts = normalized.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const { event, data: rawData } = parseSseBlock(part);
      const data =
        event === "token" || event === "done"
          ? decodeStreamTextPayload(rawData)
          : rawData;
      if (event === "token" && data) callbacks.onToken?.(data);
      if (event === "progress" && data) {
        emitStreamProgress(data, callbacks);
      }
      if (event === "error" && data) callbacks.onError?.(data);
      if (event === "done") lastReply = data;
    }
  }
  callbacks.onDone?.(lastReply);
}

export async function getProfile(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/profile/${userId}`), { headers: authHeaders() })
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<StudentProfile>;
}

export async function getRealtimeState(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/profile/${userId}/realtime`), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<RealtimeLearningState>;
}

export type ProfileRefreshResult = {
  profile: StudentProfile;
  message: string;
  sources: {
    chat_turns?: number;
    resource_views?: number;
    resources_owned?: number;
    topics?: string[];
  };
};

export async function getProfileSignals(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/profile/${userId}/signals`), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ProfileRefreshResult["sources"]>;
}

export async function refreshProfile(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/profile/${userId}/refresh`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ProfileRefreshResult>;
}

export type LearnerProfileAnalysis = {
  user_id: string;
  summary: string;
  long_term: {
    knowledge_assessment: string;
    goal_clarity: string;
    cognitive_style_notes: string;
    error_prone_analysis: string;
    progress_narrative: string;
  };
  realtime: {
    emotional_state: string;
    engagement_notes: string;
    confusion_and_stuck: string;
    curiosity_notes: string;
    cognitive_load_notes: string;
    confidence_notes: string;
  };
  behavioral: {
    chat_patterns: string;
    resource_usage: string;
    quiz_performance: string;
    modality_preference: string;
  };
  strengths: string[];
  gaps: string[];
  risks: string[];
  recommended_focus: string[];
  planning_hints: string[];
  ai_context_brief: string;
  sources: Record<string, unknown>;
  updated_at: string;
};

export type ProfileAnalysisResult = {
  analysis: LearnerProfileAnalysis;
  profile: StudentProfile;
  message: string;
};

export async function analyzeLearnerProfile(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/profile/${userId}/analyze`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ProfileAnalysisResult>;
}

export type ResourceLibrary = {
  id: string;
  name: string;
  description: string;
  source_type: "builtin" | "upload";
  status: "empty" | "processing" | "ready" | "error";
  file_count: number;
  chunk_count: number;
  course?: string;
  created_at?: string;
  updated_at?: string;
};

export type LibraryFileItem = {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  status: string;
};

export type LibraryDetail = ResourceLibrary & {
  files: LibraryFileItem[];
  synthesis?: Record<string, unknown>;
};

export type LibraryFilePreview = {
  id: string;
  filename: string;
  mime_type: string;
  content: string;
  preview_kind: "markdown" | "code" | "text";
  source: "original" | "extracted" | "analysis";
};

export type GenerateResourceOptions = {
  resourceTypes?: string[];
  resourceTypeCounts?: Record<string, number>;
  libraryId?: string | null;
  newLibraryName?: string;
  generationSource?: "existing_library" | "uploaded" | "empty" | "web";
  requirements?: string;
  deepThinking?: boolean;
  learningPurpose?: ResourceMetadata["learning_purpose"];
  pathStepKey?: string;
  attachToPath?: boolean;
  pathAttachMode?: "none" | "auto" | "manual";
};

export type ResourceGenerationResultSummary = {
  generated_count: number;
  published_count: number;
  draft_count: number;
  rewritten_count: number;
  library_resource_count: number;
  path_attached_count: number;
  path_unmatched_count: number;
  classroom_ready_count: number;
  library_id: string;
  library_name: string;
  resource_ids: string[];
};

export type ResourceGenerationJob = {
  id: string;
  user_id: string;
  title: string;
  status: "queued" | "running" | "done" | "error";
  stage: string;
  sub_stage: string;
  current_resource_type: string;
  progress: number;
  elapsed_seconds: number;
  error: string;
  result?: ResourceGenerationResultSummary | null;
  created_at: string;
  updated_at: string;
};

export type ResourceTemplateInfo = {
  id: string;
  title: string;
  subtitle: string;
  topic: string;
  tags: string[];
  resource_count: number;
  estimated_minutes: number;
  icon: string;
  color: string;
};

export type CreateFromTemplateResult = {
  template_id: string;
  resources: LearningResource[];
  message: string;
};

export type CreateFromTemplateOptions = {
  copyTitle?: string;
  topicOverride?: string;
};

function generateResourcePayload(userId: string, topic: string, options?: GenerateResourceOptions) {
  return {
    user_id: userId,
    topic,
    resource_types: options?.resourceTypes ?? ["doc", "mindmap", "quiz", "reading", "media", "code"],
    resource_type_counts: options?.resourceTypeCounts ?? {},
    library_id: options?.libraryId || null,
    new_library_name: options?.newLibraryName || null,
    generation_source: options?.generationSource ?? "web",
    requirements: options?.requirements ?? "",
    deep_thinking: options?.deepThinking ?? false,
    learning_purpose: options?.learningPurpose ?? null,
    path_step_key: options?.pathStepKey ?? null,
    attach_to_path: options?.attachToPath ?? false,
    path_attach_mode: options?.pathAttachMode ?? "none",
  };
}

export async function listLibraries(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/libraries?user_id=${encodeURIComponent(userId)}`), {
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ResourceLibrary[]>;
}

export async function listResourceTemplates(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/resources/templates?user_id=${encodeURIComponent(userId)}`), {
      headers: authHeaders(),
    }),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ResourceTemplateInfo[]>;
}

export async function createFromTemplate(
  userId: string,
  templateId: string,
  options?: CreateFromTemplateOptions,
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/resources/templates/create"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: userId,
        template_id: templateId,
        copy_title: options?.copyTitle?.trim() || "",
        topic_override: options?.topicOverride?.trim() || "",
      }),
    }),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CreateFromTemplateResult>;
}

export async function createLibrary(
  userId: string,
  name: string,
  description = "",
  options?: {
    requirements?: string;
    sourceLibraryId?: string | null;
    sourceMode?: "upload" | "existing_library" | "empty";
  },
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/libraries"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: userId,
        name,
        description,
        requirements: options?.requirements ?? "",
        source_library_id: options?.sourceLibraryId || null,
        source_mode: options?.sourceMode ?? "upload",
      }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ResourceLibrary>;
}

export async function getSupportedUploadFormats() {
  const res = await handleResponse(
    await fetch(apiUrl("/api/libraries/supported-formats"), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ extensions: string[] }>;
}

export async function uploadLibraryFiles(
  userId: string,
  libraryId: string,
  files: File[],
  options?: { requirements?: string },
) {
  const form = new FormData();
  form.append("user_id", userId);
  form.append("requirements", options?.requirements ?? "");
  for (const f of files) form.append("files", f);
  const token = getAccessToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await handleResponse(
    await fetch(apiUrl(`/api/libraries/${libraryId}/upload`), {
      method: "POST",
      headers,
      body: form,
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    library_id: string;
    ingested_chunks: number;
    file_count: number;
    errors: string[];
    library?: ResourceLibrary;
  }>;
}

export async function getLibraryDetail(
  userId: string,
  libraryId: string
): Promise<LibraryDetail | null> {
  const res = await handleResponse(
    await fetch(
      apiUrl(`/api/libraries/${libraryId}?user_id=${encodeURIComponent(userId)}`),
      { headers: authHeaders() }
    )
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LibraryDetail>;
}

export async function getLibraryFilePreview(
  userId: string,
  libraryId: string,
  fileId: string,
): Promise<LibraryFilePreview> {
  const res = await handleResponse(
    await fetch(
      apiUrl(`/api/libraries/${libraryId}/file-preview?user_id=${encodeURIComponent(userId)}&file_id=${encodeURIComponent(fileId)}`),
      { headers: authHeaders() },
    ),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LibraryFilePreview>;
}

export async function deleteLibrary(userId: string, libraryId: string) {
  const res = await handleResponse(
    await fetch(
      apiUrl(`/api/libraries/${libraryId}?user_id=${encodeURIComponent(userId)}`),
      { method: "DELETE", headers: authHeaders() }
    )
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export type GenerateReviewCardResult = {
  card: LearningResource;
};

export async function listReviewCards(userId: string): Promise<LearningResource[]> {
  const paths = [
    `/api/review-cards?user_id=${encodeURIComponent(userId)}`,
    `/api/resources/review-cards?user_id=${encodeURIComponent(userId)}`,
  ];
  for (const path of paths) {
    try {
      const res = await handleResponse(await fetch(apiUrl(path), { headers: authHeaders() }));
      if (res.ok) {
        return (await res.json()) as LearningResource[];
      }
      if (res.status !== 404) throw new Error(await readApiError(res));
    } catch (e: unknown) {
      if (e instanceof Error && !e.message.includes("404")) throw e;
    }
  }
  return [];
}

export async function generateReviewCard(
  userId: string,
  topic: string,
): Promise<GenerateReviewCardResult> {
  const paths = ["/api/review-cards/generate", "/api/resources/review-cards/generate"];
  let lastError = "复习卡生成失败，请确认后端已启动（stop.bat → start.bat）";
  for (const path of paths) {
    try {
      const res = await fetch(apiUrl(path), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ user_id: userId, topic: topic.trim() }),
      });
      if (res.status === 401) {
        clearAccessToken();
        clearAuthSession();
        throw new Error("登录已过期，请重新登录");
      }
      if (res.ok) {
        const card = (await res.json()) as LearningResource;
        return { card };
      }
      if (res.status === 404) continue;
      lastError = await readApiError(res);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("登录已过期")) throw e;
      if (e instanceof Error && e.message === "Failed to fetch") {
        lastError = "无法连接后端，请确认已运行 start.bat 且 http://127.0.0.1:8000 可访问";
      } else if (e instanceof Error) {
        lastError = e.message;
      }
    }
  }
  throw new Error(lastError);
}

export async function generateResources(
  userId: string,
  topic: string,
  options?: GenerateResourceOptions
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/resources/generate"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(generateResourcePayload(userId, topic, options)),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningResource[]>;
}

export async function createResourceGenerationJob(
  userId: string,
  topic: string,
  options?: GenerateResourceOptions,
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/resources/generate/jobs"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(generateResourcePayload(userId, topic, options)),
    }),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ResourceGenerationJob>;
}

export async function getResourceGenerationJob(jobId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/resources/generate/jobs/${encodeURIComponent(jobId)}`), {
      headers: authHeaders(),
    }),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ResourceGenerationJob>;
}

export type ResourceRecommendation = {
  id: string;
  type: string;
  title: string;
  topic: string;
  score: number;
  reason: string;
};

export async function getRecommendations(
  userId: string,
  limit = 5,
  options?: { refresh?: boolean; offset?: number }
) {
  const params = new URLSearchParams({
    user_id: userId,
    limit: String(limit),
  });
  if (options?.refresh) params.set("refresh", "true");
  if (options?.offset !== undefined) params.set("offset", String(options.offset));
  const res = await handleResponse(
    await fetch(apiUrl(`/api/resources/recommendations?${params.toString()}`), {
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ResourceRecommendation[]>;
}

export async function recordResourceView(userId: string, resourceId: string) {
  await handleResponse(
    await fetch(apiUrl(`/api/resources/${resourceId}/view?user_id=${userId}`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
}

export async function recordResourceComplete(
  userId: string,
  resourceId: string,
  masteryLevel?: MasteryLevel
) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/resources/${resourceId}/complete?user_id=${userId}`), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(masteryLevel ? { mastery_level: masteryLevel } : {}),
    })
  );
  if (!res.ok) throw new Error(await readApiError(res));
}

export async function streamGenerateResources(
  userId: string,
  topic: string,
  callbacks: StreamChatCallbacks,
  options?: GenerateResourceOptions
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/resources/generate/stream"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(generateResourcePayload(userId, topic, options)),
    })
  );
  if (!res.ok || !res.body) throw new Error("流式生成失败");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const { event, data: rawData } = parseSseBlock(part);
      const data =
        event === "token" || event === "done"
          ? decodeStreamTextPayload(rawData)
          : rawData;
      if (event === "progress" && data) {
        emitStreamProgress(data, callbacks);
      }
      if (event === "resources" && data) {
        try {
          callbacks.onResources?.(JSON.parse(data) as ResourceSummary[]);
        } catch {
          /* ignore */
        }
      }
      if (event === "error" && data) callbacks.onError?.(data);
      if (event === "done") {
        try {
          const d = JSON.parse(data) as { progress?: number };
          if (typeof d.progress === "number") {
            callbacks.onProgress?.("done", d.progress);
          }
        } catch {
          /* ignore */
        }
        callbacks.onDone?.(data);
      }
    }
  }
}

export async function updatePathStep(
  userId: string,
  stepKey: string,
  status: "pending" | "in_progress" | "done",
  options?: { masteryLevel?: MasteryLevel; resourceId?: string }
) {
  const body: Record<string, string> = {};
  if (options?.masteryLevel) {
    body.mastery_level = options.masteryLevel;
    if (options.resourceId) body.resource_id = options.resourceId;
  } else {
    body.status = status;
  }
  const res = await handleResponse(
    await fetch(apiUrl(`/api/path/${userId}/steps/${encodeURIComponent(stepKey)}`), {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body),
    })
  );
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<LearningPath>;
}

export type MasteryLevel = "forgot" | "fuzzy" | "mastered";

export type MasteryRecord = {
  level: MasteryLevel;
  next_review_at: string;
  interval_days: number;
  streak: number;
  step_key: string;
  resource_id: string;
  title: string;
  updated_at: string;
  due_now?: boolean;
};

export type MasteryFeedbackResponse = {
  ok: boolean;
  record: MasteryRecord;
  path_updated: boolean;
  next_review_label: string;
};

export async function submitMasteryFeedback(
  userId: string,
  masteryLevel: MasteryLevel,
  options?: { resourceId?: string; stepKey?: string; title?: string }
): Promise<MasteryFeedbackResponse> {
  const key = recordLookupKey(options?.resourceId, options?.stepKey);
  if (!key) throw new Error("请提供 resourceId 或 stepKey");

  const localRecords = loadLocalMasteryRecords(userId);
  const record = buildMasteryRecord(masteryLevel, options || {}, localRecords[key]);

  try {
    const res = await handleResponse(
      await fetch(apiUrl("/api/mastery/feedback"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          user_id: userId,
          mastery_level: masteryLevel,
          resource_id: options?.resourceId || "",
          step_key: options?.stepKey || "",
        }),
      })
    );
    if (res.ok) {
      const data = (await res.json()) as MasteryFeedbackResponse;
      saveLocalMasteryRecord(userId, key, data.record);
      return data;
    }
  } catch {
    /* 降级到路径接口 */
  }

  try {
    const res = await handleResponse(
      await fetch(apiUrl(`/api/path/${userId}/mastery-feedback`), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          user_id: userId,
          mastery_level: masteryLevel,
          resource_id: options?.resourceId || "",
          step_key: options?.stepKey || "",
        }),
      })
    );
    if (res.ok) {
      const data = (await res.json()) as MasteryFeedbackResponse;
      saveLocalMasteryRecord(userId, key, data.record);
      return data;
    }
  } catch {
    /* 降级到本地记录 */
  }

  saveLocalMasteryRecord(userId, key, record);

  return {
    ok: true,
    record,
    path_updated: false,
    next_review_label: formatReviewLabel(record.next_review_at),
  };
}

export async function getMasteryRecords(userId: string): Promise<{
  user_id: string;
  records: Record<string, MasteryRecord>;
}> {
  const local = loadLocalMasteryRecords(userId);
  try {
    const prefs = await getPreferences(userId);
    const remote = (prefs as UserPreferences & { mastery_records?: Record<string, MasteryRecord> })
      .mastery_records;
    if (remote && Object.keys(remote).length) {
      return { user_id: userId, records: { ...local, ...remote } };
    }
  } catch {
    /* 使用本地缓存 */
  }
  return { user_id: userId, records: local };
}

export type ChatAttachment = {
  id: string;
  name: string;
  kind: "image" | "file";
  mime_type: string;
  url: string;
  size: number;
  text_preview?: string;
};

export type ChatConversationSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

export type ChatMessageItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  resources: ResourceSummary[];
  turn_id?: string;
  conversation_id?: string;
  attachments?: ChatAttachment[];
  created_at: string;
};

export async function getChatConversations(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/chat/conversations/${userId}`), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ChatConversationSummary[]>;
}

export async function createChatConversation(userId: string, title = "新对话") {
  const res = await handleResponse(
    await fetch(apiUrl("/api/chat/conversations"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ user_id: userId, title }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ChatConversationSummary>;
}

export async function getConversationMessages(userId: string, conversationId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/chat/conversations/${userId}/${conversationId}`), {
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ChatMessageItem[]>;
}

export async function deleteChatConversation(userId: string, conversationId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/chat/conversations/${userId}/${conversationId}`), {
      method: "DELETE",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function getChatHistory(userId: string, conversationId?: string) {
  const q = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : "";
  const res = await handleResponse(
    await fetch(apiUrl(`/api/chat/history/${userId}${q}`), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ChatMessageItem[]>;
}

export async function appendChatHistory(
  userId: string,
  role: "user" | "assistant",
  content: string,
  resources: ResourceSummary[] = [],
  options?: {
    turnId?: string;
    attachments?: ChatAttachment[];
    conversationId?: string;
  }
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/chat/history"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: userId,
        conversation_id: options?.conversationId || "",
        role,
        content,
        resources,
        turn_id: options?.turnId || "",
        attachments: options?.attachments || [],
      }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ChatMessageItem>;
}

export async function deleteChatTurn(userId: string, userMessageId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/chat/history/${userId}/turn/${userMessageId}`), {
      method: "DELETE",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function deleteAssistantForTurn(userId: string, userMessageId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/chat/history/${userId}/turn/${userMessageId}/assistant`), {
      method: "DELETE",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function clearChatHistory(userId: string, conversationId?: string) {
  const q = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : "";
  const res = await handleResponse(
    await fetch(apiUrl(`/api/chat/history/${userId}${q}`), {
      method: "DELETE",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean; deleted: number }>;
}

export async function uploadChatAttachments(userId: string, files: File[]) {
  const form = new FormData();
  form.append("user_id", userId);
  files.forEach((f) => form.append("files", f));
  const res = await handleResponse(
    await fetch(apiUrl("/api/chat/attachments"), {
      method: "POST",
      headers: authHeaders(undefined, false),
      body: form,
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ChatAttachment[]>;
}

export type UserPreferences = {
  user_id: string;
  starred_resource_ids: string[];
  account_patch: Record<string, string>;
  daily_plan?: import("@/lib/dailyPlan").DailyPlan;
  mastery_records?: Record<string, MasteryRecord>;
};

export async function getPreferences(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/preferences/${userId}`), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<UserPreferences>;
}

export async function patchPreferences(
  userId: string,
  patch: {
    starred_resource_ids?: string[];
    daily_plan?: import("@/lib/dailyPlan").DailyPlan;
    mastery_records?: Record<string, MasteryRecord>;
  }
) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/preferences/${userId}`), {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(patch),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<UserPreferences>;
}

export async function speakTts(text: string, voice: "female" | "male" | "off") {
  const res = await handleResponse(
    await fetch(apiUrl("/api/tts/speak"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ text, voice }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ audio_base64: string; format: string; provider: string }>;
}

export async function listResources(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/resources?user_id=${userId}`), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningResource[]>;
}

export async function getResource(userId: string, resourceId: string) {
  const res = await handleResponse(
    await fetch(
      apiUrl(`/api/resources/${encodeURIComponent(resourceId)}?user_id=${encodeURIComponent(userId)}`),
      { headers: authHeaders() }
    )
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningResource>;
}

export async function deleteResource(userId: string, resourceId: string) {
  const res = await handleResponse(
    await fetch(
      apiUrl(`/api/resources/${encodeURIComponent(resourceId)}?user_id=${encodeURIComponent(userId)}`),
      { method: "DELETE", headers: authHeaders() }
    )
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function regenerateResource(
  userId: string,
  resourceId: string,
  payload: { requirements?: string; tags?: string[] },
) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/resources/${encodeURIComponent(resourceId)}/regenerate`), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: userId,
        requirements: payload.requirements || "",
        tags: payload.tags || [],
      }),
    }),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningResource>;
}

export async function clearUnstarredResources(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/resources/clear-unstarred?user_id=${encodeURIComponent(userId)}`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean; deleted_count: number; kept_count: number }>;
}

export async function getPath(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/path/${userId}`), { headers: authHeaders() })
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningPath>;
}

export async function clearPath(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/path/${userId}/clear`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean; had_path: boolean }>;
}

export type PathReplanResult = {
  path: LearningPath;
  meta: {
    stage_count: number;
    node_count: number;
    quality_checked: boolean;
    remaining_issues: string[];
    version: number;
  };
};

export type PathResourceRegenResult = {
  path: LearningPath;
  resources: LearningResource[];
  meta: {
    generated_count: number;
    stages_processed: number;
    type_breakdown: Record<string, number>;
    stages: Array<{
      step_id: string;
      title: string;
      generated_count: number;
      types: string[];
      resource_ids: string[];
      titles?: string[];
    }>;
    quality_checked: boolean;
    generation_mode?: string;
    library_name?: string;
    library_id?: string;
    fallback_count?: number;
    fallback_warnings?: string[];
    forced_regen?: boolean;
  };
};

export async function regenPathResources(
  userId: string,
  options?: { libraryId?: string | null },
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/resources/regen-for-path"), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        library_id: options?.libraryId || null,
      }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PathResourceRegenResult>;
}

export async function replanPath(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/path/${userId}/replan`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PathReplanResult>;
}

export type PathConfirmResult = {
  path: LearningPath;
  resources: LearningResource[];
  meta: {
    ok: boolean;
    issues: string[];
    fixes: string[];
    warnings: string[];
    stage_count: number;
    node_count: number;
    resource_count: number;
    linked_resource_count: number;
    starred_count: number;
    analysis_present: boolean;
    profile_present: boolean;
    confirmed_at: string;
  };
};

export async function confirmPathReplan(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/path/${userId}/confirm`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PathConfirmResult>;
}

export type PathReplanSubPhase = {
  label: string;
  status: "pending" | "active" | "done";
};

export type PathReplanJobResult = {
  stage_count: number;
  node_count: number;
  linked_resource_count: number;
  generated_count: number;
  deleted_resource_count: number;
  kept_resource_count: number;
  starred_count: number;
  fallback_count: number;
  warnings: string[];
  library_name: string;
  planning_sources?: Record<string, string | number>;
};

export type ReplanContext = {
  learning_goal: string;
  goal_source: string;
  conversation_id: string;
  chat_basis: string;
  intent_turn_count: number;
  intent_summary: string;
  intent_topics: string[];
  starred_count: number;
  starred_titles: string[];
  resource_view_count: number;
  resource_complete_count: number;
  quiz_summary: string;
  library_id: string;
  library_name: string;
  planning_mode: string;
  planning_requirement: string;
  can_start: boolean;
  block_reason: string;
};

export type PathReplanJob = {
  id: string;
  user_id: string;
  status: "queued" | "running" | "done" | "error";
  step_index: number;
  step_label: string;
  stage: string;
  progress: number;
  sub_phases: PathReplanSubPhase[];
  elapsed_sec: number;
  started_at?: string | null;
  result_summary: string;
  error: string;
  library_id: string;
  result: PathReplanJobResult | null;
  created_at: string;
  updated_at: string;
};

export async function getReplanContext(
  userId: string,
  options?: {
    conversationId?: string | null;
    learningGoal?: string | null;
    libraryId?: string | null;
    planningMode?: "auto" | "chapter" | "time" | "detailed";
    planningRequirement?: string | null;
  },
) {
  const params = new URLSearchParams();
  if (options?.conversationId) params.set("conversation_id", options.conversationId);
  if (options?.learningGoal?.trim()) params.set("learning_goal", options.learningGoal.trim());
  if (options?.libraryId) params.set("library_id", options.libraryId);
  if (options?.planningMode) params.set("planning_mode", options.planningMode);
  if (options?.planningRequirement?.trim()) {
    params.set("planning_requirement", options.planningRequirement.trim());
  }
  const q = params.toString();
  const res = await handleResponse(
    await fetch(
      apiUrl(`/api/profile/${encodeURIComponent(userId)}/replan-context${q ? `?${q}` : ""}`),
      { headers: authHeaders() },
    ),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ReplanContext>;
}

export async function createPathReplanJob(
  userId: string,
  options?: {
    libraryId?: string | null;
    conversationId?: string | null;
    learningGoal?: string | null;
    planningMode?: "auto" | "chapter" | "time" | "detailed";
    planningRequirement?: string | null;
  },
) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/path/${encodeURIComponent(userId)}/replan-jobs`), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        library_id: options?.libraryId || null,
        conversation_id: options?.conversationId || null,
        learning_goal: options?.learningGoal?.trim() || null,
        planning_mode: options?.planningMode || "auto",
        planning_requirement: options?.planningRequirement?.trim() || null,
      }),
    }),
  );
  if (res.status === 409 || res.status === 422) {
    const text = await res.text();
    throw new Error(text || "无法启动重规划任务");
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PathReplanJob>;
}

export async function getPathReplanJob(jobId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/path/replan-jobs/${encodeURIComponent(jobId)}`), {
      headers: authHeaders(),
    }),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PathReplanJob>;
}

export async function refreshPath(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/path/${userId}/refresh`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningPath>;
}

export type ClassroomGenerateInput = {
  user_id: string;
  step_key: string;
  title: string;
  objective: string;
  resource_ids: string[];
  selected_resource_ids: string[];
  estimated_minutes: number;
  course_name: string;
  teaching_mode?: string;
  depth_level?: string;
  classroom_keywords?: string[];
  local_materials?: { title: string; content_excerpt: string }[];
  ai_material_requests?: string[];
};

export async function generateClassroomSession(input: ClassroomGenerateInput) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/classroom/session"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ClassroomSession>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function generateClassroomQuiz(input: ClassroomQuizInput) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/classroom/quiz"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ClassroomQuizResponse>;
}

export async function generateClassroomInteraction(input: ClassroomInteractionInput) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/classroom/interaction"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ClassroomInteractionResponse>;
}

export async function startClassroomGenerationJob(input: ClassroomGenerateInput) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/classroom/session/jobs"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ClassroomGenerationJob>;
}

export async function getClassroomGenerationJob(jobId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/classroom/session/jobs/${encodeURIComponent(jobId)}`), {
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ClassroomGenerationJob>;
}

export async function exportClassroomPptx(userId: string, session: ClassroomSession) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/classroom/session/export-pptx"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ user_id: userId, session }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

export type ClassroomLibrarySeed = {
  stepKey: string;
  title: string;
  objective: string;
  resourceIds: string[];
  estimatedMinutes: number;
  courseName: string;
  source: "path" | "manual";
};

export type ClassroomLibraryItem = {
  id: string;
  job_id: string;
  user_id: string;
  step_key: string;
  title: string;
  objective: string;
  course_name: string;
  status: "queued" | "running" | "done" | "error";
  stage: string;
  progress: number;
  is_favorite: boolean;
  has_result: boolean;
  error: string;
  seed: ClassroomLibrarySeed;
  result: ClassroomSession | null;
  created_at: string;
  updated_at: string;
};

export async function listClassroomLibrary() {
  const res = await handleResponse(
    await fetch(apiUrl("/api/classroom/library"), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { items: ClassroomLibraryItem[] };
  return data.items;
}

export async function deleteClassroomLibraryItem(itemId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/classroom/library/${encodeURIComponent(itemId)}`), {
      method: "DELETE",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function patchClassroomLibraryFavorite(itemId: string, isFavorite: boolean) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/classroom/library/${encodeURIComponent(itemId)}`), {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ is_favorite: isFavorite }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ClassroomLibraryItem>;
}

export async function regenerateClassroomLibraryItem(itemId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/classroom/library/${encodeURIComponent(itemId)}/regenerate`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ClassroomLibraryItem>;
}

export type ClassroomParsedMaterial = {
  id: string;
  title: string;
  size: number;
  mime_type: string;
  content_excerpt: string;
  status: "parsed" | "recorded" | "error";
  error?: string;
};

export async function parseClassroomMaterials(userId: string, files: File[]) {
  const form = new FormData();
  form.append("user_id", userId);
  for (const file of files) form.append("files", file);
  const res = await handleResponse(
    await fetch(apiUrl("/api/classroom/materials/parse"), {
      method: "POST",
      headers: authHeaders({}, false),
      body: form,
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ materials: ClassroomParsedMaterial[] }>;
}

export type AuthUser = {
  user_id: string;
  email: string;
  display_name: string;
  access_token: string;
  role?: "user" | "admin";
};

export type AdminDashboard = {
  overview: {
    users_registered: number;
    resources_total: number;
    libraries_total: number;
    conversations_total: number;
    messages_total: number;
    events_total: number;
    quiz_attempts_total: number;
    active_users_7d: number;
    chat_active_users_7d: number;
    resource_by_type: Record<string, number>;
    events_by_type: Record<string, number>;
  };
  daily_activity: { date: string; events: number; messages: number; resources: number }[];
  user_rankings: { user_id: string; label: string; events: number }[];
};

export type AdminUserRow = {
  user_id: string;
  email: string;
  display_name: string;
  course_name: string;
  created_at: string;
  kind: string;
  resource_count: number;
  message_count: number;
};

export async function fetchDemoToken(displayName: string): Promise<AuthUser> {
  const res = await fetch(apiUrl("/api/auth/demo-token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!res.ok) throw new Error(await res.text());
  const user = (await res.json()) as AuthUser;
  if (user.access_token) setAccessToken(user.access_token);
  return user;
}

export async function sendOtp(email: string): Promise<{ sent: boolean; debug_code?: string }> {
  const res = await fetch(apiUrl("/api/auth/send-otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function verifyOtp(email: string, code: string): Promise<AuthUser> {
  const res = await fetch(apiUrl("/api/auth/verify-otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "验证失败");
    throw new Error(msg);
  }
  const user = (await res.json()) as AuthUser;
  if (user.access_token) setAccessToken(user.access_token);
  return user;
}

export async function fetchAdminToken(displayName = "系统管理员"): Promise<AuthUser> {
  const res = await fetch(apiUrl("/api/auth/admin-token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!res.ok) throw new Error(await res.text());
  const user = (await res.json()) as AuthUser;
  if (user.access_token) setAccessToken(user.access_token);
  return user;
}

export async function getAdminDashboard() {
  const res = await handleResponse(
    await fetch(apiUrl("/api/admin/dashboard"), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminDashboard>;
}

export async function getAdminUsers() {
  const res = await handleResponse(
    await fetch(apiUrl("/api/admin/users"), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ users: AdminUserRow[] }>;
}

export async function deleteAdminUser(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(userId)}`), {
      method: "DELETE",
      headers: authHeaders(),
    })
  );
  if (!res.ok) {
    try {
      const body = (await res.json()) as { detail?: string };
      throw new Error(body.detail || "删除失败");
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== "删除失败") throw err;
      throw new Error(await res.text().catch(() => "删除失败"));
    }
  }
  return res.json() as Promise<{ deleted: boolean; user_id: string }>;
}

export async function resetDemoUserData() {
  const res = await handleResponse(
    await fetch(apiUrl("/api/admin/users/demo/reset"), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ reset: boolean; user_id: string }>;
}

export async function clearDemoUserDataSelf() {
  const res = await handleResponse(
    await fetch(apiUrl("/api/demo/clear"), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ cleared: boolean; user_id: string }>;
}

export async function resetDemoUserDataSelf() {
  const res = await handleResponse(
    await fetch(apiUrl("/api/demo/reset"), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ reset: boolean; user_id: string }>;
}

export async function getAdminResources() {
  const res = await handleResponse(
    await fetch(apiUrl("/api/admin/resources"), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    overview: AdminDashboard["overview"];
    resources: { id: string; user_id: string; type: string; title: string; created_at: string }[];
  }>;
}

export async function getAdminActivity() {
  const res = await handleResponse(
    await fetch(apiUrl("/api/admin/activity"), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    daily_activity: AdminDashboard["daily_activity"];
    recent_events: { id: string; user_id: string; event_type: string; resource_id: string; created_at: string }[];
    user_rankings: AdminDashboard["user_rankings"];
  }>;
}

// ── Eval ──────────────────────────────────────────────────────────────────────

export type RadarData = {
  dimensions: string[];
  before: number[];
  after: number[];
};

export type EvalEvent = {
  label: string;
  color: string;
  content: string;
  date: string;
};

export type TrendPoint = {
  label: string;
  value: number;
};

export type PressureBalance = {
  mode: "review_heavy" | "balanced" | "new_learning";
  due_today: number;
  due_soon: number;
  recommended_review_minutes: number;
  recommended_new_minutes: number;
  summary: string;
};

export type EvalStats = {
  total_resources: number;
  resources_by_type: Record<string, number>;
  profile_completeness: number;
  study_days: number;
  study_streak?: number;
  studied_today?: boolean;
  has_path: boolean;
  radar: RadarData;
  recent_events: EvalEvent[];
  forgetting_risk?: TrendPoint[];
  review_pressure?: TrendPoint[];
  retention_curve?: TrendPoint[];
  pressure_balance?: PressureBalance;
  ai_advice?: string;
  strengths?: string;
  improvements?: string;
  advice_updated_at?: string;
};

export type WeeklyReviewResult = {
  resource: LearningResource;
  markdown: string;
  message: string;
};

export type EvalSubmitResponse = {
  score: number;
  total: number;
  feedback: string;
  weak_topics: string[];
};

export async function getEvalStats(userId: string): Promise<EvalStats> {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/eval/${userId}`), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<EvalStats>;
}

export async function refreshEvalStats(userId: string): Promise<EvalStats> {
  const postRes = await handleResponse(
    await fetch(apiUrl(`/api/eval/${userId}/refresh`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (postRes.ok) {
    return postRes.json() as Promise<EvalStats>;
  }
  if (postRes.status !== 404) {
    throw new Error(await readApiError(postRes));
  }

  const getRefreshRes = await handleResponse(
    await fetch(apiUrl(`/api/eval/${userId}?refresh=1`), { headers: authHeaders() })
  );
  if (getRefreshRes.ok) {
    return getRefreshRes.json() as Promise<EvalStats>;
  }
  if (getRefreshRes.status !== 404 && getRefreshRes.status !== 422) {
    throw new Error(await readApiError(getRefreshRes));
  }

  return getEvalStats(userId);
}

export async function submitEval(
  userId: string,
  quizId: string,
  answers: number[]
): Promise<EvalSubmitResponse> {
  const res = await handleResponse(
    await fetch(apiUrl("/api/eval/submit"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ user_id: userId, quiz_id: quizId, answers }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<EvalSubmitResponse>;
}

// ── User account ──────────────────────────────────────────────────────────────

export async function generateWeeklyReview(userId: string): Promise<WeeklyReviewResult> {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/eval/${userId}/weekly-review`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<WeeklyReviewResult>;
}

export type UserAccount = {
  user_id: string;
  display_name: string;
  email: string;
  course_name: string;
  major: string;
  bio: string;
  phone: string;
  created_at?: string | null;
};

export type UserAccountUpdate = Partial<
  Pick<UserAccount, "display_name" | "course_name" | "major" | "bio" | "phone">
>;

export async function getAccount(userId: string): Promise<UserAccount> {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/account/${userId}`), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<UserAccount>;
}

export async function updateAccount(
  userId: string,
  body: UserAccountUpdate
): Promise<UserAccount> {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/account/${userId}`), {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<UserAccount>;
}

export { setAccessToken, clearAccessToken, getAccessToken };
