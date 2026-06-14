import { apiUrl, authHeaders, getResource, type LearningResource } from "@/lib/api";
import { clearAccessToken, clearAuthSession } from "@/store/authStore";

export type DownloadResourceResult = {
  ok: boolean;
  error?: string;
  saveHint?: string;
  /** 用户在另存为对话框中点了取消 */
  cancelled?: boolean;
};

const SAVE_HINT = "已保存到所选位置";

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

function safeFilename(title: string): string {
  const base = (title || "学习资源").replace(/[\\/:*?"<>|]/g, "_").trim();
  return `${base.slice(0, 80)}.md`;
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return fallback;
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain?.[1]?.trim() || fallback;
}

function parseApiError(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    if (status === 404) return "下载接口不可用或资源不存在，请刷新页面后重试";
    return "另存为失败，请稍后重试";
  }
  try {
    const data = JSON.parse(trimmed) as { detail?: string | unknown };
    const detail = data.detail;
    if (typeof detail === "string" && detail.trim()) {
      if (detail === "Not Found") return "下载接口不可用，请确认后端已重启后重试";
      return detail;
    }
  } catch {
    /* 非 JSON 响应 */
  }
  return trimmed.length > 120 ? "另存为失败，请稍后重试" : trimmed;
}

function buildMarkdownBody(resource: LearningResource): string {
  const title = resource.title?.trim() || "学习资源";
  const topic = resource.topic?.trim() || "—";
  const content = resource.content?.trim() || "";
  return `# ${title}\n\n> 主题：${topic}\n\n${content}`;
}

/** 无另存为 API 时回退：直接保存到浏览器默认下载目录 */
function triggerBrowserDownload(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 800);
    return true;
  } catch {
    return false;
  }
}

/** 弹出系统「另存为」对话框；不支持时回退到默认下载目录 */
async function saveBlobAs(
  blob: Blob,
  filename: string,
): Promise<Pick<DownloadResourceResult, "ok" | "error" | "saveHint" | "cancelled">> {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker.call(window, {
        suggestedName: filename,
        types: [
          {
            description: "Markdown 文档",
            accept: { "text/markdown": [".md"], "text/plain": [".md"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { ok: true, saveHint: SAVE_HINT };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { ok: false, cancelled: true };
      }
    }
  }

  const ok = triggerBrowserDownload(blob, filename);
  return ok
    ? {
        ok: true,
        saveHint: "当前浏览器不支持另存为对话框，已保存到默认「下载」文件夹",
      }
    : { ok: false, error: "浏览器阻止了保存，请检查下载权限后重试" };
}

async function downloadViaClientFallback(
  userId: string,
  resource: LearningResource,
  fallbackName: string,
): Promise<DownloadResourceResult> {
  const cached = resource.content?.trim();
  const fresh = cached && cached.length >= 20 ? resource : await getResource(userId, resource.id);
  if (!fresh?.content?.trim()) {
    return { ok: false, error: "资源正文为空，无法保存" };
  }
  const body = buildMarkdownBody(fresh);
  const blob = new Blob(["\ufeff", body], { type: "text/markdown;charset=utf-8" });
  return saveBlobAs(blob, fallbackName);
}

/** 拉取资源 Markdown 并通过「另存为」保存 */
export async function downloadResourceMarkdown(
  userId: string,
  resource: LearningResource,
): Promise<DownloadResourceResult> {
  const fallbackName = safeFilename(resource.title);

  try {
    const res = await fetch(
      apiUrl(
        `/api/resources/${encodeURIComponent(resource.id)}/download?user_id=${encodeURIComponent(userId)}`,
      ),
      { headers: authHeaders() },
    );

    if (res.status === 401) {
      clearAccessToken();
      clearAuthSession();
      return { ok: false, error: "登录已过期，请重新登录" };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404 || res.status >= 500) {
        const fallback = await downloadViaClientFallback(userId, resource, fallbackName);
        if (fallback.ok || fallback.cancelled) return fallback;
      }
      return { ok: false, error: parseApiError(text, res.status) };
    }

    const blob = await res.blob();
    if (!blob.size) {
      return downloadViaClientFallback(userId, resource, fallbackName);
    }

    const filename = filenameFromDisposition(
      res.headers.get("Content-Disposition"),
      fallbackName,
    );
    return saveBlobAs(blob, filename);
  } catch {
    try {
      return await downloadViaClientFallback(userId, resource, fallbackName);
    } catch {
      return { ok: false, error: "另存为失败，请确认后端已启动并重试" };
    }
  }
}
