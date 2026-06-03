import type { UserRole } from "@/store/appStore";

const TOKEN_KEY = "learnpath-access-token";
const SESSION_KEY = "learnpath-auth-session";

export type AuthSession = {
  userId: string;
  userName: string;
  courseName: string;
  userEmail: string;
  role: UserRole;
};

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOKEN_KEY);
}

export function saveAuthSession(session: AuthSession): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
    };
    if (!payload.exp) return false;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

/** 刷新页面时从 sessionStorage 恢复登录态（需同时存在 token 与会话快照） */
export function canRestoreAuthSession(): AuthSession | null {
  const token = getAccessToken();
  const session = loadAuthSession();
  if (!token || !session || isTokenExpired(token)) {
    if (token && isTokenExpired(token)) {
      clearAccessToken();
      clearAuthSession();
    }
    return null;
  }
  return session;
}