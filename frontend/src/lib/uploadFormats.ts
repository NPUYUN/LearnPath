/** 与后端 supported_extensions 对齐的上传格式工具 */

const EXT_LABELS: Record<string, string> = {
  ".pdf": "PDF",
  ".ppt": "PPT",
  ".pptx": "PPT",
  ".doc": "Word",
  ".docx": "Word",
  ".xls": "Excel",
  ".xlsx": "Excel",
  ".csv": "CSV",
  ".md": "Markdown",
  ".markdown": "Markdown",
  ".txt": "文本",
};

export function normalizeExtension(ext: string): string {
  const e = ext.trim().toLowerCase();
  return e.startsWith(".") ? e : `.${e}`;
}

export function buildUploadAccept(
  extensions: string[],
  options?: { includeImages?: boolean }
): string | undefined {
  if (!extensions.length) return undefined;
  const filePart = extensions.map(normalizeExtension).join(",");
  if (options?.includeImages) return `image/*,${filePart}`;
  return filePart;
}

export function isAllowedUploadFile(
  filename: string,
  extensions: string[],
  options?: { includeImages?: boolean }
): boolean {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  const allowed = new Set(extensions.map(normalizeExtension));
  if (options?.includeImages) {
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].forEach((e) => allowed.add(e));
  }
  return ext ? allowed.has(ext) : false;
}

/** 用于 UI 提示，如「PDF、PPT、Word、Markdown 等」 */
export function formatExtensionsHint(extensions: string[], maxLabels = 8): string {
  if (!extensions.length) {
    return "PDF、PPT、Word、Excel、Markdown、代码等常见格式";
  }
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const ext of extensions.map(normalizeExtension)) {
    const label = EXT_LABELS[ext] || ext.replace(/^\./, "").toUpperCase();
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length >= maxLabels) break;
  }
  const suffix = extensions.length > maxLabels ? " 等" : "";
  return labels.join("、") + suffix;
}
