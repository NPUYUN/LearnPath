/**
 * 规范化 LLM 输出的 Markdown，修复常见格式问题以便正确渲染。
 */

/** 修复粘连、缺换行的 Mermaid 源码，保证节点与边标签可渲染 */
export function repairMermaidCode(raw: string): string {
  let code = raw
    .trim()
    .replace(/^```mermaid\s*/i, "")
    .replace(/```\s*$/g, "")
    .trim();

  if (!code) return "flowchart TD\n  A[主题] --> B[说明]";

  // graph TD → flowchart TD（Mermaid 11 推荐）
  code = code.replace(/^graph\s+(TD|TB|LR|RL|BT)/i, (_, dir) => `flowchart ${dir.toUpperCase()}`);
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

  // B[Kotlin]A --> 粘连节点
  code = code.replace(/\]([A-Z])(?=\s*--)/g, "]\n  $1 ");
  code = code.replace(/\]([A-Z])(?=\[)/g, "]\n  $1 ");
  code = code.replace(/\bBB\b/g, "B");

  // 每条边独立一行并缩进
  const lines = code.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^flowchart/i.test(t)) {
      out.push(t);
      continue;
    }
    if (t.includes("-->")) {
      out.push(`  ${t}`);
    } else {
      out.push(t);
    }
  }

  code = out.join("\n") || "flowchart TD\n  A[内容] --> B[说明]";

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

  // 未闭合的 mermaid 块：直到下一个标题或空行+中文段落
  text = text.replace(
    /```mermaid\n([\s\S]*?)(?=\n#{1,6}\s|\n\n[\u4e00-\u9fff]|$)/gi,
    (match, body: string) => {
      if (match.includes("```\n", 10)) return match;
      const fixed = repairMermaidCode(body);
      return `\n\n\`\`\`mermaid\n${fixed}\n\`\`\`\n\n`;
    }
  );

  // 标题前补换行
  text = text.replace(/([^\n])\n?(#{1,6}\s)/g, "$1\n\n$2");

  // 围栏结束符后补段落空行
  text = text.replace(/```\s*\n([^\n#`\s-])/g, "```\n\n$1");
  text = text.replace(/```\s*([\u4e00-\u9fff])/g, "```\n\n$1");

  // mermaidgraph 粘连
  text = text.replace(
    /```?\s*mermaid\s*(graph|flowchart|sequenceDiagram)/gi,
    "```mermaid\n$1"
  );
  text = text.replace(
    /(^|\n)mermaid\s*(graph|flowchart)/gi,
    "$1```mermaid\n$2"
  );

  // 列表、编号列表前补换行
  text = text.replace(/([^\n])\n([-*]\s)/g, "$1\n\n$2");
  text = text.replace(/([^\n])\n(\d+\.\s)/g, "$1\n\n$2");

  // 中文句号后若非标题则保持（已有换行则不处理）
  text = text.replace(/([。！？；])(?=[^\n#`\d\s-])/g, "$1\n");

  return text.trim();
}
