import i18n from "i18next";

/**
 * Server message when present, otherwise a status-specific or generic hint
 * (proxies answer 413/429 with HTML, so there is no JSON message to show).
 */
export function getErrorMessage(err: any): string {
  const serverMessage = err?.response?.data?.message;
  if (typeof serverMessage === "string" && serverMessage) return serverMessage;
  switch (err?.response?.status) {
    case 413:
      return i18n.t("The file is too large to import.");
    case 429:
      return i18n.t("Too many requests. Please wait a moment and try again.");
  }
  // Axios network errors say only "Network Error"; keep the friendlier hint.
  if (!err?.isAxiosError && typeof err?.message === "string" && err.message) {
    return err.message;
  }
  return i18n.t("Check your connection and try again.");
}
