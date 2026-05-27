import type { AppRoute } from "@/hooks/navRoutes";
import { isNavRoute, isStandaloneRoute } from "@/hooks/navRoutes";

let pushRoute: ((path: AppRoute) => void) | null = null;

export function registerClientNav(fn: (path: AppRoute) => void) {
  pushRoute = fn;
}

export function clientNavigate(path: AppRoute) {
  if (!isNavRoute(path) && !isStandaloneRoute(path)) return;
  if (pushRoute) {
    pushRoute(path);
    return;
  }
  window.location.assign(path);
}
