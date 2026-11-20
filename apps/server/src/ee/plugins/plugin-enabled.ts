import { PluginConfigService } from './services/plugin-config.service';

let configService: PluginConfigService | null = null;

// Wired once by PluginsModule. Lets non-DI code (utils, guards) ask the same
// question DI code asks via PluginConfigService.isEnabled().
export function setPluginConfigService(service: PluginConfigService) {
  configService = service;
}

// Settings > Plugins switch for one workspace (default off). PluginConfigService
// already caches for a few seconds, so this is safe on hot paths.
export function isPluginEnabled(
  workspaceId: string,
  pluginId: string,
): Promise<boolean> | boolean {
  return configService?.isEnabled(workspaceId, pluginId) ?? false;
}
