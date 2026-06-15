function stripMarkdownFence(text: string): string {
  let cleaned = text.trim();
  if (!cleaned.startsWith("```")) return cleaned;
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/, "");
  return cleaned.trim();
}

function looksLikeJsonBlob(text: string): boolean {
  const cleaned = text.trim();
  return (
    cleaned.startsWith("{") &&
    (cleaned.includes('"description"') || cleaned.includes('"learning_objectives"'))
  );
}

function extractJsonObject(text: string): string | null {
  const cleaned = stripMarkdownFence(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

/** 将资料库简介规范为可读文案（兼容历史脏数据：整段 JSON 被写入 description） */
export function formatLibraryDescription(
  description: string,
  synthesis?: Record<string, unknown>
): string {
  const candidates = [description?.trim() || ""];
  const synDesc = synthesis?.description;
  if (typeof synDesc === "string" && synDesc.trim()) {
    candidates.push(synDesc.trim());
  }

  for (const raw of candidates) {
    if (!raw) continue;
    if (!looksLikeJsonBlob(raw)) return raw;

    const blob = extractJsonObject(raw);
    if (blob) {
      try {
        const parsed = JSON.parse(blob) as { description?: unknown };
        if (typeof parsed.description === "string" && parsed.description.trim()) {
          return parsed.description.trim();
        }
      } catch {
        /* fall through */
      }
    }

    const match = raw.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (match?.[1]) {
      return unescapeJsonString(match[1]).trim();
    }
  }

  return description?.trim() || "";
}
