import type { NavRoute } from "@/hooks/navRoutes";
import { isNavRoute } from "@/hooks/navRoutes";

let pushRoute: ((path: NavRoute) => void) | null = null;

export function registerClientNav(fn: (path: NavRoute) => void) {
  pushRoute = fn;
}

export function clientNavigate(path: NavRoute) {
  if (!isNavRoute(path)) return;
  if (pushRoute) {
    pushRoute(path);
    return;
  }
  window.location.assign(path);
}
