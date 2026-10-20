import api from "@/lib/api-client";
import { LOCALE_OPTIONS } from "@/lib/locales";

export { LOCALE_OPTIONS };

export type WorkspaceLocaleSettings = {
  defaultLocale?: string;
  forceLocale?: boolean;
};

// Returns the full workspace settings object after the update.
export async function updateWorkspaceLocale(
  data: WorkspaceLocaleSettings,
): Promise<Record<string, any>> {
  const req = await api.post("/workspace-locale/update", data);
  return req.data;
}
