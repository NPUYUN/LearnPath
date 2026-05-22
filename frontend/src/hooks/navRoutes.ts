export const NAV_ROUTES = [
  "/chat",
  "/profile",
  "/path",
  "/resources",
  "/evaluation",
  "/account",
  "/settings",
] as const;
export type NavRoute = (typeof NAV_ROUTES)[number];

export function isNavRoute(path: string): path is NavRoute {
  return (NAV_ROUTES as readonly string[]).includes(path);
}
