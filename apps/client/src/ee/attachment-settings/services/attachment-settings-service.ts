import api from "@/lib/api-client";

export interface IAttachmentSettings {
  maxUploadBytes: number;
  maxTotalRtfBytes: number;
  allowedExtensions: string[];
  allowedMimeTypes: string[];
}

// undefined = keep, null = reset to default
export type IUpdateAttachmentSettings = {
  [K in keyof IAttachmentSettings]?: IAttachmentSettings[K] | null;
};

export async function getAttachmentSettings(): Promise<IAttachmentSettings> {
  const req = await api.post<IAttachmentSettings>("/attachment-settings/info");
  return req.data;
}

export async function updateAttachmentSettings(
  data: IUpdateAttachmentSettings,
): Promise<IAttachmentSettings> {
  const req = await api.post<IAttachmentSettings>(
    "/attachment-settings/update",
    data,
  );
  return req.data;
}
