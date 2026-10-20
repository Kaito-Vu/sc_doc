import { notifications } from "@mantine/notifications";

/** Red notification with the server message when present, else `fallback`. */
export function notifyError(error: unknown, fallback: string): void {
  const message = (error as { response?: { data?: { message?: string } } })
    ?.response?.data?.message;
  notifications.show({ message: message || fallback, color: "red" });
}
