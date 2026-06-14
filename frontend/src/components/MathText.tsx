"use client";

import { useMemo } from "react";
import katex from "katex";
import { normalizeLatexDelimiters } from "@/lib/markdownNormalize";

function renderSegment(text: string, display: boolean): string {
  try {
    return katex.renderToString(text, {
      throwOnError: false,
      displayMode: display,
      strict: "ignore",
    });
  } catch {
    return text;
  }
}

/** 将含 $...$ / $$...$$ 的纯文本渲染为 KaTeX（用于测验题干等） */
export default function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const normalized = normalizeLatexDelimiters(text);
    const parts: string[] = [];
    let i = 0;
    while (i < normalized.length) {
      if (normalized.startsWith("$$", i)) {
        const end = normalized.indexOf("$$", i + 2);
        if (end > i) {
          parts.push(
            `<span class="lp-math-block">${renderSegment(normalized.slice(i + 2, end), true)}</span>`,
          );
          i = end + 2;
          continue;
        }
      }
      if (normalized[i] === "$") {
        const end = normalized.indexOf("$", i + 1);
        if (end > i) {
          parts.push(renderSegment(normalized.slice(i + 1, end), false));
          i = end + 1;
          continue;
        }
      }
      const next = normalized.slice(i).search(/\$\$|\$/);
      const until = next < 0 ? normalized.length : i + next;
      parts.push(
        normalized
          .slice(i, until)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;"),
      );
      i = until;
    }
    return parts.join("");
  }, [text]);

  return (
    <span
      className={className ? `lp-math-text ${className}` : "lp-math-text"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
