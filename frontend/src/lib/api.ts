import { clearAccessToken, getAccessToken, setAccessToken } from "@/store/authStore";
import { getApiBase } from "./apiBase";

function apiUrl(path: string): string {
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function handleResponse(res: Response): Promise<Response> {
  if (res.status === 401) {
    clearAccessToken();
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
  deepThinking = false
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/chat/stream"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: userId,
        message,
        stream: true,
        chunk_size: chunkSize,
        deep_thinking: deepThinking,
      }),
    })
  );
  if (!res.ok || !res.body) throw new Error("流式请求失败");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastReply = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (event === "token" && data) callbacks.onToken?.(data);
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
      if (event === "error" && data) callbacks.onError?.(data);
      if (event === "done") lastReply = data;
    }
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
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
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

export async function generateResources(
  userId: string,
  topic: string,
  resourceTypes?: string[]
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/resources/generate"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: userId,
        topic,
        resource_types: resourceTypes ?? ["doc", "mindmap", "quiz", "reading", "media", "code"],
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
  resourceTypes?: string[]
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/resources/generate/stream"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: userId,
        topic,
        resource_types: resourceTypes ?? ["doc", "mindmap", "quiz", "reading", "media", "code"],
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
      let event = "message";
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
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

export type ChatMessageItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  resources: ResourceSummary[];
  created_at: string;
};

export async function getChatHistory(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/chat/history/${userId}`), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ChatMessageItem[]>;
}

export async function appendChatHistory(
  userId: string,
  role: "user" | "assistant",
  content: string,
  resources: ResourceSummary[] = []
) {
  const res = await handleResponse(
    await fetch(apiUrl("/api/chat/history"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ user_id: userId, role, content, resources }),
    })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ChatMessageItem>;
}

export type UserPreferences = {
  user_id: string;
  starred_resource_ids: string[];
  account_patch: Record<string, string>;
};

export async function getPreferences(userId: string) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/preferences/${userId}`), { headers: authHeaders() })
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<UserPreferences>;
}

export async function patchPreferences(userId: string, starred_resource_ids: string[]) {
  const res = await handleResponse(
    await fetch(apiUrl(`/api/preferences/${userId}`), {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ starred_resource_ids }),
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
