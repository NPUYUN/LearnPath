import type { ThemeMode } from "@/store/settingsStore";

export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "learnpath-settings-v1";

/** 从 localStorage 解析用户选择的主题模式（与 zustand persist 结构一致） */
export function readStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "light";
    const parsed = JSON.parse(raw) as { state?: { theme?: ThemeMode }; theme?: ThemeMode };
    return parsed.state?.theme ?? parsed.theme ?? "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode === "dark" ? "dark" : "light";
}

export function applyThemeToDocument(resolved: ResolvedTheme, fontSize?: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  if (fontSize) root.dataset.fontSize = fontSize;
}

/** 供 layout 内联脚本使用，避免首屏闪白 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${STORAGE_KEY}';var raw=localStorage.getItem(k);var t='light';if(raw){var p=JSON.parse(raw);t=(p.state&&p.state.theme)||p.theme||'light';}var r='light';if(t==='system'){r=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}else if(t==='dark'){r='dark';}var fs='normal';if(raw){var p2=JSON.parse(raw);fs=(p2.state&&p2.state.fontSize)||p2.fontSize||'normal';}document.documentElement.setAttribute('data-theme',r);document.documentElement.setAttribute('data-font-size',fs);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
