export const ADMIN_ROUTES = ["/admin", "/admin/users", "/admin/resources", "/admin/activity"] as const;

export type AdminRoute = (typeof ADMIN_ROUTES)[number];

export function isAdminRoute(path: string): path is AdminRoute {
  return (ADMIN_ROUTES as readonly string[]).includes(path);
}
