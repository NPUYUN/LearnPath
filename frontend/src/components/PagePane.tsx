"use client";

import type { ReactNode } from "react";
import { PageVisibilityContext } from "@/contexts/PageVisibilityContext";

type PagePaneProps = {
  active: boolean;
  preview: boolean;
  children: ReactNode;
};

/** Keep-alive 面板：始终占位，用 opacity 切换，避免 display:none 导致图表首帧卡顿 */
export default function PagePane({ active, preview, children }: PagePaneProps) {
  const shown = active || preview;
  const className = [
    "learnpath-keepalive-pane",
    active ? "learnpath-keepalive-pane--active" : "",
    preview ? "learnpath-keepalive-pane--preview" : "",
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
