import { INotification } from "@/features/notification/types/notification.types";

/** Download URL for a "docx_export.ready" notification, or undefined once its link has expired. */
export function getDocxDownloadUrl(
  notification: INotification,
): string | undefined {
  if (notification.type !== "docx_export.ready") return undefined;
  const { token, expiresAt } = notification.data ?? {};
  if (typeof token !== "string" || Number(expiresAt) < Date.now()) {
    return undefined;
  }
  return `/api/docx-export/download/${token}`;
}
