import type { MasteryLevel, MasteryRecord } from "@/lib/api";

const STORAGE_PREFIX = "learnpath-mastery";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

const INTERVAL_DAYS: Record<MasteryLevel, number> = {
  forgot: 1,
  fuzzy: 3,
  mastered: 7,
};

export function computeNextReview(
  level: MasteryLevel,
  previous?: MasteryRecord | null
): { intervalDays: number; streak: number; nextReviewAt: string } {
  const prevLevel = previous?.level;
  const prevStreak = previous?.streak ?? 0;
  let streak = 0;
  let intervalDays = INTERVAL_DAYS[level];

  if (level === "mastered") {
    streak = prevLevel === "mastered" ? prevStreak + 1 : 1;
    intervalDays = Math.min(30, 7 * Math.max(1, streak));
  } else if (level === "fuzzy") {
    streak = Math.max(0, prevStreak - 1);
    intervalDays = prevLevel === "mastered" ? 2 : INTERVAL_DAYS.fuzzy;
  }

  const next = new Date();
  next.setDate(next.getDate() + intervalDays);
  return { intervalDays, streak, nextReviewAt: next.toISOString() };
}

export function formatReviewLabel(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getMonth() + 1}月${dt.getDate()}日`;
}

export function isReviewDue(iso: string): boolean {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getTime() <= Date.now();
}

export function recordLookupKey(resourceId?: string, stepKey?: string) {
  if (resourceId) return resourceId;
  if (stepKey) return `step:${stepKey}`;
  return "";
}

export function loadLocalMasteryRecords(userId: string): Record<string, MasteryRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, MasteryRecord>;
  } catch {
    return {};
  }
}

export function saveLocalMasteryRecord(
  userId: string,
  key: string,
  record: MasteryRecord
): Record<string, MasteryRecord> {
  const all = loadLocalMasteryRecords(userId);
  all[key] = record;
  if (typeof window !== "undefined") {
    localStorage.setItem(storageKey(userId), JSON.stringify(all));
  }
  return all;
}

export function buildMasteryRecord(
  level: MasteryLevel,
  options: { resourceId?: string; stepKey?: string; title?: string },
  previous?: MasteryRecord | null
): MasteryRecord {
  const { intervalDays, streak, nextReviewAt } = computeNextReview(level, previous);
  return {
    level,
    next_review_at: nextReviewAt,
    interval_days: intervalDays,
    streak,
    step_key: options.stepKey || "",
    resource_id: options.resourceId || "",
    title: options.title || "",
    updated_at: new Date().toISOString(),
  };
}
