"use client";

import { useState, type ComponentType } from "react";
import { Spin } from "antd";
import AdminSidebar from "@/components/AdminSidebar";
import AdminPagePane from "@/components/AdminPagePane";
import ThemeProvider from "@/components/ThemeProvider";
import { ADMIN_ROUTES, type AdminRoute } from "@/hooks/adminRoutes";
type AdminShellProps = {
  activeRoute: AdminRoute;
  pageComponents: Partial<Record<AdminRoute, ComponentType>>;
  warmedRoutes: Set<string>;
  warmPreviewRoute?: AdminRoute | null;
  allModulesLoaded: boolean;
  initDone: boolean;
  onNavigate: (route: AdminRoute) => void;
  onLogout: () => void;
};

export default function AdminShell({
  activeRoute,
  pageComponents,
  warmedRoutes,
  warmPreviewRoute = null,
  allModulesLoaded,
  initDone,
  onNavigate,
  onLogout,
}: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ThemeProvider>
      <div
        className={`lp-admin-app${collapsed ? " lp-admin-app--collapsed" : ""}${initDone ? "" : " lp-admin-app--warming"}`}
      >
        <AdminSidebar
          collapsed={collapsed}
          onCollapse={() => setCollapsed((c) => !c)}
          activeRoute={activeRoute}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
        <main className="lp-admin-main lp-admin-keepalive">
          {!allModulesLoaded ? (
            <div className="lp-admin-loading">
              <Spin size="large" tip="加载管理模块…" />
            </div>
          ) : (
            ADMIN_ROUTES.map((route) => {
              const Comp = pageComponents[route];
              if (!Comp) return null;
              const isActive = activeRoute === route;
              const isPreview = warmPreviewRoute === route;
              const isWarm = warmedRoutes.has(route) && !isActive && !isPreview;
              return (
                <AdminPagePane
                  key={route}
                  route={route}
                  active={isActive}
                  preview={isPreview}
                  warm={isWarm}
                >
                  <Comp />
                </AdminPagePane>
              );
            })
          )}
        </main>      </div>
    </ThemeProvider>
  );
}
