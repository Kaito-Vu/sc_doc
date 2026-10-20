import api from "@/lib/api-client";

export type NotificationChannel = "web" | "email";
export type NotificationPrefs = Record<
  string,
  Record<NotificationChannel, boolean>
>;

export async function getNotificationPreferences(): Promise<NotificationPrefs> {
  const req = await api.post<{ groups: NotificationPrefs }>(
    "/notification-preferences/info",
  );
  return req.data.groups;
}

export async function updateNotificationPreference(data: {
  group: string;
  channel: NotificationChannel;
  enabled: boolean;
}): Promise<NotificationPrefs> {
  const req = await api.post<{ groups: NotificationPrefs }>(
    "/notification-preferences/update",
    data,
  );
  return req.data.groups;
}
