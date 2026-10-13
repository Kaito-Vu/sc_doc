import i18n from "i18next";

/** Server message when present, otherwise a generic hint (e.g. on network errors). */
export function getErrorMessage(err: any): string {
  return (
    err?.response?.data?.message ||
    i18n.t("Check your connection and try again.")
  );
}
