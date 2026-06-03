/** 流式 Markdown：分离「可渲染正文」与「未闭合块 / 当前行」 */

export type StreamMarkdownSlice = {
  /** 已闭合、可交给 Markdown 渲染的部分 */
  visible: string;
  /** 正在输入的当前行（未换行） */
  partialLine: string;
  /** 未闭合围栏块类型 */
  pendingBlock: "mermaid" | "svg" | "code" | "generic" | null;
};

function countFenceOpens(text: string): number {
  return (text.match(/```/g) || []).length;
}

/**
 * 仿 Kimi：已完成的行立即参与 Markdown 渲染；
 * 未闭合的 ``` 块（图/代码/SVG）不展示源码，由 UI 显示占位。
 */
export function sliceStreamMarkdown(raw: string, finished: boolean): StreamMarkdownSlice {
  const text = raw || "";

  if (finished) {
    return { visible: text, partialLine: "", pendingBlock: null };
  }

  const fenceCount = countFenceOpens(text);
  if (fenceCount % 2 === 1) {
    const openIdx = text.lastIndexOf("```");
    const visible = text.slice(0, openIdx).replace(/\n+$/, "");
    const afterOpen = text.slice(openIdx + 3);
    const lang = afterOpen.match(/^(\w*)/)?.[1]?.toLowerCase() || "";
    let pendingBlock: StreamMarkdownSlice["pendingBlock"] = "generic";
    if (lang === "mermaid") pendingBlock = "mermaid";
    else if (lang === "svg") pendingBlock = "svg";
    else if (lang) pendingBlock = "code";
    return { visible, partialLine: "", pendingBlock };
  }

  const lastNl = text.lastIndexOf("\n");
  if (lastNl === -1) {
    // 表格/标题行未换行前不展示原始 Markdown，避免 "| a | b |" 闪现在正文中
    if (/^\s*(#{1,6}\s|\||>\s)/.test(text)) {
      return { visible: "", partialLine: "", pendingBlock: null };
    }
    return { visible: "", partialLine: text, pendingBlock: null };
  }

  return {
    visible: text.slice(0, lastNl + 1),
    partialLine: text.slice(lastNl + 1),
    pendingBlock: null,
  };
}
