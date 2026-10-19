/**
 * API client for Detail Info Panel.
 *
 * Trash / restore / move / export / full-width reuse the core page and user
 * flows (see the panel sections). Only the panel-specific actions whose server
 * endpoints are still pending (docs/detail_info_panel/API_REQUIREMENTS.md) live here.
 */

import api from '@/lib/api-client';
import type { PageSettings } from '../components/detail-info-panel/detail-info-panel.types';

/**
 * Archive a page. The server endpoint is not implemented yet, so this rejects
 * and the caller reports the failure.
 */
export const archivePage = async (pageId: string): Promise<void> => {
  await api.patch(`/pages/${encodeURIComponent(pageId)}/archive`);
};

/**
 * Update page settings. Placeholder until a page-settings endpoint exists:
 * nothing is persisted, the requested values are echoed back.
 */
export const updatePageSettings = async (
  _pageId: string,
  settings: Partial<PageSettings>
): Promise<PageSettings> => settings as PageSettings;
