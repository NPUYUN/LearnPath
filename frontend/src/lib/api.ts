const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

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

export async function chat(userId: string, message: string) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, message, stream: false }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ reply: string; profile?: StudentProfile }>;
}

export async function streamChat(
  userId: string,
  message: string,
  onToken: (t: string) => void,
  onDone: (reply: string) => void
) {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, message, stream: true }),
  });
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
      if (event === "token" && data) onToken(data);
      if (event === "done") lastReply = data;
    }
  }
  onDone(lastReply);
}

export async function getProfile(userId: string) {
  const res = await fetch(`${API_BASE}/api/profile/${userId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<StudentProfile>;
}

export async function generateResources(userId: string, topic: string) {
  const res = await fetch(`${API_BASE}/api/resources/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      topic,
      resource_types: ["doc", "mindmap", "quiz", "reading", "media", "code"],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningResource[]>;
}

export async function listResources(userId: string) {
  const res = await fetch(`${API_BASE}/api/resources?user_id=${userId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningResource[]>;
}

export async function getPath(userId: string) {
  const res = await fetch(`${API_BASE}/api/path/${userId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningPath>;
}

export async function refreshPath(userId: string) {
  const res = await fetch(`${API_BASE}/api/path/${userId}/refresh`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LearningPath>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export type AuthUser = {
  user_id: string;
  email: string;
  display_name: string;
};

/** 向邮箱发送验证码。Debug 模式下响应会附带 debug_code 字段。 */
export async function sendOtp(email: string): Promise<{ sent: boolean; debug_code?: string }> {
  const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 验证邮箱 + 验证码，返回用户信息（不存在则自动注册）。 */
export async function verifyOtp(email: string, code: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "验证失败");
    throw new Error(msg);
  }
  return res.json() as Promise<AuthUser>;
}

// ── Eval stats ────────────────────────────────────────────────────────────────

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

export async function getEvalStats(userId: string): Promise<EvalStats> {
  const res = await fetch(`${API_BASE}/api/eval/${userId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<EvalStats>;
}

