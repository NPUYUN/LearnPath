import type { LearningResource } from "@/lib/api";

export type GenerationMode = "library" | "library+web" | "web" | "";

export function inferGenerationMode(resource: LearningResource): GenerationMode {
  const mode = (resource.generation_mode || "") as GenerationMode;
  if (mode) return mode;
  const sources = resource.sources || [];
  if (sources.some((s) => String(s).startsWith("检索:"))) return "web";
  if (sources.includes("全网补充检索")) return "library+web";
  if (resource.library_id || resource.library_name) return "library";
  if (sources.length > 0) return "library";
  return "web";
}

export function generationSourceMeta(resource: LearningResource): {
  label: string;
  color: string;
  short: string;
} {
  const mode = inferGenerationMode(resource);
  const libName = resource.library_name?.trim();

  if (mode === "library") {
    const label = libName ? `资料库 · ${libName}` : "资料库生成";
    return { label, color: "blue", short: "资料库" };
  }
  if (mode === "library+web") {
    const label = libName ? `资料库+联网 · ${libName}` : "资料库 + 联网补充";
    return { label, color: "cyan", short: "库+联网" };
  }
  return { label: "联网检索生成", color: "purple", short: "联网" };
}
