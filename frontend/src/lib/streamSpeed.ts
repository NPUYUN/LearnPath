import type { StreamSpeed } from "@/store/settingsStore";

export type StreamSpeedConfig = {
  /** 流式纯文本刷新间隔（毫秒）；0 表示不逐段展示 */
  flushMs: number;
  /** 后端 SSE 分段大小 */
  chunkSize: number;
  /** 流式过程中是否展示纯文本（否则仅显示思考中，结束后一次性渲染） */
  plainStream: boolean;
};

export function getStreamSpeedConfig(
  speed: StreamSpeed,
  deepThinking: boolean
): StreamSpeedConfig {
  if (speed === "instant") {
    // 立刻：仍展示流式文字，但每 token 即时刷新、不做节流
    return { flushMs: 0, chunkSize: deepThinking ? 4 : 48, plainStream: true };
  }
  if (deepThinking) {
    return {
      flushMs: speed === "slow" ? 120 : 48,
      chunkSize: 1,
      plainStream: true,
    };
  }
  if (speed === "slow") {
    return { flushMs: 64, chunkSize: 4, plainStream: true };
  }
  // 快速模式：更大 SSE 分段 + 更短 UI 节流，缩短「思考中」等待体感
  return { flushMs: 8, chunkSize: 16, plainStream: true };
}

export const STREAM_SPEED_OPTIONS: { value: StreamSpeed; label: string }[] = [
  { value: "slow", label: "慢" },
  { value: "fast", label: "快" },
  { value: "instant", label: "立刻" },
];
