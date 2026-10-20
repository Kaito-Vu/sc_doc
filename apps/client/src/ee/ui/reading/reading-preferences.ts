import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type ReadingFontId = "inter" | "system" | "serif" | "mono";
export type ReadingThemeId =
  | "auto"
  | "paper"
  | "sepia"
  | "sage"
  | "mist"
  | "contrast";
export type ReadingWidthId = "comfortable" | "standard" | "wide";

export interface ReadingPreferences {
  font: ReadingFontId;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  theme: ReadingThemeId;
  disambiguate: boolean;
  width: ReadingWidthId;
}

export interface ReadingFontOption {
  id: ReadingFontId;
  label: string;
  stack: string;
}

export interface ReadingPalette {
  bg: string;
  fg: string;
}

export interface ReadingThemeOption {
  id: ReadingThemeId;
  label: string;
  light: ReadingPalette;
  dark: ReadingPalette;
}

export interface ReadingWidthOption {
  id: ReadingWidthId;
  label: string;
  value: string;
}

export const READING_FONTS: ReadingFontOption[] = [
  {
    id: "inter",
    label: "Inter (recommended)",
    stack:
      '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  {
    id: "system",
    label: "System sans-serif",
    stack:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: "serif",
    label: "Serif",
    stack:
      'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif',
  },
  {
    id: "mono",
    label: "Monospace",
    stack:
      '"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
];

export const READING_THEMES: ReadingThemeOption[] = [
  {
    id: "auto",
    label: "Theme default",
    light: { bg: "var(--mantine-color-body)", fg: "var(--mantine-color-text)" },
    dark: { bg: "var(--mantine-color-body)", fg: "var(--mantine-color-text)" },
  },
  {
    id: "paper",
    label: "Warm paper",
    light: { bg: "#fbf7ef", fg: "#2b2620" },
    dark: { bg: "#1e1b17", fg: "#ede6da" },
  },
  {
    id: "sepia",
    label: "Sepia",
    light: { bg: "#f4e8d0", fg: "#3b2f1e" },
    dark: { bg: "#2a2318", fg: "#f0e2c8" },
  },
  {
    id: "sage",
    label: "Sage",
    light: { bg: "#edf4ec", fg: "#233326" },
    dark: { bg: "#172018", fg: "#ddebdd" },
  },
  {
    id: "mist",
    label: "Soft mist",
    light: { bg: "#f1f4f8", fg: "#222b36" },
    dark: { bg: "#14181d", fg: "#dde6f0" },
  },
  {
    id: "contrast",
    label: "High contrast",
    light: { bg: "#ffffff", fg: "#111111" },
    dark: { bg: "#000000", fg: "#ffffff" },
  },
];

export const READING_WIDTHS: ReadingWidthOption[] = [
  {
    id: "comfortable",
    label: "Comfortable",
    value: "min(820px, 100% - 4rem)",
  },
  {
    id: "standard",
    label: "Standard",
    value: "min(1200px, 100% - 10rem)",
  },
  {
    id: "wide",
    label: "Wide",
    value: "min(1440px, 100% - 6rem)",
  },
];

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  font: "inter",
  fontSize: 16,
  lineHeight: 1.75,
  letterSpacing: 0,
  theme: "auto",
  disambiguate: true,
  width: "standard",
};

const STORAGE_KEY = "sc.reading-appearance.v1";

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

export function normalizeReadingPreferences(
  value: unknown,
): ReadingPreferences {
  const stored = (value ?? {}) as Partial<ReadingPreferences>;

  return {
    font: READING_FONTS.some((font) => font.id === stored.font)
      ? (stored.font as ReadingFontId)
      : DEFAULT_READING_PREFERENCES.font,
    fontSize: clampNumber(
      stored.fontSize,
      14,
      24,
      DEFAULT_READING_PREFERENCES.fontSize,
    ),
    lineHeight: clampNumber(
      stored.lineHeight,
      1.3,
      2.2,
      DEFAULT_READING_PREFERENCES.lineHeight,
    ),
    letterSpacing: clampNumber(
      stored.letterSpacing,
      -0.02,
      0.08,
      DEFAULT_READING_PREFERENCES.letterSpacing,
    ),
    theme: READING_THEMES.some((theme) => theme.id === stored.theme)
      ? (stored.theme as ReadingThemeId)
      : DEFAULT_READING_PREFERENCES.theme,
    disambiguate:
      typeof stored.disambiguate === "boolean"
        ? stored.disambiguate
        : DEFAULT_READING_PREFERENCES.disambiguate,
    width: READING_WIDTHS.some((width) => width.id === stored.width)
      ? (stored.width as ReadingWidthId)
      : DEFAULT_READING_PREFERENCES.width,
  };
}

export function resolveReadingFont(fontId: ReadingFontId): ReadingFontOption {
  return (
    READING_FONTS.find((font) => font.id === fontId) ?? READING_FONTS[0]
  );
}

export function resolveReadingPalette(
  themeId: ReadingThemeId,
  colorScheme: "light" | "dark",
): ReadingPalette {
  const theme =
    READING_THEMES.find((option) => option.id === themeId) ?? READING_THEMES[0];
  return colorScheme === "dark" ? theme.dark : theme.light;
}

export function resolveReadingWidth(widthId: ReadingWidthId): string {
  const width =
    READING_WIDTHS.find((option) => option.id === widthId) ?? READING_WIDTHS[1];
  return width.value;
}

export function readingFontFeatures(disambiguate: boolean): string {
  return disambiguate
    ? '"cv05" 1, "cv08" 1, "zero" 1'
    : '"cv05" 0, "cv08" 0, "zero" 0';
}

export const readingPreferencesStorageAtom = atomWithStorage<ReadingPreferences>(
  STORAGE_KEY,
  DEFAULT_READING_PREFERENCES,
  undefined,
  { getOnInit: true },
);

export const readingPreferencesAtom = atom(
  (get) => normalizeReadingPreferences(get(readingPreferencesStorageAtom)),
  (_get, set, next: ReadingPreferences) =>
    set(readingPreferencesStorageAtom, normalizeReadingPreferences(next)),
);

export const updateReadingPreferencesAtom = atom(
  null,
  (get, set, patch: Partial<ReadingPreferences>) => {
    const current = normalizeReadingPreferences(get(readingPreferencesStorageAtom));
    set(readingPreferencesStorageAtom, { ...current, ...patch });
  },
);
