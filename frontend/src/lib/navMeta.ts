import type { AppRoute } from "@/hooks/navRoutes";

export type NavMeta = {
  label: string;
  shortLabel: string;
  accent: string;
  glow: string;
  step?: number;
  group: "primary" | "secondary";
};

export const NAV_META: Record<AppRoute, NavMeta> = {
  "/chat": {
    label: "智能对话",
    shortLabel: "对话",
    accent: "#1677ff",
    glow: "rgba(22, 119, 255, 0.35)",
    step: 1,
    group: "primary",
  },
  "/profile": {
    label: "学习画像",
    shortLabel: "画像",
    accent: "#722ed1",
    glow: "rgba(114, 46, 209, 0.35)",
    step: 2,
    group: "primary",
  },
  "/path": {
    label: "学习路径",
    shortLabel: "路径",
    accent: "#13c2c2",
    glow: "rgba(19, 194, 194, 0.35)",
    step: 3,
    group: "primary",
  },
  "/resources": {
    label: "资源库",
    shortLabel: "资源",
    accent: "#fa8c16",
    glow: "rgba(250, 140, 22, 0.35)",
    step: 4,
    group: "primary",
  },
  "/evaluation": {
    label: "学习评估",
    shortLabel: "评估",
    accent: "#52c41a",
    glow: "rgba(82, 196, 26, 0.35)",
    step: 5,
    group: "primary",
  },
  "/account": {
    label: "个人主页",
    shortLabel: "主页",
    accent: "#eb2f96",
    glow: "rgba(235, 47, 150, 0.3)",
    group: "secondary",
  },
  "/insights": {
    label: "学习成就馆",
    shortLabel: "成就",
    accent: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.35)",
    group: "secondary",
  },
  "/classroom": {
    label: "AI 课堂",
    shortLabel: "课堂",
    accent: "#10b981",
    glow: "rgba(16, 185, 129, 0.35)",
    group: "secondary",
  },
  "/settings": {
    label: "设置",
    shortLabel: "设置",
    accent: "#64748b",
    glow: "rgba(100, 116, 139, 0.25)",
    group: "secondary",
  },
};

export function pathProgress(steps: { status: string; substeps?: { status: string; substeps?: unknown[] }[] }[] | undefined): number {
  if (!steps?.length) return 0;
  const flat: { status: string }[] = [];
  const walk = (nodes: typeof steps) => {
    for (const node of nodes) {
      flat.push(node);
      if (node.substeps?.length) walk(node.substeps as typeof steps);
    }
  };
  walk(steps);
  const done = flat.filter((s) => s.status === "done" || s.status === "completed").length;
  return Math.round((done / flat.length) * 100);
}
