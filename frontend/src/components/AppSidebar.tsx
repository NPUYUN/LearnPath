"use client";

import Link from "next/link";
import { Avatar, Button, Flex, Menu, Tag, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import MenuFoldOutlined from "@ant-design/icons/MenuFoldOutlined";
import MenuUnfoldOutlined from "@ant-design/icons/MenuUnfoldOutlined";
import LogoutOutlined from "@ant-design/icons/LogoutOutlined";
import ReadOutlined from "@ant-design/icons/ReadOutlined";
import type { NavRoute } from "@/hooks/navRoutes";

const { Text } = Typography;

type AppSidebarProps = {
  collapsed: boolean;
  onCollapse: () => void;
  selected: NavRoute;
  onNavigate: (route: NavRoute) => void;
  menuItems: MenuProps["items"];
  onMenuClick: MenuProps["onClick"];
  userName: string;
  courseName: string;
  onLogout: () => void;
};

export default function AppSidebar({
  collapsed,
  onCollapse,
  selected,
  onNavigate,
  menuItems,
  onMenuClick,
  userName,
  courseName,
  onLogout,
}: AppSidebarProps) {
  const initial = userName?.charAt(0) || "学";

  return (
    <aside className={`learnpath-sider${collapsed ? " learnpath-sider--collapsed" : ""}`}>
      <Link
        href="/chat"
        className="learnpath-sider-brand"
        onClick={(e) => {
          e.preventDefault();
          onNavigate("/chat");
        }}
      >
        <div className="learnpath-sider-logo">
          <BulbOutlined />
        </div>
        {!collapsed && (
          <div className="learnpath-sider-brand-text">
            <span className="learnpath-sider-title">学径</span>
            <span className="learnpath-sider-subtitle">LearnPath</span>
          </div>
        )}
      </Link>

      <div className="learnpath-sider-menu-wrap">
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          items={menuItems}
          onClick={onMenuClick}
          className="learnpath-sider-menu"
        />
      </div>

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
                <Tag
                  icon={<ReadOutlined />}
                  className="learnpath-user-course"
                  bordered={false}
                >
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
