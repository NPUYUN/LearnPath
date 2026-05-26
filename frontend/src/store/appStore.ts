import { create } from "zustand";
import type {
  EvalStats,
  LearningPath,
  LearningResource,
  StudentProfile,
  UserAccount,
} from "@/lib/api";
import { clearAccessToken } from "@/store/authStore";

export const DEMO_USER_ID = "demo";

export function isDemoUser(userId: string) {
  return userId === DEMO_USER_ID;
}

/** 侧栏/页面展示用课程名 */
export function displayCourseName(courseName: string, userId: string) {
  if (courseName.trim()) return courseName;
  return isDemoUser(userId) ? "机器学习导论" : "未选择课程";
}

interface AppState {
  // ── Auth ──────────────────────────────────────────────────────────────────
  isLoggedIn: boolean;
  userName: string;
  courseName: string;
  userEmail: string;
  /** 真实登录后为后端返回的 UUID；演示模式固定为 "demo" */
  userId: string;
  /** true = 显示产品落地页；false = 显示登录表单 */
  showLanding: boolean;
  login: (userName: string, courseName: string, userId?: string, email?: string) => void;
  setUserMeta: (meta: { userName?: string; courseName?: string; userEmail?: string }) => void;
  logout: () => void;
  setShowLanding: (v: boolean) => void;
  // ── Core data ─────────────────────────────────────────────────────────────
  profile: StudentProfile | null;
  resources: LearningResource[];
  learningPath: LearningPath | null;
  resourceTitles: Record<string, string>;
  evalStats: EvalStats | null;
  account: UserAccount | null;
  insightsChat: { chatCount: number; userMsgCount: number } | null;
  pendingResourcePreviewId: string | null;
  setPendingResourcePreviewId: (id: string | null) => void;
  setProfile: (p: StudentProfile | null) => void;
  setEvalStats: (s: EvalStats | null) => void;
  setAccount: (a: UserAccount | null) => void;
  setInsightsChat: (c: { chatCount: number; userMsgCount: number } | null) => void;
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
  userEmail: "demo@learnpath.local",
  userId: DEMO_USER_ID,
  showLanding: true,
  login: (userName, courseName, userId, email) =>
    set({
      isLoggedIn: true,
      userName,
      courseName:
        userId && !isDemoUser(userId)
          ? courseName || ""
          : courseName || "机器学习导论",
      userId: userId || DEMO_USER_ID,
      userEmail:
        email ||
        (userId && userId !== DEMO_USER_ID ? "" : "demo@learnpath.local"),
      profile: null,
      resources: [],
      learningPath: null,
      resourceTitles: {},
      evalStats: null,
      account: null,
      insightsChat: null,
      pendingResourcePreviewId: null,
    }),
  setUserMeta: (meta) =>
    set((s) => ({
      userName: meta.userName ?? s.userName,
      courseName: meta.courseName ?? s.courseName,
      userEmail: meta.userEmail ?? s.userEmail,
    })),
  logout: () => {
    clearAccessToken();
    set({
      isLoggedIn: false,
      showLanding: true,
      userId: DEMO_USER_ID,
      profile: null,
      resources: [],
      learningPath: null,
      resourceTitles: {},
      evalStats: null,
      account: null,
      insightsChat: null,
      pendingResourcePreviewId: null,
    });
  },
  setShowLanding: (v) => set({ showLanding: v }),
  // ── Core data defaults ────────────────────────────────────────────────────
  profile: null,
  resources: [],
  learningPath: null,
  resourceTitles: {},
  evalStats: null,
  account: null,
  insightsChat: null,
  pendingResourcePreviewId: null,
  setPendingResourcePreviewId: (pendingResourcePreviewId) => set({ pendingResourcePreviewId }),
  setProfile: (profile) => set({ profile }),
  setEvalStats: (evalStats) => set({ evalStats }),
  setAccount: (account) => set({ account }),
  setInsightsChat: (insightsChat) => set({ insightsChat }),
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

