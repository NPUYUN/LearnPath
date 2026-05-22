"use client";

import { ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";

/** 登录/落地页固定浅色 Ant Design，不受用户深色设置影响 */
export default function AuthLightProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 10,
          colorBgContainer: "#ffffff",
          colorBgElevated: "#ffffff",
          colorText: "#0f172a",
          colorTextSecondary: "#64748b",
          colorBorder: "#e2e8f0",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Input: { colorBgContainer: "#ffffff", activeBorderColor: "#1677ff" },
          Select: { colorBgContainer: "#ffffff", optionSelectedBg: "#e6f4ff" },
        },
      }}
    >
      <div className="lp-auth-scope" data-theme="light">
        {children}
      </div>
    </ConfigProvider>
  );
}
