import { create } from "zustand";
import type {
  ClassroomGenerationJob,
  ClassroomSession,
  EvalStats,
  LearningPath,
  LearningResource,
  PathReplanJob,
  ResourceGenerationJob,
  StudentProfile,
  UserAccount,
} from "@/lib/api";
import { clearFloatPanelState, clearPersistedActiveClassroom } from "@/lib/classroomActive";
import { clearPathReplanFloatState, clearPersistedActivePathReplan } from "@/lib/pathReplanActive";
import { clearAccessToken, clearAuthSession, saveAuthSession } from "@/store/authStore";

export const DEMO_USER_ID = "demo";
export const ADMIN_USER_ID = "admin";

export type UserRole = "user" | "admin";
export type ClassroomJobPanelMode = "open" | "minimized" | "hidden";
export type PathReplanPanelMode = "fullscreen" | "open" | "minimized" | "hidden";
export type ResourceRegenPanelMode = "open" | "minimized" | "hidden";

export type ResourceRegenerationTask = {
  id: string;
  resourceId: string;
  title: string;
  status: "running" | "done" | "error";
  progress: number;
  stage: string;
  error?: string;
  updatedResource?: LearningResource;
};

export type ClassroomSessionSeed = {
  stepKey: string;
  title: string;
  objective: string;
  resourceIds: string[];
  estimatedMinutes: number;
  courseName: string;
  depthLevel?: string;
  source: "path" | "manual";
};

export function isDemoUser(userId: string) {
  return userId === DEMO_USER_ID;
}

export function isAdminUser(userId: string, role?: UserRole) {
  return role === "admin" || userId === ADMIN_USER_ID;
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
  role: UserRole;
  /** true = 显示产品落地页；false = 显示登录表单 */
  showLanding: boolean;
  login: (
    userName: string,
    courseName: string,
    userId?: string,
    email?: string,
    role?: UserRole
  ) => void;
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
  pendingClassroomSession: ClassroomSessionSeed | null;
  activeClassroomSeed: ClassroomSessionSeed | null;
  activeClassroomJob: ClassroomGenerationJob | null;
  activeClassroomResult: ClassroomSession | null;
  classroomJobPanelMode: ClassroomJobPanelMode;
  pathReplanJob: PathReplanJob | null;
  pathReplanPanelMode: PathReplanPanelMode;
  pathReplanFading: boolean;
  resourceRegenTask: ResourceRegenerationTask | null;
  resourceRegenPanelMode: ResourceRegenPanelMode;
  activeResourceGenerationJob: ResourceGenerationJob | null;
  resourceGenerationPanelMode: ResourceRegenPanelMode;
  pendingResourcePreviewId: string | null;
  setPendingClassroomSession: (session: ClassroomSessionSeed | null) => void;
  setActiveClassroomSeed: (session: ClassroomSessionSeed | null) => void;
  setActiveClassroomJob: (job: ClassroomGenerationJob | null) => void;
  setActiveClassroomResult: (session: ClassroomSession | null) => void;
  setClassroomJobPanelMode: (mode: ClassroomJobPanelMode) => void;
  clearActiveClassroom: () => void;
  setPathReplanJob: (job: PathReplanJob | null) => void;
  setPathReplanPanelMode: (mode: PathReplanPanelMode) => void;
  setPathReplanFading: (fading: boolean) => void;
  clearPathReplan: () => void;
  setResourceRegenTask: (task: ResourceRegenerationTask | null) => void;
  patchResourceRegenTask: (patch: Partial<ResourceRegenerationTask>) => void;
  setResourceRegenPanelMode: (mode: ResourceRegenPanelMode) => void;
  clearResourceRegenTask: () => void;
  setActiveResourceGenerationJob: (job: ResourceGenerationJob | null) => void;
  setResourceGenerationPanelMode: (mode: ResourceRegenPanelMode) => void;
  clearResourceGenerationJob: () => void;
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
  role: "user" as UserRole,
  showLanding: true,
  login: (userName, courseName, userId, email, role = "user") => {
    const resolvedUserId = userId || DEMO_USER_ID;
    const resolvedCourseName =
      role === "admin"
        ? "平台管理"
        : userId && !isDemoUser(userId)
          ? courseName || ""
          : courseName || "机器学习导论";
    const resolvedEmail =
      email ||
      (role === "admin"
        ? "admin@learnpath.local"
        : userId && userId !== DEMO_USER_ID
          ? ""
          : "demo@learnpath.local");
    saveAuthSession({
      userId: resolvedUserId,
      userName,
      courseName: resolvedCourseName,
      userEmail: resolvedEmail,
      role,
    });
    set({
      isLoggedIn: true,
      userName,
      courseName: resolvedCourseName,
      userId: resolvedUserId,
      role,
      userEmail: resolvedEmail,
      showLanding: false,
      profile: null,
      resources: [],
      learningPath: null,
      resourceTitles: {},
      evalStats: null,
      account: null,
      insightsChat: null,
      pendingClassroomSession: null,
      activeClassroomSeed: null,
      activeClassroomJob: null,
      activeClassroomResult: null,
      classroomJobPanelMode: "open",
      pathReplanJob: null,
      pathReplanPanelMode: "hidden",
      pathReplanFading: false,
      resourceRegenTask: null,
      resourceRegenPanelMode: "hidden",
      activeResourceGenerationJob: null,
      resourceGenerationPanelMode: "hidden",
      pendingResourcePreviewId: null,
    });
  },
  setUserMeta: (meta) =>
    set((s) => ({
      userName: meta.userName ?? s.userName,
      courseName: meta.courseName ?? s.courseName,
      userEmail: meta.userEmail ?? s.userEmail,
    })),
  logout: () => {
    clearAccessToken();
    clearAuthSession();
    set({
      isLoggedIn: false,
      showLanding: true,
      userId: DEMO_USER_ID,
      role: "user",
      profile: null,
      resources: [],
      learningPath: null,
      resourceTitles: {},
      evalStats: null,
      account: null,
      insightsChat: null,
      pendingClassroomSession: null,
      activeClassroomSeed: null,
      activeClassroomJob: null,
      activeClassroomResult: null,
      classroomJobPanelMode: "open",
      pathReplanJob: null,
      pathReplanPanelMode: "hidden",
      pathReplanFading: false,
      resourceRegenTask: null,
      resourceRegenPanelMode: "hidden",
      activeResourceGenerationJob: null,
      resourceGenerationPanelMode: "hidden",
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
  pendingClassroomSession: null,
  activeClassroomSeed: null,
  activeClassroomJob: null,
  activeClassroomResult: null,
  classroomJobPanelMode: "open",
  pathReplanJob: null,
  pathReplanPanelMode: "hidden",
  pathReplanFading: false,
  resourceRegenTask: null,
  resourceRegenPanelMode: "hidden",
  activeResourceGenerationJob: null,
  resourceGenerationPanelMode: "hidden",
  pendingResourcePreviewId: null,
  setPendingClassroomSession: (pendingClassroomSession) => set({ pendingClassroomSession }),
  setActiveClassroomSeed: (activeClassroomSeed) => set({ activeClassroomSeed }),
  setActiveClassroomJob: (activeClassroomJob) => set({ activeClassroomJob }),
  setActiveClassroomResult: (activeClassroomResult) => set({ activeClassroomResult }),
  setClassroomJobPanelMode: (classroomJobPanelMode) => set({ classroomJobPanelMode }),
  clearActiveClassroom: () => {
    const jobId = useAppStore.getState().activeClassroomJob?.id;
    if (jobId) clearFloatPanelState(jobId);
    clearPersistedActiveClassroom();
    set({
      activeClassroomJob: null,
      activeClassroomResult: null,
      activeClassroomSeed: null,
      classroomJobPanelMode: "hidden",
    });
  },
  setPathReplanJob: (pathReplanJob) =>
    set((s) => (s.pathReplanJob === pathReplanJob ? s : { pathReplanJob })),
  setPathReplanPanelMode: (pathReplanPanelMode) =>
    set((s) => (s.pathReplanPanelMode === pathReplanPanelMode ? s : { pathReplanPanelMode })),
  setPathReplanFading: (pathReplanFading) =>
    set((s) => (s.pathReplanFading === pathReplanFading ? s : { pathReplanFading })),
  clearPathReplan: () => {
    const jobId = useAppStore.getState().pathReplanJob?.id;
    if (jobId) clearPathReplanFloatState(jobId);
    clearPersistedActivePathReplan();
    set({
      pathReplanJob: null,
      pathReplanPanelMode: "hidden",
      pathReplanFading: false,
    });
  },
  setResourceRegenTask: (resourceRegenTask) => set({ resourceRegenTask }),
  patchResourceRegenTask: (patch) =>
    set((s) =>
      s.resourceRegenTask
        ? { resourceRegenTask: { ...s.resourceRegenTask, ...patch } }
        : s
    ),
  setResourceRegenPanelMode: (resourceRegenPanelMode) => set({ resourceRegenPanelMode }),
  clearResourceRegenTask: () =>
    set({ resourceRegenTask: null, resourceRegenPanelMode: "hidden" }),
  setActiveResourceGenerationJob: (activeResourceGenerationJob) => set({ activeResourceGenerationJob }),
  setResourceGenerationPanelMode: (resourceGenerationPanelMode) => set({ resourceGenerationPanelMode }),
  clearResourceGenerationJob: () =>
    set({ activeResourceGenerationJob: null, resourceGenerationPanelMode: "hidden" }),
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
