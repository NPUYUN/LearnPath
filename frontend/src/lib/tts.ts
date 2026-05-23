import { speakTts } from "@/lib/api";

export async function playAssistantSpeech(
  text: string,
  voice: "female" | "male" | "off"
): Promise<void> {
  const plain = text.replace(/[#*`_~[\]()]/g, " ").slice(0, 800);
  if (!plain.trim() || voice === "off") return;

  try {
    const res = await speakTts(plain, voice);
    if (res.audio_base64 && res.provider === "spark") {
      const audio = new Audio(`data:audio/${res.format};base64,${res.audio_base64}`);
      await audio.play();
      return;
    }
  } catch {
    /* fallback */
  }

  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain);
  u.lang = "zh-CN";
  u.rate = 1;
  u.pitch = voice === "male" ? 0.85 : 1.05;
  window.speechSynthesis.speak(u);
}
