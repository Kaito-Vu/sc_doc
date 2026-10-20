export const SUPPORTED_LOCALES = ["en-US", "vi-VN"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

export const LOCALE_OPTIONS: Array<{ value: SupportedLocale; label: string }> = [
  { value: "en-US", label: "English (US)" },
  { value: "vi-VN", label: "Tiếng Việt (Vietnamese)" },
];

export function normalizeLocale(value?: string | null): SupportedLocale {
  if (!value) return DEFAULT_LOCALE;
  if (value === "en") return "en-US";
  return SUPPORTED_LOCALES.includes(value as SupportedLocale)
    ? (value as SupportedLocale)
    : DEFAULT_LOCALE;
}
