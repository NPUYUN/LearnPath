export type RefreshSubPhase = {
  label: string;
  status: "pending" | "active" | "done";
};

export const REPLAN_PHASE_LABELS = [
  "读取学习者画像分析",
  "提取学习目标与薄弱点",
  "规划主阶段结构",
  "设计子步骤层级",
  "质检与优化路径",
  "写入新学习路径",
] as const;

export const CONFIRM_PHASE_LABELS = [
  "读取路径与资源库",
  "校验资源引用完整性",
  "清理无效路径关联",
  "写入确认标记",
] as const;

export function buildRegenPhaseLabels(
  stageTitles: string[],
  options?: { libraryName?: string },
): string[] {
  const prep = options?.libraryName
    ? `检索资料库「${options.libraryName}」`
    : "准备全网检索上下文";
  const stages = stageTitles.slice(0, 6).map((title, i) => {
    const short = title.length > 18 ? `${title.slice(0, 18)}…` : title;
    return `阶段 ${i + 1}：${short}`;
  });
  return [prep, ...stages, "分配资源到子步骤", "更新路径关联"];
}

export function mapPhasesToSubSteps(
  labels: readonly string[],
  activeIndex: number,
  allDone = false,
): RefreshSubPhase[] {
  const cap = allDone ? labels.length : Math.min(activeIndex, labels.length - 1);
  return labels.map((label, i) => ({
    label,
    status: allDone || i < cap ? "done" : i === cap ? "active" : "pending",
  }));
}

/** 将主步骤 + 子阶段索引映射为 0–99 的整体进度 */
export function calcRefreshProgress(
  stepIndex: number,
  phaseIndex: number,
  phaseCount: number,
  totalSteps = 6,
): number {
  if (phaseCount <= 0) {
    return Math.min(99, Math.round(((stepIndex + 0.6) / totalSteps) * 100));
  }
  const inStep = (Math.min(phaseIndex, phaseCount - 1) + 0.4) / phaseCount;
  return Math.min(99, Math.round(((stepIndex + inStep) / totalSteps) * 100));
}

export function formatElapsed(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h} 小时 ${m} 分 ${s.toString().padStart(2, "0")} 秒`;
  if (m > 0) return `${m} 分 ${s.toString().padStart(2, "0")} 秒`;
  return `${s} 秒`;
}

/** 按总预估时长在子阶段间推进（用于长耗时步骤） */
export function phaseIntervalMs(phaseCount: number, estimatedMs: number): number {
  if (phaseCount <= 1) return estimatedMs;
  return Math.max(4500, Math.round(estimatedMs / phaseCount));
}
