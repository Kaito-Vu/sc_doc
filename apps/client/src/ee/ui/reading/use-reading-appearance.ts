import { useLayoutEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useComputedColorScheme } from "@mantine/core";
import { useLocation } from "react-router-dom";
import {
  DEFAULT_READING_PREFERENCES,
  readingFontFeatures,
  readingPreferencesAtom,
  resolveReadingFont,
  resolveReadingPalette,
  resolveReadingWidth,
  updateReadingPreferencesAtom,
} from "./reading-preferences";

const DOCUMENT_PATH_PREFIXES = ["/p/", "/share/", "/docs/", "/base/"];

function hasDocumentSurface(pathname: string): boolean {
  return DOCUMENT_PATH_PREFIXES.some((prefix) => pathname.includes(prefix));
}

export function useReadingPreferences() {
  const preferences = useAtomValue(readingPreferencesAtom);
  const update = useSetAtom(updateReadingPreferencesAtom);
  const setPreferences = useSetAtom(readingPreferencesAtom);

  return {
    preferences,
    update,
    reset: () => setPreferences(DEFAULT_READING_PREFERENCES),
  };
}

export function useApplyReadingAppearance() {
  const preferences = useAtomValue(readingPreferencesAtom);
  const colorScheme = useComputedColorScheme("light");
  const location = useLocation();
  const isDocumentSurface = hasDocumentSurface(location.pathname);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const font = resolveReadingFont(preferences.font);
    const palette = resolveReadingPalette(preferences.theme, colorScheme);

    root.style.setProperty("--sc-read-font", font.stack);
    root.style.setProperty("--sc-read-size", `${preferences.fontSize}px`);
    root.style.setProperty(
      "--sc-read-leading",
      String(preferences.lineHeight),
    );
    root.style.setProperty(
      "--sc-read-tracking",
      `${preferences.letterSpacing}em`,
    );
    root.style.setProperty(
      "--sc-read-features",
      readingFontFeatures(preferences.disambiguate),
    );
    root.style.setProperty("--sc-read-bg", palette.bg);
    root.style.setProperty("--sc-read-fg", palette.fg);
    root.style.setProperty("--sc-reading-width", resolveReadingWidth(preferences.width));

    document.body.dataset.scReadingSurface = isDocumentSurface ? "on" : "off";
  }, [preferences, colorScheme, isDocumentSurface]);
}
