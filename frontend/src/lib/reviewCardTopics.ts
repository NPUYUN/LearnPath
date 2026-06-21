/** 从路径/资源标题提取「大主题」，供复习卡联想（不含复习/测验等子类型后缀）。 */

const STRIP_SUFFIXES = [
  "个性化讲解文档",
  "思维导图",
  "练习测验",
  "多模态讲解",
  "拓展阅读",
  "代码案例",
  "专属复习卡",
  "复习速览",
  "复习卡片",
  "复习测验",
  "复习",
  "测验",
  "理解",
  "概览",
  "讲解",
  "梳理",
  "导论",
  "开篇",
  "练习",
  "测试",
  "巩固",
];

const NOISE_WORDS = new Set([
  "机器学习",
  "学习",
  "阶段",
  "步骤",
  "资源",
  "文档",
  "题库",
]);

function stripSuffix(text: string): string {
  let value = text.trim();
  for (const suffix of STRIP_SUFFIXES) {
    if (value.endsWith(suffix) && value.length > suffix.length + 1) {
      value = value.slice(0, -suffix.length).trim();
    }
  }
  return value;
}

/** 单条标题 → 大主题 */
export function toMajorReviewTopic(raw: string): string {
  let text = String(raw || "").trim();
  if (!text) return "";

  text = text.split("·")[0].split("-")[0].split("—")[0].trim();
  text = stripSuffix(text);

  // 「梯度下降理解」→「梯度下降」
  if (text.endsWith("理解") && text.length > 3) {
    text = text.slice(0, -2).trim();
  }

  return text.trim();
}

/** 复习卡归属的大主题（用于文件夹分组） */
export function getReviewCardTopicKey(card: { topic?: string; title?: string }): string {
  const fromTopic = toMajorReviewTopic(card.topic || "");
  if (fromTopic) return fromTopic;
  const fromTitle = toMajorReviewTopic(card.title || "");
  return fromTitle || "未分类";
}

/** 批量提取去重的大主题，按长度与常见度排序 */
export function collectMajorReviewTopics(sources: string[]): string[] {
  const counts = new Map<string, number>();

  for (const raw of sources) {
    const major = toMajorReviewTopic(raw);
    if (!major || major.length < 2 || major.length > 24) continue;
    if (NOISE_WORDS.has(major)) continue;
    counts.set(major, (counts.get(major) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .map(([topic]) => topic)
    .slice(0, 20);
}
