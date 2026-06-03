"use client";

import type { ReactNode } from "react";
import { PageActiveContext, PageVisibilityContext } from "@/contexts/PageVisibilityContext";
import type { AdminRoute } from "@/hooks/adminRoutes";

type AdminPagePaneProps = {
  route: AdminRoute;
  active: boolean;
  preview: boolean;
  warm?: boolean;
  children: ReactNode;
};

/** 管理台 Keep-alive 面板：各页独立挂载，切换时不销毁图表与列表状态 */
export default function AdminPagePane({ route, active, preview, warm, children }: AdminPagePaneProps) {
  const shown = active || preview || Boolean(warm);
  const className = [
    "lp-admin-keepalive-pane",
    active ? "lp-admin-keepalive-pane--active" : "",
    preview ? "lp-admin-keepalive-pane--preview" : "",
    warm && !active && !preview ? "lp-admin-keepalive-pane--warm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <PageActiveContext.Provider value={active}>
      <PageVisibilityContext.Provider value={shown}>
        <div className={className} data-admin-route={route} aria-hidden={!active}>
          {children}
        </div>
      </PageVisibilityContext.Provider>
    </PageActiveContext.Provider>
  );
}
