"use client";

import { useEffect } from "react";
import { applyThemeToDocument, resolveTheme } from "@/lib/theme";
import { useSettingsStore } from "@/store/settingsStore";

/** 未登录页挂载期间强制页面级浅色变量，避免全局深色污染登录卡片 */
export default function AuthPageTheme() {
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    return () => {
      const { theme, fontSize } = useSettingsStore.getState();
      applyThemeToDocument(resolveTheme(theme), fontSize);
    };
  }, []);
  return null;
}
