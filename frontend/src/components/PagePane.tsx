"use client";

import type { ReactNode } from "react";
import { PageVisibilityContext } from "@/contexts/PageVisibilityContext";

type PagePaneProps = {
  active: boolean;
  preview: boolean;
  /** 登录预热完成后保持挂载，避免图表销毁后再次进入卡顿 */
  warm?: boolean;
  children: ReactNode;
};

/** Keep-alive 面板：始终占位，用 opacity 切换，避免 display:none 导致图表首帧卡顿 */
export default function PagePane({ active, preview, warm, children }: PagePaneProps) {
  const shown = active || preview || Boolean(warm);
  const className = [
    "learnpath-keepalive-pane",
    active ? "learnpath-keepalive-pane--active" : "",
    preview ? "learnpath-keepalive-pane--preview" : "",
    warm && !active && !preview ? "learnpath-keepalive-pane--warm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <PageVisibilityContext.Provider value={shown}>
      <div className={className} aria-hidden={!active}>
        {children}
      </div>
    </PageVisibilityContext.Provider>
  );
}
