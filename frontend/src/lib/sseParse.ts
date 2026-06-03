/** 解析单个 SSE 消息块（多行 data 按规范用换行拼接）。 */
export function parseSseBlock(part: string): { event: string; data: string } {
  const lines = part.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      // SSE 规范：去掉 "data:" 后至多一个 leading space
      dataLines.push(line.slice(5).replace(/^\s/, ""));
    }
  }

  return { event, data: dataLines.join("\n") };
}

/** 解码 token/done 载荷（后端 JSON 编码，保留换行）。 */
export function decodeStreamTextPayload(raw: string): string {
  if (!raw) return "";
  const first = raw.trimStart();
  if (first.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
    } catch {
      /* 兼容旧版纯文本 */
    }
  }
  return raw;
}
