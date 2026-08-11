import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useNumberingStyle } from "./use-numbering-style";
import { DEFAULT_NUMBERING_SETTINGS } from "@docmost/editor-ext";

afterEach(() => {
  cleanup();
  document.getElementById("numbering-style")?.remove();
});

describe("useNumberingStyle", () => {
  it("injects a style tag containing the generated counter CSS", () => {
    renderHook(() => useNumberingStyle(DEFAULT_NUMBERING_SETTINGS));
    const style = document.getElementById("numbering-style");
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain("numbering-level-1");
  });

  it("removes the style tag when settings are null", () => {
    const { rerender } = renderHook(
      ({ settings }) => useNumberingStyle(settings),
      { initialProps: { settings: DEFAULT_NUMBERING_SETTINGS as any } },
    );
    expect(document.getElementById("numbering-style")).not.toBeNull();

    rerender({ settings: null });
    expect(document.getElementById("numbering-style")).toBeNull();
  });
});
