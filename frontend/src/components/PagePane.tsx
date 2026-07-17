"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { PageActiveContext, PageVisibilityContext } from "@/contexts/PageVisibilityContext";
import { PageScope } from "@/contexts/PageScopeContext";
import type { NavRoute } from "@/hooks/navRoutes";

type PagePaneProps = {
  route: NavRoute;
  active: boolean;
  preview: boolean;
  /** 登录预热完成后保持挂载，避免图表销毁后再次进入卡顿 */
  warm?: boolean;
  children: ReactNode;
};

/** Keep-alive 面板：始终占位，用 opacity 切换，避免 display:none 导致图表首帧卡顿 */
export default function PagePane({ route, active, preview, warm, children }: PagePaneProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const wasActiveRef = useRef(false);
  const shown = active || preview || Boolean(warm);
  const className = [
    "learnpath-keepalive-pane",
    active ? "learnpath-keepalive-pane--active" : "",
    preview ? "learnpath-keepalive-pane--preview" : "",
    warm && !active && !preview ? "learnpath-keepalive-pane--warm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (active && !wasActiveRef.current && route !== "/chat") {
      const pane = paneRef.current;
      if (pane) {
        pane.scrollTop = 0;
        pane.scrollLeft = 0;
      }
    }
    wasActiveRef.current = active;
  }, [active, route]);

  return (
    <PageActiveContext.Provider value={active}>
      <PageVisibilityContext.Provider value={shown}>
        <div ref={paneRef} className={className} aria-hidden={!active}>
          <PageScope route={route}>{children}</PageScope>
        </div>
      </PageVisibilityContext.Provider>
    </PageActiveContext.Provider>
  );
}
