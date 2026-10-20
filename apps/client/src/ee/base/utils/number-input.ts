import type { ClipboardEvent, ChangeEvent } from "react";

export function sanitizeNumberInput(text: string): string {
  return text.replace(/[^0-9.-]/g, "");
}

/** onChange/onPaste handlers for a text input that only accepts a number draft. */
export function numberInputProps(
  draft: string,
  setDraft: (value: string) => void,
) {
  return {
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) {
        setDraft(v);
      }
    },
    onPaste: (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? draft.length;
      const end = el.selectionEnd ?? draft.length;
      setDraft(
        draft.slice(0, start) +
          sanitizeNumberInput(e.clipboardData.getData("text")) +
          draft.slice(end),
      );
    },
  };
}
