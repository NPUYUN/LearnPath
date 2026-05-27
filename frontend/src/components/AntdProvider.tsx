"use client";

import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

export default function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 10,
          colorBgLayout: "#f0f4f8",
          colorText: "#0f172a",
          colorTextSecondary: "#64748b",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Menu: {
            itemBorderRadius: 10,
            itemMarginInline: 10,
          },
          Card: {
            borderRadiusLG: 12,
          },
          Button: {
            borderRadius: 8,
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
