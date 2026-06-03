import { clearAccessToken, clearAuthSession, getAccessToken, setAccessToken } from "@/store/authStore";
import { apiUrl } from "./apiBase";
import { decodeStreamTextPayload, parseSseBlock } from "./sseParse";

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
};

export type PathStep = {
  order: number;
  title: string;
  objective: string;
  resource_ids: string[];
  estimated_minutes: number;
  status: string;
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

export type StreamChatCallbacks = {
  onToken?: (t: string) => void;
  onDone?: (reply: string) => void;
  onIntent?: (intent: string) => void;
  onProgress?: (stage: string) => void;
  onProfile?: (profile: StudentProfile) => void;
  onResources?: (items: ResourceSummary[]) => void;
  onPath?: (info: { steps: number; version: number }) => void;
  onError?: (msg: string) => void;
};

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
    throw e;
  }
  clearTimeout(timer);
  if (!res.ok || !res.body) throw new Error("流式请求失败");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastReply = "";
  let gotToken = false;

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
        try {
          const p = JSON.parse(data) as { stage?: string };
          callbacks.onProgress?.(p.stage || data);
        } catch {
          callbacks.onProgress?.(data);
        }
      }
      if (event === "profile" && data) {
        try {
          callbacks.onProfile?.(JSON.parse(data) as StudentProfile);
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
        try {
          const p = JSON.parse(data) as { stage?: string };
          callbacks.onProgress?.(p.stage || data);
        } catch {
          callbacks.onProgress?.(data);
        }
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

export type GenerateResourceOptions = {
  resourceTypes?: string[];
  libraryId?: string | null;
  newLibraryName?: string;
  deepThinking?: boolean;
};

export async function listLibraries(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/libraries?user_id=${encodeURIComponent(userId)}`), {
      headers: authHeaders(),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ResourceLibrary[]>;
}

export async function createLibrary(userId: string, name: string, description = "") {
  const res = await handleResponse(
    await fetch(apiUrl("/api/libraries"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ user_id: userId, name, description }),
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

export async function uploadLibraryFiles(userId: string, libraryId: string, files: File[]) {
  const form = new FormData();
  form.append("user_id", userId);
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

export async function generateResources(
  userId: string,
  topic: string,
  options?: GenerateResourceOptions
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/resources/generate"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: userId,
        topic,
        resource_types: options?.resourceTypes ?? ["doc", "mindmap", "quiz", "reading", "media", "code"],
        library_id: options?.libraryId || null,
        new_library_name: options?.newLibraryName || null,
        deep_thinking: options?.deepThinking ?? false,
      }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningResource[]>;
}

export type ResourceRecommendation = {
  id: string;
  type: string;
  title: string;
  topic: string;
  score: number;
  reason: string;
};

export async function getRecommendations(userId: string, limit = 5) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/resources/recommendations?user_id=${userId}&limit=${limit}`), {
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

export async function recordResourceComplete(userId: string, resourceId: string) {
  await handleResponse(
    await fetch(apiUrl(`/api/resources/${resourceId}/complete?user_id=${userId}`), {
      method: "POST",
      headers: authHeaders(),
    })
  );
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
      body: JSON.stringify({
        user_id: userId,
        topic,
        resource_types: options?.resourceTypes ?? ["doc", "mindmap", "quiz", "reading", "media", "code"],
        library_id: options?.libraryId || null,
        new_library_name: options?.newLibraryName || null,
        deep_thinking: options?.deepThinking ?? false,
      }),
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
        try {
          const p = JSON.parse(data) as { stage?: string };
          callbacks.onProgress?.(p.stage || data);
        } catch {
          callbacks.onProgress?.(data);
        }
      }
      if (event === "resources" && data) {
        try {
          callbacks.onResources?.(JSON.parse(data) as ResourceSummary[]);
        } catch {
          /* ignore */
        }
      }
      if (event === "error" && data) callbacks.onError?.(data);
      if (event === "done") callbacks.onDone?.(data);
    }
  }
}

export async function updatePathStep(
  userId: string,
  order: number,
  status: "pending" | "in_progress" | "done"
) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/path/${userId}/steps/${order}`), {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningPath>;
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

export async function getPath(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/path/${userId}`), { headers: authHeaders() })
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningPath>;
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

// ── Auth ─────────────────────────────────────────────────────────────────────

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

export type EvalStats = {
  total_resources: number;
  resources_by_type: Record<string, number>;
  profile_completeness: number;
  study_days: number;
  has_path: boolean;
  radar: RadarData;
  recent_events: EvalEvent[];
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
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<EvalStats>;
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
