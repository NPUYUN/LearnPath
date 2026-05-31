"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { AppRoute } from "@/hooks/navRoutes";
import { NAV_META, type NavMeta } from "@/lib/navMeta";

type PageScopeValue = {
  route: AppRoute;
  meta: NavMeta;
};

const PageScopeContext = createContext<PageScopeValue | null>(null);

function pageScopeStyle(meta: NavMeta): CSSProperties {
  return {
    "--page-accent": meta.accent,
    "--page-glow": meta.glow,
    "--lp-accent": meta.accent,
    "--lp-accent-soft": `color-mix(in srgb, ${meta.accent} 14%, transparent)`,
  } as CSSProperties;
}

/** 为 Keep-alive 各页面隔离主题色 CSS 变量，避免串色 */
export function PageScope({ route, children }: { route: AppRoute; children: ReactNode }) {
  const meta = NAV_META[route];
  return (
    <PageScopeContext.Provider value={{ route, meta }}>
      <div
        className="lp-page-scope"
        data-page-route={route}
        style={pageScopeStyle(meta)}
      >
        {children}
      </div>
    </PageScopeContext.Provider>
  );
}

export function usePageScope(): PageScopeValue {
  const ctx = useContext(PageScopeContext);
  if (!ctx) {
    return { route: "/chat", meta: NAV_META["/chat"] };
  }
  return ctx;
}

export { pageScopeStyle };
