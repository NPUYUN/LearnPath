import type { NavRoute } from "@/hooks/navRoutes";
import type { ComponentType } from "react";

export type PageModuleEntry = {
  route: NavRoute;
  label: string;
  load: () => Promise<{ default: ComponentType }>;
};

/** 主应用页面模块（登录后预热用） */
export const PAGE_MODULES: PageModuleEntry[] = [
  { route: "/chat", label: "智能对话", load: () => import("@/components/pages/ChatContent") },
  { route: "/profile", label: "学习画像", load: () => import("@/components/pages/ProfileContent") },
  { route: "/path", label: "学习路径", load: () => import("@/components/pages/PathContent") },
  { route: "/resources", label: "资源库", load: () => import("@/components/pages/ResourcesContent") },
  { route: "/evaluation", label: "学习评估", load: () => import("@/components/pages/EvaluationContent") },
  { route: "/account", label: "个人主页", load: () => import("@/components/pages/AccountContent") },
  { route: "/settings", label: "设置", load: () => import("@/components/pages/SettingsContent") },
];

export function preloadAllPageModules(): Promise<void[]> {
  return Promise.all(PAGE_MODULES.map((m) => m.load().then(() => {})));
}
