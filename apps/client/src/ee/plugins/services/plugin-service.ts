import api from "@/lib/api-client";

export interface IPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  configured: boolean;
  hooks: string[];
  configSchema?: Record<string, any>;
  configRequired?: boolean;
  configLocation?: "plugin" | "security";
}

export interface IPluginDetail extends IPlugin {
  configSchema?: Record<string, any>;
  config?: Record<string, any>;
}

export interface IPluginConfig {
  id: string | null;
  workspaceId: string;
  pluginId: string;
  enabled: boolean;
  config: Record<string, any>;
  version: number;
}

export async function getPlugins(): Promise<IPlugin[]> {
  const res = await api.get<IPlugin[]>("/plugins");
  const data = res.data as IPlugin[];
  return Array.isArray(data) ? data : [];
}

export async function getPlugin(pluginId: string): Promise<IPluginDetail> {
  const res = await api.get<IPluginDetail>(`/plugins/${pluginId}`);
  return (res.data as IPluginDetail) || ({} as IPluginDetail);
}

export async function getPluginConfig(
  pluginId: string,
): Promise<IPluginConfig> {
  const res = await api.get<IPluginConfig>(`/plugins/${pluginId}/config`);
  return (res.data as IPluginConfig) || ({} as IPluginConfig);
}

export async function updatePluginConfig(
  pluginId: string,
  payload: { config?: Record<string, any>; enabled?: boolean },
): Promise<IPluginConfig> {
  const res = await api.put<IPluginConfig>(
    `/plugins/${pluginId}/config`,
    payload,
  );
  return (res.data as IPluginConfig) || ({} as IPluginConfig);
}

export async function togglePlugin(
  pluginId: string,
  enabled: boolean,
): Promise<{ success: boolean; enabled: boolean }> {
  const res = await api.post<{ success: boolean; enabled: boolean }>(
    `/plugins/${pluginId}/toggle`,
    { enabled },
  );
  return (
    (res.data as { success: boolean; enabled: boolean }) || {
      success: false,
      enabled,
    }
  );
}
