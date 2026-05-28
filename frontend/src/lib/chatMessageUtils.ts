/** 判断助手回复是否视为生成失败（可重新生成） */
export function isFailedAssistantReply(content: string): boolean {
  const t = (content || "").trim();
  if (!t) return true;
  if (t.startsWith("⚠️")) return true;
  const markers = [
    "暂时无法获取回复",
    "暂时无法生成回复",
    "连接失败",
    "未收到助手回复",
    "LLM 未返回",
    "智能体未返回",
    "智能体调用失败",
    "对话生成结果为空",
    "所有 LLM 通道均失败",
  ];
  return markers.some((m) => t.includes(m));
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const plain = (text || "").trim();
  if (!plain) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(plain);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = plain;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
