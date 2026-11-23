import { useAtom } from "jotai";
import { savedSearchViewsAtom, type SavedSearchView } from "../atoms";

type Current = Omit<SavedSearchView, "id" | "name">;

export function useSavedViews() {
  const [storedViews, setViews] = useAtom(savedSearchViewsAtom);
  const views = Array.isArray(storedViews) ? storedViews : [];

  /** Returns false (no-op) when the name is blank. */
  const saveView = (rawName: string, current: Current): boolean => {
    const name = rawName.trim();
    if (!name) return false;
    const view: SavedSearchView = { id: `${Date.now()}`, name, ...current };
    setViews((prev) =>
      [view, ...(Array.isArray(prev) ? prev : [])].slice(0, 12),
    );
    return true;
  };

  const removeView = (id: string) => {
    setViews((prev) =>
      (Array.isArray(prev) ? prev : []).filter((view) => view.id !== id),
    );
  };

  return { views, saveView, removeView };
}
