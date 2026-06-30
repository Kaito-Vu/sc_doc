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
export const comparePickModeAtom = atom<boolean>(false);

export type DiffCounts = { added: number; deleted: number; total: number };
export const diffCountsAtom = atom<DiffCounts | null>(null);
