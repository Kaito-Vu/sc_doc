import type { TFunction } from "i18next";

export const CHOICE_COLORS = [
  "gray", "red", "pink", "grape", "violet", "indigo",
  "blue", "cyan", "teal", "green", "lime", "yellow", "orange",
];

export const STATUS_CATEGORY_ORDER = ["todo", "inProgress", "complete"] as const;

// Resolved at render time so labels follow language switches.
export function getStatusCategoryLabels(t: TFunction): Record<string, string> {
  return {
    todo: t("To Do"),
    inProgress: t("In Progress"),
    complete: t("Complete"),
  };
}
