import { create } from "zustand";
import type { LearningPath, LearningResource, StudentProfile } from "@/lib/api";

export const DEMO_USER_ID = "demo";

interface AppState {
  // ── Auth ──────────────────────────────────────────────────────────────────
  isLoggedIn: boolean;
  userName: string;
  courseName: string;
  /** 真实登录后为后端返回的 UUID；演示模式固定为 "demo" */
  userId: string;
  /** true = 显示产品落地页；false = 显示登录表单 */
  showLanding: boolean;
  login: (userName: string, courseName: string, userId?: string) => void;
  logout: () => void;
  setShowLanding: (v: boolean) => void;
  // ── Core data ─────────────────────────────────────────────────────────────
  profile: StudentProfile | null;
  resources: LearningResource[];
  learningPath: LearningPath | null;
  resourceTitles: Record<string, string>;
  setProfile: (p: StudentProfile | null) => void;
  setResources: (r: LearningResource[]) => void;
  setLearningPath: (p: LearningPath | null) => void;
  setResourceTitles: (t: Record<string, string>) => void;
  addResources: (r: LearningResource[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // ── Auth defaults ─────────────────────────────────────────────────────────
  isLoggedIn: false,
  userName: "演示学生",
  courseName: "机器学习导论",
  userId: DEMO_USER_ID,
  showLanding: true,
  login: (userName, courseName, userId) =>
    set({ isLoggedIn: true, userName, courseName, userId: userId || DEMO_USER_ID }),
  logout: () =>
    set({
      isLoggedIn: false,
      showLanding: true,
      userId: DEMO_USER_ID,
      profile: null,
      resources: [],
      learningPath: null,
      resourceTitles: {},
    }),
  setShowLanding: (v) => set({ showLanding: v }),
  // ── Core data defaults ────────────────────────────────────────────────────
  profile: null,
  resources: [],
  learningPath: null,
  resourceTitles: {},
  setProfile: (profile) => set({ profile }),
  setResources: (resources) => set({ resources }),
  setLearningPath: (learningPath) => set({ learningPath }),
  setResourceTitles: (resourceTitles) => set({ resourceTitles }),
  addResources: (items) =>
    set((s) => ({
      resources: [
        ...s.resources,
        ...items.filter((i) => !s.resources.some((x) => x.id === i.id)),
      ],
    })),
}));

