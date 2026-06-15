import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { BRAND_TITLE } from "@/lib/brand";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND_TITLE,
  description: "个性化资源生成与学习多智能体系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
