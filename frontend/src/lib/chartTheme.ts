/** ECharts 主题色板，随 html[data-theme] 切换 */

export function isDarkTheme(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.theme === "dark";
}

export function getChartPalette(isDark = isDarkTheme()) {
  return {
    text: isDark ? "#94a3b8" : "#64748b",
    axisLine: isDark ? "#334155" : "#e0e0e0",
    splitArea: isDark ? ["#1e293b", "#253347"] : ["#fafafa", "#f0f7ff"],
    primary: isDark ? "#4096ff" : "#1677ff",
    beforeLine: isDark ? "#64748b" : "#aaaaaa",
    legendText: isDark ? "#cbd5e1" : "#475569",
  };
}
