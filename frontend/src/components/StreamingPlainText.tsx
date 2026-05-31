"use client";

import { memo } from "react";

/** 流式阶段轻量展示：不做 Markdown 解析，优先保证输出顺畅 */
function StreamingPlainTextInner({ text }: { text: string }) {
  return (
    <div className="lp-stream-plain" aria-live="polite" aria-busy="true">
      {text || "　"}
      <span className="lp-stream-plain__cursor" aria-hidden />
    </div>
  );
}

export default memo(StreamingPlainTextInner);
