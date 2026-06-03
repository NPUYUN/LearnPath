"use client";

import DashboardOutlined from "@ant-design/icons/DashboardOutlined";
import TeamOutlined from "@ant-design/icons/TeamOutlined";
import DatabaseOutlined from "@ant-design/icons/DatabaseOutlined";
import LineChartOutlined from "@ant-design/icons/LineChartOutlined";
import LogoutOutlined from "@ant-design/icons/LogoutOutlined";
import SafetyCertificateOutlined from "@ant-design/icons/SafetyCertificateOutlined";
import { useAppStore } from "@/store/appStore";
import type { AdminRoute } from "@/hooks/adminRoutes";

const NAV: { key: AdminRoute; icon: React.ReactNode; label: string }[] = [
  { key: "/admin", icon: <DashboardOutlined />, label: "数据总览" },
  { key: "/admin/users", icon: <TeamOutlined />, label: "用户管理" },
  { key: "/admin/resources", icon: <DatabaseOutlined />, label: "资源汇总" },
  { key: "/admin/activity", icon: <LineChartOutlined />, label: "行为分析" },
];

export default function AdminSidebar({
  collapsed,
  onCollapse,
  activeRoute,
  onNavigate,
  onLogout,
}: {
  collapsed: boolean;
  onCollapse: () => void;
  activeRoute: AdminRoute;
  onNavigate: (route: AdminRoute) => void;
  onLogout: () => void;
}) {
  const userName = useAppStore((s) => s.userName);

  return (
    <aside className={`lp-admin-sider${collapsed ? " lp-admin-sider--collapsed" : ""}`}>
      <div className="lp-admin-sider-brand">
        <SafetyCertificateOutlined className="lp-admin-sider-brand-icon" />
        {!collapsed && (
          <div>
            <div className="lp-admin-sider-title">学径管理台</div>
            <div className="lp-admin-sider-sub">Platform Console</div>
          </div>
        )}
      </div>

      <nav className="lp-admin-sider-nav">
        {NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`lp-admin-nav-item${activeRoute === item.key ? " lp-admin-nav-item--active" : ""}`}
            onClick={() => onNavigate(item.key)}
            title={item.label}
          >
            <span className="lp-admin-nav-icon">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="lp-admin-sider-foot">
        {!collapsed && (
          <div className="lp-admin-sider-user">
            <span className="lp-admin-sider-user-name">{userName}</span>
            <span className="lp-admin-sider-user-role">管理员</span>
          </div>
        )}
        <button type="button" className="lp-admin-nav-item" onClick={onLogout} title="退出">
          <span className="lp-admin-nav-icon">
            <LogoutOutlined />
          </span>
          {!collapsed && <span>退出登录</span>}
        </button>
        <button type="button" className="lp-admin-collapse" onClick={onCollapse}>
          {collapsed ? "»" : "«"}
        </button>
      </div>
    </aside>
  );
}
