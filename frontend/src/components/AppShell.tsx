"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { getEvalStats, getPath, getProfile, listResources } from "@/lib/api";
import { isNavRoute, NAV_ROUTES, type NavRoute } from "@/hooks/navRoutes";
import { PAGE_MODULES } from "@/lib/pageModules";
import { prewarmEchartsEngine, preloadEcharts } from "@/lib/useEcharts";
import { registerClientNav } from "@/lib/clientNav";
import { useAppStore } from "@/store/appStore";
import type { MenuProps } from "antd";
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
import AuthLightProvider from "@/components/AuthLightProvider";
import AuthPageTheme from "@/components/AuthPageTheme";
import InitLoadingScreen from "@/components/InitLoadingScreen";
import PagePane from "@/components/PagePane";
import ThemeProvider from "@/components/ThemeProvider";

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

const PREVIEW_MS = 180;

export default function AppShell({ children: _children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const routeFromPath: NavRoute = isNavRoute(pathname) ? pathname : "/chat";
  const [activeTab, setActiveTab] = useState<NavRoute>(routeFromPath);

  const isLoggedIn = useAppStore((s) => s.isLoggedIn);
  const showLanding = useAppStore((s) => s.showLanding);
  const userName = useAppStore((s) => s.userName);
  const courseName = useAppStore((s) => s.courseName);
  const logout = useAppStore((s) => s.logout);

  const [pageComponents, setPageComponents] = useState<Partial<Record<NavRoute, ComponentType>>>({});
  const [dataReady, setDataReady] = useState(false);
  const [warmedRoutes, setWarmedRoutes] = useState<Set<NavRoute>>(() => new Set());
  const [previewRoute, setPreviewRoute] = useState<NavRoute | null>(null);
  const [initProgress, setInitProgress] = useState(0);
  const [initDone, setInitDone] = useState(false);
  const [initFading, setInitFading] = useState(false);
  const finishCalled = useRef(false);
  const cycleStarted = useRef(false);

  useEffect(() => {
    if (isNavRoute(pathname)) setActiveTab(pathname);
  }, [pathname]);

  const goTo = useCallback(
    (key: NavRoute) => {
      setActiveTab(key);
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
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (isLoggedIn && !isNavRoute(pathname)) {
      router.replace("/chat");
      setActiveTab("/chat");
    }
  }, [isLoggedIn, pathname, router]);

  const finishInit = useCallback(() => {
    if (finishCalled.current) return;
    finishCalled.current = true;
    setPreviewRoute(null);
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
      setPreviewRoute(null);
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
    setPreviewRoute(null);
    setDataReady(false);
    setInitDone(false);
    setInitFading(false);
    setInitProgress(0);

    const {
      userId,
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
      if (!profile) {
        tasks.push(
          getProfile(userId)
            .then((p) => {
              if (p) setProfile(p);
            })
            .catch(() => {})
        );
      }
      if (!resources.length) {
        tasks.push(
          listResources(userId)
            .then((list) => {
              setResources(list);
              const titles: Record<string, string> = {};
              list.forEach((r) => {
                titles[r.id] = r.title;
              });
              setResourceTitles(titles);
            })
            .catch(() => {})
        );
      }
      if (!learningPath) {
        tasks.push(
          getPath(userId)
            .then((p) => {
              if (p) setLearningPath(p);
            })
            .catch(() => {})
        );
      }
      if (!evalStats) {
        tasks.push(
          getEvalStats(userId)
            .then((s) => setEvalStats(s))
            .catch(() => {})
        );
      }
      tasks.push(
        import("@/components/MarkdownPreview").then(() => {}).catch(() => {}),
        preloadEcharts().then(() => prewarmEchartsEngine()).catch(() => {})
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
  }, [isLoggedIn, finishInit]);

  const allModulesLoaded = NAV_ROUTES.every((r) => pageComponents[r]);

  // 逐页短暂「点亮」预渲染（含 ECharts 首次绘制）
  useEffect(() => {
    if (!isLoggedIn || !allModulesLoaded || !dataReady || cycleStarted.current) return;
    cycleStarted.current = true;

    let cancelled = false;

    void (async () => {
      for (let i = 0; i < NAV_ROUTES.length; i++) {
        if (cancelled) return;
        const route = NAV_ROUTES[i];
        setPreviewRoute(route);
        window.dispatchEvent(new CustomEvent("learnpath-pane-show", { detail: route }));
        await new Promise((r) => setTimeout(r, PREVIEW_MS));
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

  const menuItems: MenuProps["items"] = useMemo(
    () => [
      ...NAV_ITEMS_PRIMARY.map(({ key, icon, label }) => ({ key, icon, label })),
      { type: "divider" as const },
      ...NAV_ITEMS_SECONDARY.map(({ key, icon, label }) => ({ key, icon, label })),
    ],
    []
  );

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (!initDone) return;
    if (typeof key === "string" && isNavRoute(key)) goTo(key);
  };

  if (!isLoggedIn) {
    return (
      <AuthLightProvider>
        <AuthPageTheme />
        {showLanding ? <LandingContent /> : <LoginContent />}
      </AuthLightProvider>
    );
  }

  return (
    <ThemeProvider>
      {!initDone && <InitLoadingScreen progress={initProgress} fading={initFading} />}

      <div
        className={`learnpath-app${collapsed ? " learnpath-app--collapsed" : ""}${initDone ? "" : " learnpath-app--warming"}`}
      >
        <AppSidebar
          collapsed={collapsed}
          onCollapse={() => setCollapsed((c) => !c)}
          selected={activeTab}
          onNavigate={goTo}
          menuItems={menuItems}
          onMenuClick={handleMenuClick}
          userName={userName}
          courseName={courseName}
          onLogout={() => {
            logout();
            router.replace("/");
          }}
        />

        <main className="learnpath-main learnpath-panel learnpath-keepalive">
          {allModulesLoaded &&
            NAV_ROUTES.map((route) => {
              const Comp = pageComponents[route]!;
              const isActive = initDone && activeTab === route;
              const isPreview = !initDone && previewRoute === route;
              return (
                <PagePane key={route} active={isActive} preview={isPreview}>
                  <Comp />
                </PagePane>
              );
            })}
        </main>
      </div>
    </ThemeProvider>
  );
}
