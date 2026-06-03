import type { AdminRoute } from "@/hooks/adminRoutes";
import type { ComponentType } from "react";

export type AdminPageModuleEntry = {
  route: AdminRoute;
  label: string;
  load: () => Promise<{ default: ComponentType }>;
};

/** 管理台页面模块（登录后预热用） */
export const ADMIN_PAGE_MODULES: AdminPageModuleEntry[] = [
  {
    route: "/admin",
    label: "数据总览",
    load: () => import("@/components/pages/admin/AdminDashboardContent"),
  },
  {
    route: "/admin/users",
    label: "用户管理",
    load: () => import("@/components/pages/admin/AdminUsersContent"),
  },
  {
    route: "/admin/resources",
    label: "资源汇总",
    load: () => import("@/components/pages/admin/AdminResourcesContent"),
  },
  {
    route: "/admin/activity",
    label: "行为分析",
    load: () => import("@/components/pages/admin/AdminActivityContent"),
  },
];

export function preloadAllAdminPageModules(): Promise<void[]> {
  return Promise.all(ADMIN_PAGE_MODULES.map((m) => m.load().then(() => {})));
}
