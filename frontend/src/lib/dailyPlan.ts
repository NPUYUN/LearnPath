export type DailyTask = {
  id: string;
  text: string;
  done: boolean;
};

export type DailyPlan = {
  date: string;
  tasks: DailyTask[];
};

export function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function normalizeDailyPlan(plan: DailyPlan | undefined | null): DailyPlan {
  const today = localDateStr();
  if (!plan || plan.date !== today) {
    return { date: today, tasks: [] };
  }
  return {
    date: today,
    tasks: Array.isArray(plan.tasks) ? plan.tasks : [],
  };
}

export function newTaskId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
