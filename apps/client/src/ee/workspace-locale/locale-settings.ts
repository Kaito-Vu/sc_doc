import api from "@/lib/api-client";

export const LOCALE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español (Spanish)" },
  { value: "de-DE", label: "Deutsch (German)" },
  { value: "fr-FR", label: "Français (French)" },
  { value: "nl-NL", label: "Dutch (Netherlands)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "it-IT", label: "Italiano (Italian)" },
  { value: "ja-JP", label: "日本語 (Japanese)" },
  { value: "ko-KR", label: "한국어 (Korean)" },
  { value: "uk-UA", label: "Українська (Ukrainian)" },
  { value: "ru-RU", label: "Русский (Russian)" },
  { value: "zh-CN", label: "中文 (简体)" },
  { value: "vi-VN", label: "Tiếng Việt (Vietnamese)" },
];

export type WorkspaceLocaleSettings = {
  defaultLocale?: string;
  forceLocale?: boolean;
};

// Returns the full workspace settings object after the update.
export async function updateWorkspaceLocale(
  data: WorkspaceLocaleSettings,
): Promise<Record<string, any>> {
  const req = await api.post("/workspace-locale/update", data);
  return req.data;
}
