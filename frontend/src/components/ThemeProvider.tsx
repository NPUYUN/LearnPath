"use client";

import { ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";
import { useSettingsStore } from "@/store/settingsStore";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const resolved = useResolvedTheme();
  const fontSize = useSettingsStore((s) => s.fontSize);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  const isDark = resolved === "dark";
  const algorithm = isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
  const baseFontSize = fontSize === "large" ? 15 : 14;

  return (
    <ConfigProvider
      key={resolved}
      locale={zhCN}
      theme={{
        algorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 10,
          colorBgLayout: isDark ? "#0f1419" : "#f0f4f8",
          colorBgContainer: isDark ? "#1a2332" : "#ffffff",
          colorBgElevated: isDark ? "#1f2937" : "#ffffff",
          colorBorder: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)",
          colorText: isDark ? "#e2e8f0" : "#0f172a",
          colorTextSecondary: isDark ? "#94a3b8" : "#64748b",
          fontSize: baseFontSize,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Menu: {
            itemBorderRadius: 10,
            itemMarginInline: 10,
            darkItemBg: "transparent",
            darkSubMenuItemBg: "transparent",
          },
          Card: { borderRadiusLG: 12 },
          Button: { borderRadius: 8 },
        },
      }}
    >
      <div
        className={`lp-theme-root lp-theme-root--${resolved}${reduceMotion ? " lp-reduce-motion" : ""}`}
        data-theme={resolved}
      >
        {children}
      </div>
    </ConfigProvider>
  );
}
