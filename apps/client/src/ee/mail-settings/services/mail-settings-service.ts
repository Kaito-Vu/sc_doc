import api from "@/lib/api-client";

export interface IMailSettings {
  configured: boolean;
  fromAddress: string;
  fromName: string;
  host: string;
  port: number;
  username: string;
  secure: boolean;
  ignoreTLS: boolean;
  hasPassword: boolean;
}

// password: undefined = keep stored one, null = remove it
export type IUpdateMailSettings = Omit<IMailSettings, "configured" | "hasPassword"> & {
  password?: string | null;
};

export async function getMailSettings(): Promise<IMailSettings> {
  return (await api.post<IMailSettings>("/mail-settings/info")).data;
}

export async function updateMailSettings(
  data: IUpdateMailSettings,
): Promise<IMailSettings> {
  return (await api.post<IMailSettings>("/mail-settings/update", data)).data;
}

export async function resetMailSettings(): Promise<IMailSettings> {
  return (await api.post<IMailSettings>("/mail-settings/reset")).data;
}

export async function sendTestMail(to: string): Promise<void> {
  await api.post("/mail-settings/test", { to });
}
