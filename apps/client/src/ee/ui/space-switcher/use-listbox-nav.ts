import { useCallback, useEffect, useState } from "react";

/**
 * Keyboard model for a listbox whose focus stays in a search input (aria-activedescendant).
 * Handles Up/Down/Home/End (clamped, no wrap) and Enter; keeps the active option scrolled into view.
 */
export function useListboxNav<T extends { key: string }>({
  options,
  getDomId,
  onEnter,
}: {
  options: T[];
  getDomId: (option: T) => string;
  onEnter?: (option: T, e: React.KeyboardEvent) => void;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = options.find((o) => o.key === activeKey) ?? options[0];
  const activeIndex = active ? options.indexOf(active) : -1;

  useEffect(() => {
    if (active) {
      document
        .getElementById(getDomId(active))
        ?.scrollIntoView({ block: "nearest" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key]);

  const move = (to: number) => {
    if (options.length) {
      setActiveKey(options[Math.max(0, Math.min(options.length - 1, to))].key);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return move(activeIndex + 1);
      case "ArrowUp":
        e.preventDefault();
        return move(activeIndex - 1);
      case "Home":
        e.preventDefault();
        return move(0);
      case "End":
        e.preventDefault();
        return move(options.length - 1);
      case "Enter":
        e.preventDefault();
        if (active) onEnter?.(active, e);
    }
  };

  return {
    active,
    setActiveKey,
    reset: useCallback(() => setActiveKey(null), []),
    onKeyDown,
  };
}
