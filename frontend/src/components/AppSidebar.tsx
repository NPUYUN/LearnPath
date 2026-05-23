"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Flex, Tag, Tooltip, Typography } from "antd";
import { getRecommendations, type ResourceRecommendation } from "@/lib/api";
import { NAV_META, pathProgress } from "@/lib/navMeta";
import { useAppStore } from "@/store/appStore";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import MenuFoldOutlined from "@ant-design/icons/MenuFoldOutlined";
import MenuUnfoldOutlined from "@ant-design/icons/MenuUnfoldOutlined";
import LogoutOutlined from "@ant-design/icons/LogoutOutlined";
import ReadOutlined from "@ant-design/icons/ReadOutlined";
import type { NavRoute } from "@/hooks/navRoutes";

const { Text } = Typography;

type NavItem = {
  key: NavRoute;
  icon: React.ReactNode;
  label: string;
};

type AppSidebarProps = {
  collapsed: boolean;
  onCollapse: () => void;
  selected: NavRoute;
  onNavigate: (route: NavRoute) => void;
  primaryItems: NavItem[];
  secondaryItems: NavItem[];
  userName: string;
  courseName: string;
  onLogout: () => void;
  initDone: boolean;
};

function ProgressRing({ pct, collapsed }: { pct: number; collapsed: boolean }) {
  const r = collapsed ? 14 : 18;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className={`lp-journey-ring${collapsed ? " lp-journey-ring--sm" : ""}`}>
      <svg viewBox="0 0 44 44" aria-hidden>
        <circle className="lp-journey-ring-track" cx="22" cy="22" r={r} />
        <circle
          className="lp-journey-ring-fill"
          cx="22"
          cy="22"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      {!collapsed && (
        <span className="lp-journey-ring-label">
          <strong>{pct}%</strong>
          <small>路径完成</small>
        </span>
      )}
      {collapsed && <span className="lp-journey-ring-pct">{pct}</span>}
    </div>
  );
}

function NavButton({
  item,
  selected,
  collapsed,
  disabled,
  onNavigate,
}: {
  item: NavItem;
  selected: boolean;
  collapsed: boolean;
  disabled: boolean;
  onNavigate: (route: NavRoute) => void;
}) {
  const meta = NAV_META[item.key];
  const isPrimary = meta.group === "primary";

  const btn = (
    <button
      type="button"
      className={[
        "lp-nav-item",
        selected ? "lp-nav-item--active" : "",
        collapsed ? "lp-nav-item--collapsed" : "",
        isPrimary ? "lp-nav-item--primary" : "lp-nav-item--secondary",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        selected
          ? ({
              "--nav-accent": meta.accent,
              "--nav-glow": meta.glow,
            } as React.CSSProperties)
          : undefined
      }
      disabled={disabled}
      onClick={() => onNavigate(item.key)}
      aria-current={selected ? "page" : undefined}
    >
      <span className="lp-nav-item-icon">{item.icon}</span>
      {!collapsed && (
        <>
          <span className="lp-nav-item-label">{item.label}</span>
          {meta.step != null && (
            <span className="lp-nav-item-step">{String(meta.step).padStart(2, "0")}</span>
          )}
        </>
      )}
      {selected && <span className="lp-nav-item-glow" aria-hidden />}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip title={item.label} placement="right">
        {btn}
      </Tooltip>
    );
  }
  return btn;
}

export default function AppSidebar({
  collapsed,
  onCollapse,
  selected,
  onNavigate,
  primaryItems,
  secondaryItems,
  userName,
  courseName,
  onLogout,
  initDone,
}: AppSidebarProps) {
  const initial = userName?.charAt(0) || "学";
  const userId = useAppStore((s) => s.userId);
  const learningPath = useAppStore((s) => s.learningPath);
  const setPendingResourcePreviewId = useAppStore((s) => s.setPendingResourcePreviewId);
  const [recommendations, setRecommendations] = useState<ResourceRecommendation[]>([]);

  const progressPct = useMemo(
    () => pathProgress(learningPath?.steps),
    [learningPath?.steps]
  );

  useEffect(() => {
    void getRecommendations(userId, 3)
      .then(setRecommendations)
      .catch(() => setRecommendations([]));
  }, [userId]);

  return (
    <aside className={`learnpath-sider${collapsed ? " learnpath-sider--collapsed" : ""}`}>
      <button
        type="button"
        className="learnpath-sider-brand"
        onClick={() => onNavigate("/chat")}
      >
        <div className="learnpath-sider-logo">
          <BulbOutlined />
        </div>
        {!collapsed && (
          <div className="learnpath-sider-brand-text">
            <span className="learnpath-sider-title">学径</span>
            <span className="learnpath-sider-subtitle">Learning Cockpit</span>
          </div>
        )}
      </button>

      {!collapsed && (
        <div className="lp-journey-header">
          <ProgressRing pct={progressPct} collapsed={false} />
          <div className="lp-journey-header-text">
            <Text strong style={{ fontSize: 13 }}>
              学习旅程
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              五步闭环 · AI 全程陪伴
            </Text>
          </div>
        </div>
      )}

      {collapsed && (
        <div className="lp-journey-header lp-journey-header--collapsed">
          <ProgressRing pct={progressPct} collapsed />
        </div>
      )}

      <nav className="learnpath-sider-nav" aria-label="主导航">
        <div className="lp-nav-journey">
          {primaryItems.map((item, idx) => (
            <div key={item.key} className="lp-nav-journey-node">
              {!collapsed && idx > 0 && <span className="lp-nav-journey-line" aria-hidden />}
              <NavButton
                item={item}
                selected={selected === item.key}
                collapsed={collapsed}
                disabled={!initDone}
                onNavigate={onNavigate}
              />
            </div>
          ))}
        </div>

        {!collapsed && recommendations.length > 0 && (
          <div className="learnpath-sider-recs">
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 6 }}>
              ✦ 今日推荐
            </Text>
            <Flex wrap gap={4}>
              {recommendations.map((rec) => (
                <Tag
                  key={rec.id}
                  className="learnpath-rec-chip"
                  onClick={() => {
                    setPendingResourcePreviewId(rec.id);
                    onNavigate("/resources");
                  }}
                >
                  {rec.title.length > 12 ? `${rec.title.slice(0, 12)}…` : rec.title}
                </Tag>
              ))}
            </Flex>
          </div>
        )}

        <div className="lp-nav-secondary">
          {secondaryItems.map((item) => (
            <NavButton
              key={item.key}
              item={item}
              selected={selected === item.key}
              collapsed={collapsed}
              disabled={!initDone}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      <div className="learnpath-sider-footer">
        {!collapsed ? (
          <>
            <div
              className="learnpath-user-card learnpath-user-card--clickable"
              role="button"
              tabIndex={0}
              onClick={() => onNavigate("/account")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onNavigate("/account");
                }
              }}
            >
              <Avatar size={40} className="learnpath-user-avatar">
                {initial}
              </Avatar>
              <div className="learnpath-user-meta">
                <Text className="learnpath-user-name" ellipsis>
                  {userName}
                </Text>
                <Tag icon={<ReadOutlined />} className="learnpath-user-course" bordered={false}>
                  {courseName}
                </Tag>
              </div>
            </div>
            <Flex align="center" justify="space-between" className="learnpath-sider-actions">
              <Tooltip title="收起侧栏">
                <Button
                  type="text"
                  className="learnpath-sider-action-btn"
                  icon={<MenuFoldOutlined />}
                  onClick={onCollapse}
                />
              </Tooltip>
              <Tooltip title="退出登录">
                <Button
                  type="text"
                  danger
                  className="learnpath-sider-action-btn learnpath-sider-action-btn--logout"
                  icon={<LogoutOutlined />}
                  onClick={onLogout}
                >
                  退出
                </Button>
              </Tooltip>
            </Flex>
          </>
        ) : (
          <Flex vertical align="center" gap={8} className="learnpath-sider-footer-collapsed">
            <Tooltip title={`${userName} · 个人主页`} placement="right">
              <Avatar
                size={36}
                className="learnpath-user-avatar learnpath-user-avatar--clickable"
                onClick={() => onNavigate("/account")}
              >
                {initial}
              </Avatar>
            </Tooltip>
            <Tooltip title="退出登录" placement="right">
              <Button
                type="text"
                danger
                size="small"
                className="learnpath-sider-action-btn"
                icon={<LogoutOutlined />}
                onClick={onLogout}
              />
            </Tooltip>
            <Tooltip title="展开侧栏" placement="right">
              <Button
                type="text"
                className="learnpath-sider-action-btn"
                icon={<MenuUnfoldOutlined />}
                onClick={onCollapse}
              />
            </Tooltip>
          </Flex>
        )}
      </div>
    </aside>
  );
}
