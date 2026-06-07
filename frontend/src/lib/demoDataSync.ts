/** 演示账号清空 / 重置后同步前端状态 */

import {
  getAccount,
  getEvalStats,
  getPath,
  getProfile,
  listResources,
} from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import { useSettingsStore } from "@/store/settingsStore";

export const DEMO_DATA_CHANGED_EVENT = "learnpath-demo-data-changed";

export function notifyDemoDataChanged(action: "clear" | "reset") {
  window.dispatchEvent(
    new CustomEvent(DEMO_DATA_CHANGED_EVENT, { detail: { action } })
  );
}

export function applyDemoClearToStore() {
  const store = useAppStore.getState();
  store.setProfile(null);
  store.setResources([]);
  store.setLearningPath(null);
  store.setResourceTitles({});
  store.setEvalStats(null);
  store.setAccount(null);
  store.setInsightsChat(null);
  store.setPendingResourcePreviewId(null);
  store.setUserMeta({
    userName: "演示学生",
    courseName: "机器学习导论",
    userEmail: "demo@learnpath.local",
  });
  useSettingsStore.getState().resetSettings();
}

export async function reloadDemoDataToStore(userId: string) {
  useSettingsStore.getState().resetSettings();
  const store = useAppStore.getState();
  store.setUserMeta({
    userName: "演示学生",
    courseName: "机器学习导论",
    userEmail: "demo@learnpath.local",
  });

  const [profile, resources, path, stats, account] = await Promise.all([
    getProfile(userId).catch(() => null),
    listResources(userId).catch(() => []),
    getPath(userId).catch(() => null),
    getEvalStats(userId).catch(() => null),
    getAccount(userId).catch(() => null),
  ]);

  store.setProfile(profile);
  store.setResources(resources);
  store.setLearningPath(path);
  store.setEvalStats(stats);
  store.setAccount(account);
  const titles: Record<string, string> = {};
  resources.forEach((r) => {
    titles[r.id] = r.title;
  });
  store.setResourceTitles(titles);
  if (account) {
    store.setUserMeta({
      userName: account.display_name,
      courseName: account.course_name,
      userEmail: account.email,
    });
  }
}
