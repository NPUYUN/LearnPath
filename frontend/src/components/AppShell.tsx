"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getPath, getProfile, listResources } from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import { Layout, Menu, Avatar, Typography, Progress } from "antd";
import type { MenuProps } from "antd";
import MessageOutlined from "@ant-design/icons/MessageOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import BarChartOutlined from "@ant-design/icons/BarChartOutlined";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import MenuFoldOutlined from "@ant-design/icons/MenuFoldOutlined";
import MenuUnfoldOutlined from "@ant-design/icons/MenuUnfoldOutlined";
import LogoutOutlined from "@ant-design/icons/LogoutOutlined";
import dynamic from "next/dynamic";

// ─── Keep-alive 页面组件（首次挂载后永不卸载，切换仅靠 CSS display）──────────
const ChatContent       = dynamic(() => import("@/components/pages/ChatContent"),       { ssr: false });
const ProfileContent    = dynamic(() => import("@/components/pages/ProfileContent"),    { ssr: false });
const PathContent       = dynamic(() => import("@/components/pages/PathContent"),       { ssr: false });
const ResourcesContent  = dynamic(() => import("@/components/pages/ResourcesContent"),  { ssr: false });
const EvaluationContent = dynamic(() => import("@/components/pages/EvaluationContent"), { ssr: false });

// ─── 登录页（仅在未登录时显示）──────────────────────────────────────────────────
const LoginContent  = dynamic(() => import("@/components/LoginContent"),  { ssr: false });
const LandingContent = dynamic(() => import("@/components/LandingContent"), { ssr: false });

const { Sider, Content } = Layout;
const { Text } = Typography;

const NAV_ROUTES = ["/chat", "/profile", "/path", "/resources", "/evaluation"] as const;
type NavRoute = (typeof NAV_ROUTES)[number];

const NAV_ITEMS: { key: NavRoute; icon: React.ReactNode; label: string; Component: React.ComponentType }[] = [
  { key: "/chat",       icon: <MessageOutlined />,   label: "智能对话", Component: ChatContent },
  { key: "/profile",    icon: <UserOutlined />,       label: "学习画像", Component: ProfileContent },
  { key: "/path",       icon: <ApartmentOutlined />,  label: "学习路径", Component: PathContent },
  { key: "/resources",  icon: <BookOutlined />,       label: "资源库",   Component: ResourcesContent },
  { key: "/evaluation", icon: <BarChartOutlined />,   label: "学习评估", Component: EvaluationContent },
];

export default function AppShell({ children: _children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // ── Auth state ────────────────────────────────────────────────────────────
  const isLoggedIn  = useAppStore((s) => s.isLoggedIn);
  const showLanding = useAppStore((s) => s.showLanding);
  const userName   = useAppStore((s) => s.userName);
  const courseName = useAppStore((s) => s.courseName);
  const logout     = useAppStore((s) => s.logout);

  // ── 登录后初始化加载进度 ────────────────────────────────────────────────────
  const [initProgress, setInitProgress] = useState(0);
  const [initDone,     setInitDone]     = useState(false);
  const [initFading,   setInitFading]   = useState(false); // 触发淡出动画

  // 规范化当前路由
  const selected: NavRoute = (NAV_ROUTES.includes(pathname as NavRoute) ? pathname : "/chat") as NavRoute;

  // ── Keep-alive：记录已经挂载过的页面，切换后不再卸载 ──────────────────────────
  const mountedRef = useRef<Set<NavRoute>>(new Set([selected]));
  const [mountedState, setMountedState] = useState<Set<NavRoute>>(() => new Set([selected]));

  useEffect(() => {
    if (!mountedRef.current.has(selected)) {
      mountedRef.current.add(selected);
      setMountedState(new Set(mountedRef.current));
    }
  }, [selected]);

  const menuItems: MenuProps["items"] = useMemo(
    () => NAV_ITEMS.map(({ key, icon, label }) => ({ key, icon, label })),
    []
  );

  // ── 登录后预热 API 缓存 + 进度追踪 ────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) {
      // 退出登录时重置进度，下次登录重新播放
      setInitProgress(0);
      setInitDone(false);
      setInitFading(false);
      return;
    }

    const { userId, profile, resources, learningPath, setProfile, setResources, setLearningPath, setResourceTitles } =
      useAppStore.getState();

    // ── 任务列表：页面 chunk + ECharts + API（全部并行，已缓存的立即 resolve）──
    const taskFns: Array<() => Promise<void>> = [
      // 5 个页面 JS chunk（已在登录页预加载则从模块缓存秒返回）
      () => import("@/components/pages/ChatContent").then(() => {}),
      () => import("@/components/pages/ProfileContent").then(() => {}),
      () => import("@/components/pages/PathContent").then(() => {}),
      () => import("@/components/pages/ResourcesContent").then(() => {}),
      () => import("@/components/pages/EvaluationContent").then(() => {}),
      // ECharts（同上）
      () => import("echarts").then(() => {}),
    ];

    // 3 个 API（数据未缓存时才真正请求）
    if (!profile) {
      taskFns.push(() => getProfile(userId).then((p) => { if (p) setProfile(p); }));
    }
    if (!resources.length) {
      taskFns.push(() =>
        listResources(userId).then((list) => {
          setResources(list);
          const titles: Record<string, string> = {};
          list.forEach((r) => { titles[r.id] = r.title; });
          setResourceTitles(titles);
        })
      );
    }
    if (!learningPath) {
      taskFns.push(() => getPath(userId).then((p) => { if (p) setLearningPath(p); }));
    }

    let done = 0;
    const total = taskFns.length;
    const tick = () => {
      done += 1;
      const pct = Math.round((done / total) * 100);
      setInitProgress(pct);
      if (done >= total) {
        setInitFading(true);
        setTimeout(() => setInitDone(true), 400);
      }
    };

    taskFns.forEach((fn) => { void fn().finally(tick); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const handleMenuClick = ({ key }: { key: string }) => {
    router.push(key);
  };

  // ── 未登录时：先显示落地页，点击登录后显示登录表单 ─────────────────────────
  if (!isLoggedIn) {
    return showLanding ? <LandingContent /> : <LoginContent />;
  }

  return (
    <>
      {/* ── 登录后初始化加载遮罩 ────────────────────────────────────────── */}
      {!initDone && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 28,
            opacity: initFading ? 0 : 1,
            transition: "opacity 0.38s ease",
            pointerEvents: initFading ? "none" : "auto",
          }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BulbOutlined style={{ fontSize: 36, color: "#1677ff" }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 26, color: "#1677ff", lineHeight: 1.2 }}>学径</div>
              <div style={{ fontSize: 12, color: "#8c8c8c" }}>LearnPath</div>
            </div>
          </div>

          {/* 进度条 */}
          <div style={{ width: 300 }}>
            <Progress
              percent={initProgress}
              strokeColor={{ "0%": "#1677ff", "100%": "#36cfc9" }}
              trailColor="#f0f0f0"
              showInfo={false}
              strokeWidth={6}
              style={{ display: "block" }}
            />
            <div
              style={{
                textAlign: "center",
                marginTop: 10,
                color: "#8c8c8c",
                fontSize: 13,
              }}
            >
              {initProgress < 100 ? `正在加载学习数据… ${initProgress}%` : "加载完成，即将进入 ✓"}
            </div>
          </div>
        </div>
      )}

      <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <Sider
        collapsed={collapsed}
        trigger={null}
        width={220}
        style={{ background: "#fff", borderRight: "1px solid #f0f0f0", height: "100vh", overflow: "hidden" }}
      >
        <Link
          href="/chat"
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            padding: collapsed ? "0 24px" : "0 20px",
            borderBottom: "1px solid #f0f0f0",
            gap: 10,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          <BulbOutlined style={{ fontSize: 22, color: "#1677ff", flexShrink: 0 }} />
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#1677ff", lineHeight: 1.2 }}>学径</div>
              <div style={{ fontSize: 11, color: "#8c8c8c" }}>LearnPath</div>
            </div>
          )}
        </Link>

        <Menu
          mode="inline"
          selectedKeys={[selected]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ flex: 1, border: "none", marginTop: 8 }}
        />

        <div style={{ borderTop: "1px solid #f0f0f0", padding: "12px 16px" }}>
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Avatar size={32} style={{ background: "#1677ff", flexShrink: 0 }}>
                {userName.charAt(0)}
              </Avatar>
              <div style={{ overflow: "hidden", flex: 1 }}>
                <Text strong style={{ fontSize: 13, display: "block" }}>{userName}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>{courseName}</Text>
              </div>
              <LogoutOutlined
                title="退出登录"
                onClick={logout}
                style={{ color: "#bfbfbf", cursor: "pointer", fontSize: 14, flexShrink: 0 }}
              />
            </div>
          )}
          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{ cursor: "pointer", color: "#8c8c8c", display: "flex", justifyContent: collapsed ? "center" : "flex-end" }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
        </div>
      </Sider>

      {/*
        Keep-alive 内容区：
        - 每个页面首次访问后永远保持挂载（mountedState 控制条件渲染）
        - 当前页面 display:flex，其余 display:none
        - 切换仅修改 CSS，无任何 React unmount/mount 开销，速度即时
      */}
      <Content
        style={{
          position: "relative",
          flex: 1,
          height: "100vh",
          overflow: "hidden",
          background: "#f5f7fa",
        }}
      >
        {NAV_ITEMS.map(({ key, Component }) => {
          if (!mountedState.has(key)) return null;
          const isActive = selected === key;
          return (
            <div
              key={key}
              style={{
                position: "absolute",
                inset: 0,
                overflowY: "auto",
                overflowX: "hidden",
                display: isActive ? "block" : "none",
                background: "#f5f7fa",
              }}
            >
              <Component />
            </div>
          );
        })}
      </Content>
    </Layout>
    </>
  );
}
