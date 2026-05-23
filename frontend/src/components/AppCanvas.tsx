"use client";

import { NAV_META } from "@/lib/navMeta";
import type { AppRoute } from "@/hooks/navRoutes";

type AppCanvasProps = {
  activeRoute: AppRoute;
};

/** 主内容区动态光晕背景，随当前页面 accent 色轻微变化 */
export default function AppCanvas({ activeRoute }: AppCanvasProps) {
  const accent = NAV_META[activeRoute].accent;

  return (
    <div aria-hidden className="lp-app-canvas">
      <div className="lp-app-canvas-grid" />
      <div
        className="lp-app-canvas-orb lp-app-canvas-orb--1"
        style={{ "--orb-accent": accent } as React.CSSProperties}
      />
      <div className="lp-app-canvas-orb lp-app-canvas-orb--2" />
      <div className="lp-app-canvas-orb lp-app-canvas-orb--3" />
    </div>
  );
}
