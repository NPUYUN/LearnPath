"use client";

import type { ReactNode } from "react";
import { Typography } from "antd";

const { Title, Text } = Typography;

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  extra?: ReactNode;
  status?: ReactNode;
};

export default function PageHeader({ title, subtitle, icon, extra, status }: PageHeaderProps) {
  return (
    <header className="lp-page-header">
      <div className="lp-page-header-main">
        {icon && <div className="lp-page-header-icon">{icon}</div>}
        <div className="lp-page-header-text">
          <Title level={4} className="lp-page-header-title">
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
