import { isPluginEnabled } from '../plugins/plugin-enabled';

export const isPageLockEnabled = (workspaceId: string) =>
  isPluginEnabled(workspaceId, 'page-lock');
