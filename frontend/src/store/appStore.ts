import { create } from "zustand";
import type { LearningPath, LearningResource, StudentProfile } from "@/lib/api";

export const DEMO_USER_ID = "demo";

interface AppState {
  // ── Auth ──────────────────────────────────────────────────────────────────
  isLoggedIn: boolean;
  userName: string;
  courseName: string;
  login: (userName: string, courseName: string) => void;
  logout: () => void;
  // ── Core data ─────────────────────────────────────────────────────────────
  userId: string;
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
  login: (userName, courseName) => set({ isLoggedIn: true, userName, courseName }),
  logout: () =>
    set({ isLoggedIn: false, profile: null, resources: [], learningPath: null, resourceTitles: {} }),
  // ── Core data defaults ────────────────────────────────────────────────────
  userId: DEMO_USER_ID,
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
