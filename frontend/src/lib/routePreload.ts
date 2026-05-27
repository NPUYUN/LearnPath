import { getAccount, getChatHistory, getEvalStats } from "@/lib/api";
import { prewarmEchartsEngine, preloadEcharts } from "@/lib/useEcharts";
import type { StandaloneRoute } from "@/hooks/navRoutes";
import { useAppStore } from "@/store/appStore";

/** 独立页预加载任务 */
export async function preloadStandaloneRoute(route: StandaloneRoute): Promise<void> {
  switch (route) {
    case "/insights":
      await preloadInsights();
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
    preloadAccountIfNeeded(),
  ]);
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
