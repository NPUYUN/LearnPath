"use client";

import { useCallback, useEffect, useState } from "react";
import { applyThemeToDocument, resolveTheme, type ResolvedTheme } from "@/lib/theme";
import { useSettingsStore } from "@/store/settingsStore";

function readDomTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  const v = document.documentElement.dataset.theme;
  return v === "dark" ? "dark" : "light";
}

/** 与设置页、系统偏好、localStorage 同步的已解析主题（light | dark） */
export function useResolvedTheme(): ResolvedTheme {
  const themeMode = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);

  const [resolved, setResolved] = useState<ResolvedTheme>(() => readDomTheme());

  const sync = useCallback(() => {
    const next = resolveTheme(themeMode);
    setResolved(next);
    applyThemeToDocument(next, fontSize);
  }, [themeMode, fontSize]);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    if (themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => sync();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themeMode, sync]);

  return resolved;
}
