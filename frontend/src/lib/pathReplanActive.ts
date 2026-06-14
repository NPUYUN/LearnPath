const STORAGE_KEY = "learnpath-active-path-replan";
const FLOAT_DISMISSED_KEY = "learnpath-path-replan-float-dismissed";
const FLOAT_REMINDED_KEY = "learnpath-path-replan-float-reminded";

export type PersistedPathReplan = {
  jobId: string;
  userId: string;
  libraryId?: string | null;
};

function readJobIdSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  const raw = localStorage.getItem(key);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    localStorage.removeItem(key);
    return new Set();
  }
}

function writeJobIdSet(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify([...ids]));
}

export function persistActivePathReplan(data: PersistedPathReplan): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadPersistedActivePathReplan(): PersistedPathReplan | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedPathReplan;
    if (parsed?.jobId && parsed?.userId) return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

export function clearPersistedActivePathReplan(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function isPathReplanFloatDismissed(jobId: string): boolean {
  return readJobIdSet(FLOAT_DISMISSED_KEY).has(jobId);
}

export function dismissPathReplanFloat(jobId: string): void {
  const ids = readJobIdSet(FLOAT_DISMISSED_KEY);
  ids.add(jobId);
  writeJobIdSet(FLOAT_DISMISSED_KEY, ids);
}

export function isPathReplanDoneReminded(jobId: string): boolean {
  return readJobIdSet(FLOAT_REMINDED_KEY).has(jobId);
}

export function markPathReplanDoneReminded(jobId: string): void {
  const ids = readJobIdSet(FLOAT_REMINDED_KEY);
  ids.add(jobId);
  writeJobIdSet(FLOAT_REMINDED_KEY, ids);
}

export function clearPathReplanFloatState(jobId: string): void {
  const dismissed = readJobIdSet(FLOAT_DISMISSED_KEY);
  const reminded = readJobIdSet(FLOAT_REMINDED_KEY);
  dismissed.delete(jobId);
  reminded.delete(jobId);
  writeJobIdSet(FLOAT_DISMISSED_KEY, dismissed);
  writeJobIdSet(FLOAT_REMINDED_KEY, reminded);
}
