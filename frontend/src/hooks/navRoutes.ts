/** 主壳 Keep-alive 路由（带侧栏） */
export const NAV_ROUTES = [
  "/chat",
  "/profile",
  "/path",
  "/resources",
  "/evaluation",
  "/account",
  "/settings",
] as const;

/** 独立全屏页（无侧栏） */
export const STANDALONE_ROUTES = ["/insights"] as const;

export type NavRoute = (typeof NAV_ROUTES)[number];
export type StandaloneRoute = (typeof STANDALONE_ROUTES)[number];
export type AppRoute = NavRoute | StandaloneRoute;

export function isNavRoute(path: string): path is NavRoute {
  return (NAV_ROUTES as readonly string[]).includes(path);
}

export function isStandaloneRoute(path: string): path is StandaloneRoute {
  return (STANDALONE_ROUTES as readonly string[]).includes(path);
}

export function isAppRoute(path: string): path is AppRoute {
  return isNavRoute(path) || isStandaloneRoute(path);
}

const LIBRARY_DETAIL_RE = /^\/resources\/library\/([^/]+)$/;
const RESOURCE_VIEW_RE = /^\/resources\/view\/([^/]+)$/;

export function isLibraryDetailPath(path: string): boolean {
  return LIBRARY_DETAIL_RE.test(path);
}

export function libraryIdFromPath(path: string): string | null {
  const m = path.match(LIBRARY_DETAIL_RE);
  return m ? decodeURIComponent(m[1]) : null;
}

export function isResourceViewPath(path: string): boolean {
  return RESOURCE_VIEW_RE.test(path);
}

export function resourceIdFromPath(path: string): string | null {
  const m = path.match(RESOURCE_VIEW_RE);
  return m ? decodeURIComponent(m[1]) : null;
}

export function isResourcesSubPath(path: string): boolean {
  return isLibraryDetailPath(path) || isResourceViewPath(path);
}
