/** 开发环境默认走 Next 同源代理（见 next.config rewrites），避免 CORS 与直连失败 */
export function getApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return "";
  return "http://localhost:8000";
}
