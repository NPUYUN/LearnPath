/**
 * 流式 Markdown：乐观补全未闭合语法，隐藏尾部残缺标记，便于实时渲染为排版效果。
 */

import { fixMarkdownHeadings } from "@/lib/markdownNormalize";

function isIncompleteBlockLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}(\s|$)/.test(t)) return true;
  if (/^\|/.test(t)) return true;
  if (/^>\s/.test(t)) return true;
  if (/^[-*+]\s*$/.test(t)) return true;
  if (/^\d+\.\s*$/.test(t)) return true;
  return false;
}

function closeSegmentInline(segment: string): string {
  let out = segment;

  // 加粗 ** …
  const boldCount = (out.match(/\*\*/g) || []).length;
  if (boldCount % 2 === 1) out += "**";

  // 删除线 ~~ …
  const strikeCount = (out.match(/~~/g) || []).length;
  if (strikeCount % 2 === 1) out += "~~";

  // 行内代码 ` …
  let backticks = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] === "`") backticks += 1;
  }
  if (backticks % 2 === 1) out += "`";

  // 斜体 _ …（忽略转义 \_）
  const underscores = out.replace(/\\_/g, "").split("_").length - 1;
  if (underscores % 2 === 1) out += "_";

  return out;
}

/** 按 ``` 围栏分段，仅对围栏外正文做行内补全 */
function closeUnclosedInlineFormatting(text: string): string {
  const parts = text.split("```");
  if (parts.length === 1) return closeSegmentInline(text);

  return parts
    .map((part, index) => (index % 2 === 0 ? closeSegmentInline(part) : part))
    .join("```");
}

function stripTrailingIncompleteSyntax(text: string): string {
  if (!text) return text;

  const lines = text.split("\n");
  const last = lines.length - 1;
  let line = lines[last];

  // 仅有 # 无标题文字时不展示裸井号
  line = line.replace(/^(#{1,6})\s*$/, "");

  // 尾部孤立的 **（无内容）去掉，避免闪一下星号
  line = line.replace(/\*\*\s*$/, "");

  // 未闭合链接 / 图片：只保留已输入的文字
  line = line.replace(/!\[([^\]\n]*)$/, "$1");
  line = line.replace(/\[([^\]\n]*)$/, "$1");
  line = line.replace(/\]\([^)\n]*$/, "]");

  // 尾部单独一个 *（非列表项「* 」）且非加粗的一部分时，暂隐藏
  if (!/^\s*[-*+]\s/.test(line) && !line.endsWith("**") && /\*(?!\*)$/.test(line.replace(/\*\*/g, ""))) {
    line = line.replace(/\*$/, "");
  }

  lines[last] = line;
  return lines.join("\n");
}

function closeUnclosedFences(text: string): string {
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    return `${text}\n\`\`\``;
  }
  return text;
}

/** 仅对当前行做轻量标题空格修复，避免整段结构重排导致跳动 */
function fixStreamingTailLine(line: string): string {
  return line.replace(/^(#{1,6})([^\s#\n])/, "$1 $2");
}

function finalizeStreamingSegment(segment: string): string {
  let text = closeUnclosedFences(segment);
  text = stripTrailingIncompleteSyntax(text);
  text = closeUnclosedInlineFormatting(text);
  return text;
}

/**
 * 将流式中的半成品 Markdown 转为可即时渲染的安全文本（不修改原始存储内容）。
 * 已完成行做完整标题修复；当前行仅做行内补全，减少中途布局跳动。
 */
export function prepareStreamingMarkdown(raw: string): string {
  if (!raw) return raw;

  const text = raw.replace(/\r\n/g, "\n");
  const lastNewline = text.lastIndexOf("\n");

  if (lastNewline === -1) {
    if (isIncompleteBlockLine(text)) return "";
    const line = fixStreamingTailLine(text);
    return finalizeStreamingSegment(line);
  }

  const stable = fixMarkdownHeadings(text.slice(0, lastNewline + 1));
  const tail = text.slice(lastNewline + 1);
  if (isIncompleteBlockLine(tail)) {
    return finalizeStreamingSegment(stable);
  }
  const tailFixed = fixStreamingTailLine(tail);
  return finalizeStreamingSegment(stable) + finalizeStreamingSegment(tailFixed);
}
