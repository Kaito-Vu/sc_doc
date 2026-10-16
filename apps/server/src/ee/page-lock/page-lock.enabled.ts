import { PluginConfigService } from '../plugins/services/plugin-config.service';

const CACHE_TTL_MS = 5_000;
const PLUGIN_ID = 'page-lock';

let configService: PluginConfigService | null = null;
const cache = new Map<string, { enabled: boolean; at: number }>();

export function setPageLockConfigService(service: PluginConfigService) {
  configService = service;
}

// Per-workspace "page-lock" plugin switch (Settings > Plugins), briefly cached
// because it is checked on every page access.
export async function isPageLockEnabled(workspaceId: string): Promise<boolean> {
  const hit = cache.get(workspaceId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.enabled;

  let enabled = false;
  try {
    enabled = !!(await configService?.getConfig(workspaceId, PLUGIN_ID))
      ?.enabled;
  } catch {
    enabled = false;
  }
  cache.set(workspaceId, { enabled, at: Date.now() });
  return enabled;
}
