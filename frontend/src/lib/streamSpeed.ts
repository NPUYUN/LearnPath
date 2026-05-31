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
    return { flushMs: 0, chunkSize: deepThinking ? 4 : 32, plainStream: false };
  }
  if (deepThinking) {
    return {
      flushMs: speed === "slow" ? 120 : 48,
      chunkSize: 1,
      plainStream: true,
    };
  }
  if (speed === "slow") {
    return { flushMs: 120, chunkSize: 2, plainStream: true };
  }
  return { flushMs: 32, chunkSize: 8, plainStream: true };
}

export const STREAM_SPEED_OPTIONS: { value: StreamSpeed; label: string }[] = [
  { value: "slow", label: "慢" },
  { value: "fast", label: "快" },
  { value: "instant", label: "立刻" },
];
