import { getAccount, getAdminActivity, getAdminDashboard, getAdminResources, getAdminUsers, getChatHistory, getEvalStats } from "@/lib/api";
import { prewarmEchartsEngine, preloadEcharts } from "@/lib/useEcharts";
import type { StandaloneRoute } from "@/hooks/navRoutes";
import { useAppStore } from "@/store/appStore";

function scheduleIdleTask(task: () => void, timeout = 1200): void {
  if (typeof globalThis === "undefined" || typeof window === "undefined") {
    task();
    return;
  }
  const runner = () => task();
  const maybeIdleCallback = (window as typeof window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  }).requestIdleCallback;
  if (typeof maybeIdleCallback === "function") {
    maybeIdleCallback(runner, { timeout });
    return;
  }
  globalThis.setTimeout(runner, 180);
}

/** 独立页预加载任务 */
export async function preloadStandaloneRoute(route: StandaloneRoute): Promise<void> {
  switch (route) {
    case "/insights":
      await preloadInsights();
      break;
    case "/classroom":
      await import("@/components/pages/ClassroomContent");
      break;
    default:
      break;
  }
}

async function preloadInsights(): Promise<void> {
  const {
    userId,
    evalStats,
    account,
    insightsChat,
    setEvalStats,
    setAccount,
    setInsightsChat,
  } = useAppStore.getState();

  const tasks: Promise<unknown>[] = [
    import("@/components/pages/DataInsightsContent"),
    import("@/components/InsightsArenaBackground"),
    preloadEcharts().then(() => prewarmEchartsEngine()),
  ];

  if (!evalStats) {
    tasks.push(
      getEvalStats(userId)
        .then(setEvalStats)
        .catch(() => {})
    );
  }

  if (!account) {
    tasks.push(
      getAccount(userId)
        .then(setAccount)
        .catch(() => {})
    );
  }

  if (!insightsChat) {
    tasks.push(
      getChatHistory(userId)
        .then((history) => {
          setInsightsChat({
            chatCount: history.length,
            userMsgCount: history.filter((m) => m.role === "user").length,
          });
        })
        .catch(() => {})
    );
  }

  await Promise.all(tasks);
}

/** 登录后预热：资料库账号 + 成就馆数据与模块 */
export async function preloadLoggedInExtras(): Promise<void> {
  await Promise.all([
    preloadStandaloneRoute("/insights"),
    preloadStandaloneRoute("/classroom"),
    preloadAccountIfNeeded(),
  ]);
}

/** 登录后非关键模块改为空闲期预热，避免阻塞主应用首轮进入。 */
export function preloadLoggedInExtrasInBackground(): void {
  scheduleIdleTask(() => {
    void preloadLoggedInExtras().catch(() => {});
  });
}

async function preloadAccountIfNeeded(): Promise<void> {
  const { userId, account, setAccount } = useAppStore.getState();
  if (account) return;
  try {
    const data = await getAccount(userId);
    setAccount(data);
  } catch {
    /* 个人主页内会重试 */
  }
}

/** 管理员登录后预热：统计接口 + 图表引擎（页面模块由 AppShell 单独加载） */
export async function preloadAdminConsole(): Promise<void> {
  await Promise.all([
    preloadEcharts().then(() => prewarmEchartsEngine()),
    getAdminDashboard().catch(() => {}),
    getAdminUsers().catch(() => {}),
    getAdminResources().catch(() => {}),
    getAdminActivity().catch(() => {}),
  ]);
}
