import { getEvalStats } from "@/lib/api";
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
  const { userId, evalStats, setEvalStats } = useAppStore.getState();
  const tasks: Promise<unknown>[] = [
    import("@/components/pages/DataInsightsContent"),
    preloadEcharts().then(() => prewarmEchartsEngine()),
  ];
  if (!evalStats) {
    tasks.push(
      getEvalStats(userId)
        .then(setEvalStats)
        .catch(() => {})
    );
  }
  await Promise.all(tasks);
}
