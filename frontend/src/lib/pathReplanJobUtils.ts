import type { PathReplanJob } from "@/lib/api";

/** 轮询时仅在这些字段变化时才触发 store 更新，避免整树重渲染（elapsed 由前端本地计时） */
export function pathReplanJobSnapshotEqual(a: PathReplanJob, b: PathReplanJob): boolean {
  return (
    a.status === b.status &&
    a.progress === b.progress &&
    a.step_index === b.step_index &&
    a.step_label === b.step_label &&
    a.stage === b.stage &&
    (a.started_at || "") === (b.started_at || "") &&
    a.error === b.error &&
    a.result_summary === b.result_summary &&
    JSON.stringify(a.sub_phases) === JSON.stringify(b.sub_phases) &&
    JSON.stringify(a.result) === JSON.stringify(b.result)
  );
}
