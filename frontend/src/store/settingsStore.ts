import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyThemeToDocument, resolveTheme } from "@/lib/theme";

export type ThemeMode = "light" | "dark" | "system";
export type VoicePreset = "female" | "male" | "off";
export type FontSizePreset = "normal" | "large";
export type StreamSpeed = "normal" | "fast";

export type AppSettings = {
  theme: ThemeMode;
  voice: VoicePreset;
  ttsEnabled: boolean;
  fontSize: FontSizePreset;
  streamSpeed: StreamSpeed;
  reduceMotion: boolean;
  deepThinking: boolean;
};

const DEFAULTS: AppSettings = {
  theme: "light",
  voice: "female",
  ttsEnabled: false,
  fontSize: "normal",
  streamSpeed: "normal",
  reduceMotion: false,
  deepThinking: false,
};

type SettingsState = AppSettings & {
  setSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setSettings: (patch) =>
        set((s) => {
          const next = { ...s, ...patch };
          if (patch.theme !== undefined) {
            applyThemeToDocument(resolveTheme(patch.theme), next.fontSize);
          } else if (patch.fontSize !== undefined) {
            applyThemeToDocument(resolveTheme(next.theme), patch.fontSize);
          }
          return next;
        }),
      resetSettings: () => {
        applyThemeToDocument(resolveTheme(DEFAULTS.theme), DEFAULTS.fontSize);
        set({ ...DEFAULTS });
      },
    }),
    {
      name: "learnpath-settings-v1",
      partialize: (s) => ({
        theme: s.theme,
        voice: s.voice,
        ttsEnabled: s.ttsEnabled,
        fontSize: s.fontSize,
        streamSpeed: s.streamSpeed,
        reduceMotion: s.reduceMotion,
        deepThinking: s.deepThinking,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyThemeToDocument(resolveTheme(state.theme), state.fontSize);
        }
      },
    }
  )
);

export { resolveTheme } from "@/lib/theme";
