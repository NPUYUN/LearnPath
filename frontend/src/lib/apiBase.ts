const DEV_API_BASE = "http://127.0.0.1:8000";

/** 浏览器开发环境直连后端，避免 Next rewrites 缓冲 SSE 导致对话无输出 */
export function getApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return process.env.NODE_ENV === "development" ? DEV_API_BASE : "";
  }
  return DEV_API_BASE;
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}
