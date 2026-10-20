import { describe, expect, it } from "vitest";
import {
  DEFAULT_READING_PREFERENCES,
  normalizeReadingPreferences,
  readingFontFeatures,
  resolveReadingPalette,
  resolveReadingWidth,
} from "./reading-preferences";

describe("reading preferences", () => {
  it("falls back to defaults for unknown values", () => {
    const result = normalizeReadingPreferences({
      font: "unknown",
      theme: "unknown",
      width: "unknown",
      fontSize: "large",
      lineHeight: null,
      letterSpacing: undefined,
      disambiguate: "yes",
    });

    expect(result).toEqual(DEFAULT_READING_PREFERENCES);
  });

  it("clamps numeric values to safe ranges", () => {
    const result = normalizeReadingPreferences({
      fontSize: 99,
      lineHeight: 0.1,
      letterSpacing: 10,
    });

    expect(result.fontSize).toBe(24);
    expect(result.lineHeight).toBe(1.3);
    expect(result.letterSpacing).toBe(0.08);
  });

  it("keeps valid stored values", () => {
    const result = normalizeReadingPreferences({
      font: "serif",
      theme: "sepia",
      width: "comfortable",
      fontSize: 18,
      lineHeight: 1.9,
      letterSpacing: 0.02,
      disambiguate: false,
    });

    expect(result).toEqual({
      font: "serif",
      theme: "sepia",
      width: "comfortable",
      fontSize: 18,
      lineHeight: 1.9,
      letterSpacing: 0.02,
      disambiguate: false,
    });
  });

  it("resolves light and dark palettes", () => {
    expect(resolveReadingPalette("paper", "light")).toEqual({
      bg: "#fbf7ef",
      fg: "#2b2620",
    });
    expect(resolveReadingPalette("paper", "dark")).toEqual({
      bg: "#1e1b17",
      fg: "#ede6da",
    });
  });

  it("enables Inter disambiguation features by default", () => {
    expect(readingFontFeatures(true)).toContain('"cv05" 1');
    expect(readingFontFeatures(true)).toContain('"cv08" 1');
    expect(readingFontFeatures(true)).toContain('"zero" 1');
    expect(readingFontFeatures(false)).toContain('"cv05" 0');
  });

  it("resolves reading widths", () => {
    expect(resolveReadingWidth("comfortable")).toContain("820px");
    expect(resolveReadingWidth("standard")).toContain("1200px");
    expect(resolveReadingWidth("wide")).toContain("1440px");
  });
});
