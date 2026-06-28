import api from "@/lib/api-client";

export interface IPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  configured: boolean;
  configRequired?: boolean;
  hooks: string[];
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

function unwrap<T>(res: { data?: T }): T {
  return res.data as T;
}

export async function getPlugins(): Promise<IPlugin[]> {
  const res = await api.get<{ data: IPlugin[] }>("/plugins");
  const data = unwrap(res);
  return Array.isArray(data) ? data : [];
}

export async function getPlugin(pluginId: string): Promise<IPluginDetail> {
  const res = await api.get<{ data: IPluginDetail }>(`/plugins/${pluginId}`);
  return unwrap(res) || {};
}

export async function getPluginConfig(
  pluginId: string,
): Promise<IPluginConfig> {
  const res = await api.get<{ data: IPluginConfig }>(
    `/plugins/${pluginId}/config`,
  );
  return unwrap(res) || {};
}

export async function updatePluginConfig(
  pluginId: string,
  payload: { config?: Record<string, any>; enabled?: boolean },
): Promise<IPluginConfig> {
  const res = await api.put<{ data: IPluginConfig }>(
    `/plugins/${pluginId}/config`,
    payload,
  );
  return unwrap(res) || {};
}

export async function togglePlugin(
  pluginId: string,
  enabled: boolean,
): Promise<{ success: boolean; enabled: boolean }> {
  const res = await api.post<{ data: { success: boolean; enabled: boolean } }>(
    `/plugins/${pluginId}/toggle`,
    { enabled },
  );
  return unwrap(res) || { success: false, enabled };
}
