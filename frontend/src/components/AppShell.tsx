"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { getEvalStats, getPath, getProfile, listResources } from "@/lib/api";
import {
  isNavRoute,
  isStandaloneRoute,
  NAV_ROUTES,
  type AppRoute,
  type NavRoute,
  type StandaloneRoute,
} from "@/hooks/navRoutes";
import { PAGE_MODULES } from "@/lib/pageModules";
import { prewarmEchartsEngine, preloadEcharts } from "@/lib/useEcharts";
import { registerClientNav } from "@/lib/clientNav";
import { useAppStore, displayCourseName } from "@/store/appStore";
import type { ComponentType } from "react";
import MessageOutlined from "@ant-design/icons/MessageOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import BarChartOutlined from "@ant-design/icons/BarChartOutlined";
import IdcardOutlined from "@ant-design/icons/IdcardOutlined";
import SettingOutlined from "@ant-design/icons/SettingOutlined";
import dynamic from "next/dynamic";
import AppSidebar from "@/components/AppSidebar";
import AppCanvas from "@/components/AppCanvas";
import AuthLightProvider from "@/components/AuthLightProvider";
import AuthPageTheme from "@/components/AuthPageTheme";
import InitLoadingScreen from "@/components/InitLoadingScreen";
import RouteLoadingScreen from "@/components/RouteLoadingScreen";
import PagePane from "@/components/PagePane";
import ThemeProvider from "@/components/ThemeProvider";
import { preloadLoggedInExtras, preloadStandaloneRoute } from "@/lib/routePreload";

const LoginContent = dynamic(() => import("@/components/LoginContent"), { ssr: false });
const LandingContent = dynamic(() => import("@/components/LandingContent"), { ssr: false });

const NAV_ITEMS_PRIMARY: { key: NavRoute; icon: React.ReactNode; label: string }[] = [
  { key: "/chat", icon: <MessageOutlined />, label: "智能对话" },
  { key: "/profile", icon: <UserOutlined />, label: "学习画像" },
  { key: "/path", icon: <ApartmentOutlined />, label: "学习路径" },
  { key: "/resources", icon: <BookOutlined />, label: "资源库" },
  { key: "/evaluation", icon: <BarChartOutlined />, label: "学习评估" },
];

const NAV_ITEMS_SECONDARY: { key: NavRoute; icon: React.ReactNode; label: string }[] = [
  { key: "/account", icon: <IdcardOutlined />, label: "个人主页" },
  { key: "/settings", icon: <SettingOutlined />, label: "设置" },
];

const PREVIEW_MS_DEFAULT = 260;
const PREVIEW_MS_BY_ROUTE: Partial<Record<NavRoute, number>> = {
  "/profile": 380,
  "/path": 300,
  "/resources": 340,
  "/evaluation": 400,
  "/account": 320,
  "/settings": 240,
};

type StandaloneTransition = {
  target: StandaloneRoute;
  progress: number;
  fading: boolean;
  ready: boolean;
};

function waitPreviewFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const routeFromPath: NavRoute = isNavRoute(pathname) ? pathname : "/chat";
  const [activeTab, setActiveTab] = useState<NavRoute>(routeFromPath);

  const isLoggedIn = useAppStore((s) => s.isLoggedIn);
  const userId = useAppStore((s) => s.userId);
  const showLanding = useAppStore((s) => s.showLanding);
  const userName = useAppStore((s) => s.userName);
  const courseName = useAppStore((s) => s.courseName);
  const logout = useAppStore((s) => s.logout);

  const [pageComponents, setPageComponents] = useState<Partial<Record<NavRoute, ComponentType>>>({});
  const [dataReady, setDataReady] = useState(false);
  const [warmedRoutes, setWarmedRoutes] = useState<Set<NavRoute>>(() => new Set());
  const [initProgress, setInitProgress] = useState(0);
  const [initDone, setInitDone] = useState(false);
  const [initFading, setInitFading] = useState(false);
  const finishCalled = useRef(false);
  const cycleStarted = useRef(false);

  const [standaloneTx, setStandaloneTx] = useState<StandaloneTransition | null>(null);

  useEffect(() => {
    if (isNavRoute(pathname)) setActiveTab(pathname);
  }, [pathname]);

  const goTo = useCallback(
    (key: AppRoute) => {
      if (isStandaloneRoute(key)) {
        setStandaloneTx({ target: key, progress: 10, fading: false, ready: false });
        router.push(key);
        return;
      }
      setStandaloneTx(null);
      setActiveTab(key);
      window.dispatchEvent(new CustomEvent("learnpath-pane-show", { detail: key }));
      if (pathname !== key) {
        startTransition(() => {
          router.push(key);
        });
      }
    },
    [pathname, router]
  );

  useEffect(() => {
    registerClientNav(goTo);
    return () => registerClientNav(() => {});
  }, [goTo]);

  useEffect(() => {
    if (!isLoggedIn) return;
    NAV_ROUTES.forEach((r) => router.prefetch(r));
    router.prefetch("/insights");
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (isLoggedIn && !isNavRoute(pathname) && !isStandaloneRoute(pathname)) {
      router.replace("/chat");
      setActiveTab("/chat");
    }
  }, [isLoggedIn, pathname, router]);

  const finishInit = useCallback(() => {
    if (finishCalled.current) return;
    finishCalled.current = true;
    setInitProgress(100);
    setInitFading(true);
    setTimeout(() => setInitDone(true), 380);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      finishCalled.current = false;
      cycleStarted.current = false;
      setPageComponents({});
      setWarmedRoutes(new Set());
      setDataReady(false);
      setInitProgress(0);
      setInitDone(false);
      setInitFading(false);
      setActiveTab("/chat");
      return;
    }

    finishCalled.current = false;
    cycleStarted.current = false;
    setWarmedRoutes(new Set());
    setDataReady(false);
    setInitDone(false);
    setInitFading(false);
    setInitProgress(0);

    const {
      profile,
      resources,
      learningPath,
      evalStats,
      setProfile,
      setResources,
      setLearningPath,
      setResourceTitles,
      setEvalStats,
    } = useAppStore.getState();

    let cancelled = false;
    const activeUserId = userId;

    void (async () => {
      const entries = await Promise.all(
        PAGE_MODULES.map(async (m) => {
          const mod = await m.load();
          return [m.route, mod.default] as const;
        })
      );
      if (cancelled) return;
      const map: Partial<Record<NavRoute, ComponentType>> = {};
      entries.forEach(([route, Comp]) => {
        map[route] = Comp;
      });
      setPageComponents(map);
    })();

    void (async () => {
      const tasks: Promise<void>[] = [];
      tasks.push(
        getProfile(activeUserId)
          .then((p) => {
            if (!cancelled) setProfile(p);
          })
          .catch(() => {})
      );
      tasks.push(
        listResources(activeUserId)
          .then((list) => {
            if (cancelled) return;
            setResources(list);
            const titles: Record<string, string> = {};
            list.forEach((r) => {
              titles[r.id] = r.title;
            });
            setResourceTitles(titles);
          })
          .catch(() => {})
      );
      tasks.push(
        getPath(activeUserId)
          .then((p) => {
            if (!cancelled) setLearningPath(p);
          })
          .catch(() => {})
      );
      tasks.push(
        getEvalStats(activeUserId)
          .then((s) => {
            if (!cancelled) setEvalStats(s);
          })
          .catch(() => {})
      );
      tasks.push(
        import("@/components/MarkdownPreview").then(() => {}).catch(() => {}),
        preloadEcharts().then(() => prewarmEchartsEngine()).catch(() => {}),
        preloadLoggedInExtras().catch(() => {})
      );
      await Promise.all(tasks);
      if (!cancelled) setDataReady(true);
    })();

    const fallback = setTimeout(() => {
      if (!cancelled) finishInit();
    }, 20000);

    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, [isLoggedIn, userId, finishInit]);

  const allModulesLoaded = NAV_ROUTES.every((r) => pageComponents[r]);

  // 登录后后台静默预热各页（不切换可见内容，避免从对话页「闪跳」到画像等页面）
  useEffect(() => {
    if (!isLoggedIn || !allModulesLoaded || !dataReady || cycleStarted.current) return;
    cycleStarted.current = true;

    let cancelled = false;

    void (async () => {
      for (let i = 0; i < NAV_ROUTES.length; i++) {
        if (cancelled) return;
        const route = NAV_ROUTES[i];
        window.dispatchEvent(new CustomEvent("learnpath-pane-show", { detail: route }));
        await waitPreviewFrames();
        const dwellMs = PREVIEW_MS_BY_ROUTE[route] ?? PREVIEW_MS_DEFAULT;
        await new Promise((r) => setTimeout(r, dwellMs));
        setWarmedRoutes((prev) => {
          const next = new Set(prev);
          next.add(route);
          return next;
        });
        setInitProgress(Math.min(95, 55 + Math.round(((i + 1) / NAV_ROUTES.length) * 40)));
      }
      if (!cancelled) finishInit();
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, allModulesLoaded, dataReady, finishInit]);

  useEffect(() => {
    if (!isLoggedIn || initDone) return;
    const modulePct = allModulesLoaded ? 35 : 0;
    const dataPct = dataReady ? 20 : 0;
    const warmPct = Math.round((warmedRoutes.size / NAV_ROUTES.length) * 40);
    setInitProgress(Math.min(99, modulePct + dataPct + warmPct));
  }, [isLoggedIn, initDone, allModulesLoaded, dataReady, warmedRoutes]);

  // 独立页（成就馆等）：点击即显示加载屏，预加载完成后再展示内容
  useEffect(() => {
    if (!isLoggedIn || !isStandaloneRoute(pathname)) {
      return;
    }

    const target = pathname;
    let cancelled = false;

    setStandaloneTx((prev) => {
      if (prev?.target === target) return prev;
      return { target, progress: 8, fading: false, ready: false };
    });

    const tick = setInterval(() => {
      setStandaloneTx((prev) => {
        if (!prev || prev.target !== target || prev.ready) return prev;
        return { ...prev, progress: Math.min(prev.progress + 5, 92) };
      });
    }, 45);

    void (async () => {
      try {
        await preloadStandaloneRoute(target);
      } catch {
        /* 预加载失败仍允许进入，由页面内重试 */
      }
      if (cancelled) return;
      clearInterval(tick);
      setStandaloneTx((prev) => {
        if (!prev || prev.target !== target) return prev;
        return { ...prev, progress: 100, fading: true };
      });
      window.setTimeout(() => {
        if (!cancelled) {
          setStandaloneTx((prev) => {
            if (!prev || prev.target !== target) return prev;
            return { ...prev, ready: true, fading: false };
          });
        }
      }, 380);
    })();

    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [pathname, isLoggedIn]);

  useEffect(() => {
    if (isStandaloneRoute(pathname)) return;
    setStandaloneTx((prev) => {
      if (!prev) return null;
      if (!prev.ready) return prev;
      return null;
    });
  }, [pathname]);

  const showStandaloneLoader = standaloneTx != null && !standaloneTx.ready;

  if (!isLoggedIn) {
    return (
      <AuthLightProvider>
        <AuthPageTheme />
        {showLanding ? <LandingContent /> : <LoginContent />}
      </AuthLightProvider>
    );
  }

  if (isStandaloneRoute(pathname)) {
    const loaderVariant = pathname === "/insights" ? "insights" : "default";
    return (
      <ThemeProvider>
        {showStandaloneLoader && (
          <RouteLoadingScreen
            variant={loaderVariant}
            progress={standaloneTx?.progress ?? 0}
            fading={standaloneTx?.fading}
          />
        )}
        <div
          className={`lp-standalone-mount${standaloneTx?.ready ? " lp-standalone-mount--ready" : ""}`}
        >
          {children}
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      {!initDone && <InitLoadingScreen progress={initProgress} fading={initFading} />}
      {showStandaloneLoader && (
        <RouteLoadingScreen
          variant={standaloneTx?.target === "/insights" ? "insights" : "default"}
          progress={standaloneTx?.progress ?? 0}
          fading={standaloneTx?.fading}
        />
      )}

      <div
        className={`learnpath-app${collapsed ? " learnpath-app--collapsed" : ""}${initDone ? "" : " learnpath-app--warming"}`}
      >
        <AppSidebar
          collapsed={collapsed}
          onCollapse={() => setCollapsed((c) => !c)}
          selected={activeTab}
          onNavigate={goTo}
          primaryItems={NAV_ITEMS_PRIMARY}
          secondaryItems={NAV_ITEMS_SECONDARY}
          userName={userName}
          courseName={displayCourseName(courseName, userId)}
          initDone={initDone}
          onLogout={() => {
            logout();
            router.replace("/");
          }}
        />

        <main className="learnpath-main learnpath-panel learnpath-keepalive">
          <AppCanvas activeRoute={activeTab} />
          {allModulesLoaded &&
            NAV_ROUTES.map((route) => {
              const Comp = pageComponents[route]!;
              const isActive = activeTab === route;
              const isWarm = warmedRoutes.has(route) && activeTab !== route;
              return (
                <PagePane key={route} active={isActive} preview={false} warm={isWarm}>
                  <Comp />
                </PagePane>
              );
            })}
        </main>
      </div>
    </ThemeProvider>
  );
}
