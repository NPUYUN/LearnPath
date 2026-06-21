const REGEN_ARTIFACT_MARKERS = [
  "请原地重新生成",
  "用户选择的修改方向",
  "用户补充要求",
  "保持资源类型不变",
  "本次重生成要求",
];

export function isRegenerationArtifact(text: string | undefined | null): boolean {
  const value = String(text || "").trim();
  if (!value) return false;
  return REGEN_ARTIFACT_MARKERS.some((marker) => value.includes(marker));
}

export function cleanResourceDisplayLabels(labels: Array<string | undefined | null>): string[] {
  return labels
    .map((label) => String(label || "").trim())
    .filter((label) => label && !isRegenerationArtifact(label));
}
