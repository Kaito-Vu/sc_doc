import { useEffect } from "react";
import { buildCounterCss, NumberingSettings } from "@docmost/editor-ext";

const STYLE_ELEMENT_ID = "numbering-style";

export function useNumberingStyle(
  settings: NumberingSettings | null | undefined,
): void {
  useEffect(() => {
    if (!settings || !settings.enabled) {
      document.getElementById(STYLE_ELEMENT_ID)?.remove();
      return;
    }

    let styleEl = document.getElementById(
      STYLE_ELEMENT_ID,
    ) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ELEMENT_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = buildCounterCss(settings);

    return () => {
      document.getElementById(STYLE_ELEMENT_ID)?.remove();
    };
  }, [settings]);
}
