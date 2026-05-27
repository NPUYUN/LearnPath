import type { EvalStats, LearningPath, StudentProfile } from "@/lib/api";
import { pathProgress } from "@/lib/navMeta";

export type Achievement = {
  id: string;
  title: string;
  desc: string;
  emoji: string;
  unlocked: boolean;
  tier: "bronze" | "silver" | "gold";
};

export type InsightSummary = {
  xp: number;
  level: number;
  levelTitle: string;
  levelProgress: number;
  nextLevelXp: number;
  percentile: number;
  pathPct: number;
  chatCount: number;
  userMsgCount: number;
  avgGrowth: number;
  achievements: Achievement[];
  unlockedCount: number;
};

const LEVELS = [
  { level: 1, title: "新手学徒", min: 0 },
  { level: 2, title: "勤学者", min: 120 },
  { level: 3, title: "进阶探索者", min: 280 },
  { level: 4, title: "学霸候选人", min: 480 },
  { level: 5, title: "学径大师", min: 720 },
];

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeInsights(input: {
  stats: EvalStats | null;
  learningPath: LearningPath | null;
  profile: StudentProfile | null;
  chatCount: number;
  userMsgCount: number;
}): InsightSummary {
  const { stats, learningPath, chatCount, userMsgCount } = input;
  const pathPct = pathProgress(learningPath?.steps);
  const profilePct = stats?.profile_completeness ?? 0;
  const resources = stats?.total_resources ?? 0;
  const studyDays = stats?.study_days ?? 0;
  const hasPath = stats?.has_path ?? Boolean(learningPath?.steps?.length);

  const before = stats?.radar.before ?? [];
  const after = stats?.radar.after ?? [];
  const avgGrowth =
    before.length && after.length
      ? Math.round(avg(after.map((v, i) => v - (before[i] ?? 0))) * 10) / 10
      : 0;

  const xp = Math.round(
    profilePct * 2 +
      resources * 18 +
      studyDays * 22 +
      pathPct * 4 +
      (hasPath ? 60 : 0) +
      userMsgCount * 3 +
      Math.max(0, avgGrowth) * 8
  );

  let level = 1;
  let levelTitle = LEVELS[0].title;
  for (const row of LEVELS) {
    if (xp >= row.min) {
      level = row.level;
      levelTitle = row.title;
    }
  }
  const currentMin = LEVELS[level - 1]?.min ?? 0;
  const nextMin = LEVELS[level]?.min ?? currentMin + 200;
  const levelProgress =
    level >= LEVELS.length
      ? 100
      : Math.min(100, Math.round(((xp - currentMin) / (nextMin - currentMin)) * 100));

  const percentile = Math.min(
    99,
    Math.max(
      5,
      Math.round(
        18 +
          profilePct * 0.35 +
          pathPct * 0.25 +
          Math.min(studyDays, 21) * 1.8 +
          Math.min(resources, 15) * 2.2 +
          Math.min(userMsgCount, 30) * 0.6
      )
    )
  );

  const achievements: Achievement[] = [
    {
      id: "first_chat",
      title: "初次对话",
      desc: "与 AI 助手完成首次交流",
      emoji: "💬",
      unlocked: userMsgCount >= 1,
      tier: "bronze",
    },
    {
      id: "profile_seed",
      title: "画像初成",
      desc: "学习画像完整度达 30%",
      emoji: "🌱",
      unlocked: profilePct >= 30,
      tier: "bronze",
    },
    {
      id: "profile_master",
      title: "画像达人",
      desc: "学习画像完整度达 80%",
      emoji: "🎯",
      unlocked: profilePct >= 80,
      tier: "gold",
    },
    {
      id: "path_planner",
      title: "路径规划师",
      desc: "生成专属学习路径",
      emoji: "🗺️",
      unlocked: hasPath,
      tier: "silver",
    },
    {
      id: "path_complete",
      title: "路径征服者",
      desc: "完成全部路径节点",
      emoji: "🏁",
      unlocked: pathPct >= 100 && hasPath,
      tier: "gold",
    },
    {
      id: "resource_collector",
      title: "资源收藏家",
      desc: "累计生成 5 个学习资源",
      emoji: "📚",
      unlocked: resources >= 5,
      tier: "silver",
    },
    {
      id: "resource_master",
      title: "资源大师",
      desc: "累计生成 10 个学习资源",
      emoji: "📖",
      unlocked: resources >= 10,
      tier: "gold",
    },
    {
      id: "study_streak",
      title: "坚持学习",
      desc: "累计学习 3 天",
      emoji: "🔥",
      unlocked: studyDays >= 3,
      tier: "bronze",
    },
    {
      id: "study_warrior",
      title: "学习狂人",
      desc: "累计学习 7 天",
      emoji: "⚡",
      unlocked: studyDays >= 7,
      tier: "gold",
    },
    {
      id: "growth_star",
      title: "成长之星",
      desc: "综合能力较初始提升 10 分",
      emoji: "📈",
      unlocked: avgGrowth >= 10,
      tier: "silver",
    },
    {
      id: "chat_master",
      title: "对话达人",
      desc: "发送 20 条以上学习消息",
      emoji: "🤖",
      unlocked: userMsgCount >= 20,
      tier: "silver",
    },
    {
      id: "all_rounder",
      title: "全能学员",
      desc: "画像、路径、资源三项齐备",
      emoji: "🏆",
      unlocked: profilePct >= 50 && hasPath && resources >= 3,
      tier: "gold",
    },
  ];

  return {
    xp,
    level,
    levelTitle,
    levelProgress,
    nextLevelXp: nextMin,
    percentile,
    pathPct,
    chatCount,
    userMsgCount,
    avgGrowth,
    achievements,
    unlockedCount: achievements.filter((a) => a.unlocked).length,
  };
}
