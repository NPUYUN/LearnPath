"use client";

import type { ReactNode } from "react";
import { Typography } from "antd";
import { usePageScope } from "@/contexts/PageScopeContext";

const { Title, Text } = Typography;

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  extra?: ReactNode;
  status?: ReactNode;
  /** 对话页使用紧凑沉浸式顶栏 */
  variant?: "default" | "immersive";
};

export default function PageHeader({
  title,
  subtitle,
  icon,
  extra,
  status,
  variant = "default",
}: PageHeaderProps) {
  const { meta } = usePageScope();

  return (
    <header
      className={`lp-page-header${variant === "immersive" ? " lp-page-header--immersive" : ""}`}
    >
      <div className="lp-page-header-accent" aria-hidden />
      <div className="lp-page-header-main">
        {icon && <div className="lp-page-header-icon">{icon}</div>}
        <div className="lp-page-header-text">
          {meta.step != null && variant !== "immersive" && (
            <span className="lp-page-header-step">
              Step {String(meta.step).padStart(2, "0")}
            </span>
          )}
          <Title level={variant === "immersive" ? 5 : 4} className="lp-page-header-title">
            {title}
          </Title>
          {subtitle && (
            <Text type="secondary" className="lp-page-header-subtitle">
              {subtitle}
            </Text>
          )}
          {status}
        </div>
      </div>
      {extra && <div className="lp-page-header-extra">{extra}</div>}
    </header>
  );
}
