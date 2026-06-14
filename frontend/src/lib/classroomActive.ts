import type { ClassroomGenerationJob, ClassroomSession } from "@/lib/api";
import type { ClassroomSessionSeed } from "@/store/appStore";

export const CLASSROOM_STORAGE_KEY = "learnpath-active-classroom";
const LEGACY_JOB_STORAGE_KEY = "learnpath-active-classroom-job";
const FLOAT_DISMISSED_KEY = "learnpath-classroom-float-dismissed";
const FLOAT_REMINDED_KEY = "learnpath-classroom-float-reminded";

function readJobIdSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  const raw = sessionStorage.getItem(key);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    sessionStorage.removeItem(key);
    return new Set();
  }
}

function writeJobIdSet(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(key, JSON.stringify([...ids]));
}

export function isFloatDismissed(jobId: string): boolean {
  return readJobIdSet(FLOAT_DISMISSED_KEY).has(jobId);
}

export function dismissFloatPanel(jobId: string): void {
  const ids = readJobIdSet(FLOAT_DISMISSED_KEY);
  ids.add(jobId);
  writeJobIdSet(FLOAT_DISMISSED_KEY, ids);
}

export function isFloatDoneReminded(jobId: string): boolean {
  return readJobIdSet(FLOAT_REMINDED_KEY).has(jobId);
}

export function markFloatDoneReminded(jobId: string): void {
  const ids = readJobIdSet(FLOAT_REMINDED_KEY);
  ids.add(jobId);
  writeJobIdSet(FLOAT_REMINDED_KEY, ids);
}

export function clearFloatPanelState(jobId: string): void {
  const dismissed = readJobIdSet(FLOAT_DISMISSED_KEY);
  const reminded = readJobIdSet(FLOAT_REMINDED_KEY);
  dismissed.delete(jobId);
  reminded.delete(jobId);
  writeJobIdSet(FLOAT_DISMISSED_KEY, dismissed);
  writeJobIdSet(FLOAT_REMINDED_KEY, reminded);
}

export type PersistedActiveClassroom = {
  jobId: string;
  seed: ClassroomSessionSeed;
};

export type ActiveClassroomSnapshot = {
  exists: boolean;
  stepKey: string | null;
  title: string;
  phase: "generating" | "ready" | "error" | null;
};

export function persistActiveClassroom(data: PersistedActiveClassroom): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CLASSROOM_STORAGE_KEY, JSON.stringify(data));
  sessionStorage.removeItem(LEGACY_JOB_STORAGE_KEY);
}

export function loadPersistedActiveClassroom(): PersistedActiveClassroom | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(CLASSROOM_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PersistedActiveClassroom;
      if (parsed?.jobId && parsed?.seed?.stepKey) return parsed;
    } catch {
      sessionStorage.removeItem(CLASSROOM_STORAGE_KEY);
    }
  }
  const legacyJobId = sessionStorage.getItem(LEGACY_JOB_STORAGE_KEY);
  if (!legacyJobId) return null;
  return {
    jobId: legacyJobId,
    seed: {
      stepKey: "legacy-unknown",
      title: "课堂内容",
      objective: "",
      resourceIds: [],
      estimatedMinutes: 20,
      courseName: "",
      depthLevel: "标准掌握",
      source: "manual",
    },
  };
}

export function clearPersistedActiveClassroom(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(CLASSROOM_STORAGE_KEY);
  sessionStorage.removeItem(LEGACY_JOB_STORAGE_KEY);
}

export function getActiveClassroomSnapshot(input: {
  job: ClassroomGenerationJob | null;
  result: ClassroomSession | null;
  seed: ClassroomSessionSeed | null;
}): ActiveClassroomSnapshot {
  const { job, result, seed } = input;
  const title = result?.title || job?.title || seed?.title || "当前课堂";
  const stepKey = seed?.stepKey ?? null;

  if (result) {
    return { exists: true, stepKey, title, phase: "ready" };
  }
  if (job) {
    if (job.status === "error") return { exists: true, stepKey, title, phase: "error" };
    if (job.status === "done") return { exists: true, stepKey, title, phase: "ready" };
    return { exists: true, stepKey, title, phase: "generating" };
  }
  return { exists: false, stepKey: null, title: "", phase: null };
}

export function classroomResultMatchesSession(
  result: ClassroomSession | null,
  seed: ClassroomSessionSeed | null,
  session: ClassroomSessionSeed,
): boolean {
  if (!result || !seed) return false;
  const seedDepth = seed.depthLevel || "标准掌握";
  const sessionDepth = session.depthLevel || "标准掌握";
  return seed.stepKey === session.stepKey && seedDepth === sessionDepth;
}

export function activeClassroomPhaseLabel(phase: ActiveClassroomSnapshot["phase"]): string {
  if (phase === "generating") return "（生成中）";
  if (phase === "error") return "（生成失败）";
  return "";
}

export type StepClassroomButtonPhase = "idle" | "generating" | "ready" | "error";

type ClassroomLibraryLike = {
  step_key: string;
  status: string;
  has_result: boolean;
};

export function getStepClassroomButtonPhase(
  stepKey: string,
  seed: ClassroomSessionSeed | null,
  job: ClassroomGenerationJob | null,
  result: ClassroomSession | null,
  libraryItems: ClassroomLibraryLike[] = [],
): StepClassroomButtonPhase {
  if (seed && seed.stepKey === stepKey) {
    if (result) return "ready";
    if (job?.status === "error") return "error";
    if (job?.status === "done") return "ready";
    if (job) return "generating";
  }

  const saved = libraryItems.find((item) => item.step_key === stepKey);
  if (!saved) return "idle";
  if (saved.status === "done" && saved.has_result) return "ready";
  if (saved.status === "error") return "error";
  if (saved.status === "queued" || saved.status === "running") return "generating";
  return "idle";
}
