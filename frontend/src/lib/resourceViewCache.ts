import type { LearningResource } from "@/lib/api";
import { useAppStore } from "@/store/appStore";

const stashKey = (resourceId: string) => `lp_resource_view:${resourceId}`;

/** 跳转全屏前写入会话缓存，全屏页可立即展示列表中已有内容 */
export function stashResourceForView(resource: LearningResource): void {
  if (typeof window === "undefined" || !resource?.id) return;
  try {
    sessionStorage.setItem(stashKey(resource.id), JSON.stringify(resource));
  } catch {
    /* quota / private mode */
  }
}

export function peekResourceForView(resourceId: string): LearningResource | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(stashKey(resourceId));
    if (!raw) return null;
    return JSON.parse(raw) as LearningResource;
  } catch {
    return null;
  }
}

export function clearResourceViewStash(resourceId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(stashKey(resourceId));
  } catch {
    /* ignore */
  }
}

/** 从会话缓存或全局 store 解析资源（跳转过渡用，仍会请求后端刷新） */
export function resolveResourceLocally(_userId: string, resourceId: string): LearningResource | null {
  const stashed = peekResourceForView(resourceId);
  if (stashed?.id === resourceId) return stashed;

  const fromStore = useAppStore.getState().resources.find((r) => r.id === resourceId);
  if (fromStore) return fromStore;

  return null;
}

type ViewRouter = { push: (href: string) => void };

/** 写入缓存并跳转资源全屏页 */
export function openResourceView(
  router: ViewRouter,
  resourceOrId: LearningResource | string,
  userId?: string,
): void {
  const id = typeof resourceOrId === "string" ? resourceOrId : resourceOrId.id;
  if (typeof resourceOrId === "string") {
    const resolved = userId ? resolveResourceLocally(userId, resourceOrId) : null;
    if (resolved) stashResourceForView(resolved);
  } else {
    stashResourceForView(resourceOrId);
  }
  router.push(`/resources/view/${encodeURIComponent(id)}`);
}
