import api from "@/lib/api-client";
import {
  IUpdateNumberingSettings,
  IUpdateNumberingSettingsResponse,
} from "@/ee/numbering/types/numbering.types";

export async function updateNumberingSettings(
  data: IUpdateNumberingSettings,
): Promise<IUpdateNumberingSettingsResponse> {
  const req = await api.post<IUpdateNumberingSettingsResponse>(
    "/pages/numbering-settings",
    data,
  );
  return req.data;
}
