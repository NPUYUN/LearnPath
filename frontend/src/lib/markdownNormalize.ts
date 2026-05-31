/**
 * 规范化 LLM 输出的 Markdown，修复常见格式问题以便正确渲染。
 */

/** 统一箭头为 `-->`（含无空格、单箭头写法） */
function normalizeMermaidArrows(input: string): string {
  return input
    .replace(/-->/g, "\0ARROW\0")
    .replace(/->/g, " --> ")
    .replace(/\0ARROW\0/g, " --> ")
    .replace(/\s+-->\s+/g, " --> ");
}

/** 中文或未加引号的节点标签自动加双引号 */
function quoteMermaidNodeLabels(input: string): string {
  let code = input.replace(/(\w+)\['([^']*)'\]/g, '$1["$2"]');
  code = code.replace(/(\w+)\[([^\]"'\n]+)\]/g, (match, id: string, label: string) => {
    const L = label.trim();
    if (/[\u4e00-\u9fff]/.test(L) && !/^["']/.test(L)) {
      return `${id}["${L.replace(/"/g, "'")}"]`;
    }
    return match;
  });
  code = code.replace(/(\w+)\(([^)"'\n]+)\)/g, (match, id: string, label: string) => {
    const L = label.trim();
    if (/[\u4e00-\u9fff]/.test(L) && !/^["']/.test(L)) {
      return `${id}("${L.replace(/"/g, "'")}")`;
    }
    return match;
  });
  return code;
}

/** 解析失败时提取边并重建成最简合法 flowchart */
export function buildFallbackFlowchart(raw: string): string {
  const code = raw.trim();
  const edges: string[] = [];
  const re = /([A-Za-z]\w*)\s*(?:\[[^\]]+\]|\([^)]+\)|\{[^}]+\})?\s*-->\s*([A-Za-z]\w*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    edges.push(`  ${m[1]} --> ${m[2]}`);
  }
  if (edges.length) return `flowchart LR\n${edges.join("\n")}`;
  return "flowchart TD\n  A[主题] --> B[说明]";
}

/** 修复粘连、缺换行的 Mermaid 源码，保证节点与边标签可渲染 */
export function repairMermaidCode(raw: string): string {
  let code = raw
    .trim()
    .replace(/^```mermaid\s*/i, "")
    .replace(/```\s*$/g, "")
    .trim();

  if (!code) return "flowchart TD\n  A[主题] --> B[说明]";

  // mindmap / sequenceDiagram 仅做轻量清理
  if (/^(mindmap|sequenceDiagram|classDiagram|stateDiagram)/i.test(code)) {
    return code;
  }

  code = normalizeMermaidArrows(code);
  code = quoteMermaidNodeLabels(code);

  // graph TD → flowchart TD（Mermaid 11 推荐）
  code = code.replace(/^graph\s+(TD|TB|LR|RL|BT)/i, (_, dir) => `flowchart ${dir.toUpperCase()}`);
  code = code.replace(/^flowchart\s+(td|tb|lr|rl|bt)\b/i, (_, dir) => `flowchart ${dir.toUpperCase()}`);
  if (!/^flowchart/i.test(code)) {
    if (/^(TD|TB|LR|RL|BT)\s/i.test(code)) {
      code = `flowchart ${code}`;
    }
  }

  // 分号分隔的单行图 → 多行
  if (code.includes(";")) {
    const head = code.match(/^(flowchart\s+(?:TD|TB|LR|RL|BT))/i)?.[0] || "flowchart TD";
    const body = code.replace(/^flowchart\s+(?:TD|TB|LR|RL|BT)\s*;?\s*/i, "");
    const lines = body
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    code = [head, ...lines].join("\n");
  }

  // flowchart 头与首条语句粘在同一行
  code = code.replace(
    /^(flowchart\s+(?:TD|TB|LR|RL|BT))\s+(.+)$/im,
    (_, header, rest) => `${header}\n${rest}`,
  );

  // 同一行多条边："] B -->" / ") B -->" 处断行
  code = code.replace(/([\]\)])\s+([A-Za-z][\w]*\s*-->)/g, "$1\n  $2");

  // B[Kotlin]A --> 粘连节点
  code = code.replace(/\]([A-Z])(?=\s*--)/g, "]\n  $1 ");
  code = code.replace(/\]([A-Z])(?=\[)/g, "]\n  $1 ");
  code = code.replace(/\bBB\b/g, "B");

  // 每条边独立一行并缩进
  const lines = code.split("\n");
  const out: string[] = [];
  for (let line of lines) {
    let t = line.trim();
    if (!t) continue;

    if (/^flowchart/i.test(t)) {
      const glued = t.match(/^(flowchart\s+(?:TD|TB|LR|RL|BT))\s+(.+)$/i);
      if (glued) {
        out.push(glued[1]);
        t = glued[2];
      } else {
        out.push(t);
        continue;
      }
    }

    // 一行内仍有多个 "X -->" 语句时拆分
    const chunks = t.split(/\s+(?=[A-Za-z][\w]*\s*-->)/).map((s) => s.trim()).filter(Boolean);
    for (const chunk of chunks) {
      if (chunk.includes("-->") || /^[A-Za-z][\w]*/.test(chunk)) {
        out.push(`  ${chunk}`);
      } else {
        out.push(chunk);
      }
    }
  }

  code = out.join("\n") || "flowchart TD\n  A[内容] --> B[说明]";
  code = quoteMermaidNodeLabels(code);

  // 边标签含中文时用引号包裹，避免解析丢失
  code = code.replace(/-->\|([^|\n]+)\|/g, (_, label: string) => {
    const L = label.trim();
    if (/[\u4e00-\u9fff]/.test(L) && !/^["']/.test(L)) {
      return `-->|"${L.replace(/"/g, "'")}"|`;
    }
    return `-->|${L}|`;
  });

  return code;
}

/** 流式输出未结束时跳过 Mermaid 渲染，避免半成品触发解析错误 */
export function isMermaidLikelyComplete(code: string): boolean {
  const c = code.trim();
  if (!c) return false;
  if (/^(flowchart|graph)\b/i.test(c) && !/-->/.test(c)) return false;
  if ((c.match(/"/g) || []).length % 2 !== 0) return false;
  let depth = 0;
  for (const ch of c) {
    if (ch === "[") depth += 1;
    if (ch === "]") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** 移除 mermaid.render 失败时可能挂到 body 的临时节点 */
export function purgeMermaidOrphans() {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll(
      'body > div[id^="dmermaid"], body > div[id^="d3mermaid"], body > div[id^="mermaid-"]',
    )
    .forEach((el) => el.remove());
}

const HEADING_SECTION_SUFFIXES = [
  "定义", "概念", "类型", "应用", "目标", "简介", "概述", "总结", "图解", "要点", "示例", "方向",
];

/** 修复 LLM 常见 Markdown 结构问题：##标题粘连、缺空格、标题与正文同行 */
export function fixMarkdownHeadings(text: string): string {
  let out = text.replace(/\r\n/g, "\n");

  // 正文后直接接 ##标题（无换行）；行首的 ## 不在此处理
  out = out.replace(/(?<=\S)(#{2,6})([^\s#\n])/g, "\n\n$1 $2");

  // 行首 # 后缺空格：##机器学习 → ## 机器学习
  out = out.replace(/(^|\n)(#{1,6})([^\s#\n])/g, "$1$2 $3");

  // 标题行内紧跟编号列表：## 核心概念1. 数据 → 拆行
  out = out.replace(/^(#{1,6}\s+[^\n\d]+?)(\d+\.\s)/gm, "$1\n\n$2");

  // 标题与正文粘在同一行：## 机器学习定义机器学习是… → 拆行
  out = out.replace(/^#{1,6}\s+[^\n]+$/gm, (line) => {
    const hm = line.match(/^(#{1,6}\s+)(.+)$/);
    if (!hm) return line;
    const marks = hm[1];
    const content = hm[2];

    for (const suffix of HEADING_SECTION_SUFFIXES) {
      const idx = content.indexOf(suffix);
      if (idx >= 0 && idx <= 18 && content.length > idx + suffix.length) {
        return `${marks}${content.slice(0, idx + suffix.length)}\n\n${content.slice(idx + suffix.length).trimStart()}`;
      }
    }

    const list = content.match(/^(.{2,28}?)(\d+\.\s[\s\S]+)$/);
    if (list) {
      return `${marks}${list[1].trim()}\n\n${list[2].trimStart()}`;
    }

    return line;
  });

  // 同一行内多个编号列表项
  out = out.replace(/([^\n\d])(\d+\.\s)/g, "$1\n$2");

  // 标题前确保空行（勿匹配 ## 中的第二个 #）
  out = out.replace(/([^\n#])(#{1,6}\s)/g, "$1\n\n$2");

  return out;
}

function fixMarkdownStructure(text: string): string {
  const codeBlocks: string[] = [];
  let out = text.replace(/```[\s\S]*?```/g, (block) => {
    const idx = codeBlocks.length;
    codeBlocks.push(block);
    return `\0CODEBLOCK${idx}\0`;
  });

  out = fixMarkdownHeadings(out);

  out = out.replace(/([^\n])\n([-*]\s)/g, "$1\n\n$2");
  out = out.replace(/([。！？；])(?=[^\n#`\d\s-\0])/g, "$1\n");

  out = out.replace(/\0CODEBLOCK(\d+)\0/g, (_, i) => codeBlocks[Number(i)] ?? "");
  return out;
}

export function normalizeMarkdownForDisplay(raw: string): string {
  if (!raw?.trim()) return raw || "";

  let text = raw.replace(/\r\n/g, "\n");

  // 代码围栏独占行（避免正文与 ```mermaid 粘在同一行）
  text = text.replace(/([^\n])\s*```\s*mermaid/gi, "$1\n\n```mermaid");
  text = text.replace(/```\s*mermaid\s*([^\n`])/gi, "```mermaid\n$1");
  text = text.replace(/```\s*mermaid\s*\n?/gi, "```mermaid\n");

  // 修复围栏内的 mermaid 正文
  text = text.replace(/```mermaid\n([\s\S]*?)```/gi, (_, body: string) => {
    return `\n\n\`\`\`mermaid\n${repairMermaidCode(body)}\n\`\`\`\n\n`;
  });

  // 未闭合的 mermaid 块
  text = text.replace(
    /```mermaid\n([\s\S]*?)(?=\n#{1,6}\s|\n\n[\u4e00-\u9fff]|$)/gi,
    (match, body: string) => {
      if (match.includes("```\n", 10)) return match;
      const fixed = repairMermaidCode(body);
      return `\n\n\`\`\`mermaid\n${fixed}\n\`\`\`\n\n`;
    }
  );

  text = fixMarkdownStructure(text);

  // mermaidgraph 粘连
  text = text.replace(
    /(^|\n)mermaid\s*(graph|flowchart)/gi,
    "$1```mermaid\n$2"
  );

  return text.trim();
}
