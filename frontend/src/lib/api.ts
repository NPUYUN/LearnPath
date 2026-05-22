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
