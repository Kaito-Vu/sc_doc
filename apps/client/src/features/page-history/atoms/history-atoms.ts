import { atom } from "jotai";

export const CURRENT_VERSION_ID = "current";

export const historyAtoms = atom<boolean>(false);
// the revision currently open in the reading pane
export const activeHistoryIdAtom = atom<string>("");
// the "other side" of the comparison; defaults to the adjacent previous
// revision but can be set explicitly to compare any two arbitrary revisions
export const compareWithIdAtom = atom<string>("");
// kept as an alias for compareWithIdAtom for backward compatibility
export const activeHistoryPrevIdAtom = compareWithIdAtom;
export const highlightChangesAtom = atom<boolean>(true);
export const viewOnlyModeAtom = atom<boolean>(false);

// "Compare" tab in the history list: when active, rows render a checkbox
// instead of the normal click-to-view behavior, and the user picks exactly
// two revisions (in any order) before confirming the comparison.
export const compareModeAtom = atom<boolean>(false);
export const compareSelectionAtom = atom<string[]>([]);

export type DiffViewMode = "inline" | "side-by-side";
export const diffViewModeAtom = atom<DiffViewMode>("inline");

export type DiffCounts = { added: number; deleted: number; total: number };
export const diffCountsAtom = atom<DiffCounts | null>(null);
