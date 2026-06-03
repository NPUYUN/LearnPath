"use client";

import { memo, useMemo } from "react";
import MarkdownPreview from "@/components/MarkdownPreview";
import { prepareStreamingMarkdown } from "@/lib/streamingMarkdown";
import { sliceStreamMarkdown } from "@/lib/streamMarkdownSlice";

type StreamingMarkdownProps = {
  text: string;
  finished?: boolean;
};

const BLOCK_LABEL: Record<string, string> = {
  mermaid: "关系图解",
  svg: "示意图",
  code: "代码",
  generic: "内容块",
};

function PendingBlockPlaceholder({ kind }: { kind: string }) {
  return (
    <div className="lp-stream-block-pending" aria-busy="true">
      <span className="lp-stream-block-pending__dot" />
      <span className="lp-stream-block-pending__dot" />
      <span className="lp-stream-block-pending__dot" />
      <span className="lp-stream-block-pending__label">正在生成{BLOCK_LABEL[kind] || "内容"}…</span>
    </div>
  );
}

function StreamingMarkdownInner({ text, finished = false }: StreamingMarkdownProps) {
  const slice = useMemo(() => sliceStreamMarkdown(text, finished), [text, finished]);

  const renderText = useMemo(() => {
    if (finished) return text;
    if (slice.pendingBlock) return slice.visible;
    return prepareStreamingMarkdown(text);
  }, [text, finished, slice.pendingBlock, slice.visible]);

  const hasContent = renderText.trim().length > 0;

  return (
    <div className="lp-stream-markdown" aria-live="polite" aria-busy={!finished}>
      {hasContent && (
        <MarkdownPreview content={renderText} variant="chat" streaming={!finished} />
      )}
      {!finished && slice.pendingBlock && (
        <PendingBlockPlaceholder kind={slice.pendingBlock} />
      )}
      {!hasContent && !slice.pendingBlock && (
        <span className="lp-stream-markdown__empty">
          <span className="lp-stream-plain__cursor" aria-hidden />
        </span>
      )}
    </div>
  );
}

export default memo(StreamingMarkdownInner);
