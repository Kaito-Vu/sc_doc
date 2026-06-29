/**
 * API client for Detail Info Panel
 * Handles all API calls for page stats, settings, and actions
 */

import type {
  PageStats,
  PageSettings,
  PageHistory,
  ExportFormat,
} from '../components/detail-info-panel/detail-info-panel.types';

// This will be connected to the actual API client
// For now using placeholder implementation
const API_BASE = '/api';

/**
 * Fetch page statistics (views, edits, creator, contributors)
 */
export const getPageStats = async (pageId: string): Promise<PageStats> => {
  try {
    const response = await fetch(`${API_BASE}/pages/${pageId}/stats`);
    if (!response.ok) {
      throw new Error(`Failed to fetch page stats: ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.error('Error fetching page stats:', error);
    throw error;
  }
};

/**
 * Fetch page settings (full-width, protection, etc.)
 */
export const getPageSettings = async (pageId: string): Promise<PageSettings> => {
  try {
    const response = await fetch(`${API_BASE}/pages/${pageId}/settings`);
    if (!response.ok) {
      throw new Error(`Failed to fetch page settings: ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.error('Error fetching page settings:', error);
    throw error;
  }
};

/**
 * Update page settings
 */
export const updatePageSettings = async (
  pageId: string,
  settings: Partial<PageSettings>
): Promise<PageSettings> => {
  try {
    const response = await fetch(`${API_BASE}/pages/${pageId}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      throw new Error(`Failed to update page settings: ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.error('Error updating page settings:', error);
    throw error;
  }
};

/**
 * Archive a page
 */
export const archivePage = async (pageId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/pages/${pageId}/archive`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to archive page: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error archiving page:', error);
    throw error;
  }
};

/**
 * Restore a page from archive
 */
export const restorePage = async (pageId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/pages/${pageId}/restore`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to restore page: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error restoring page:', error);
    throw error;
  }
};

/**
 * Delete a page (move to trash)
 */
export const deletePage = async (pageId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/pages/${pageId}/trash`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to delete page: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error deleting page:', error);
    throw error;
  }
};

/**
 * Move a page to another space or parent
 */
export const movePage = async (
  pageId: string,
  targetSpaceId: string,
  targetParentPageId?: string
): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/pages/${pageId}/move`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetSpaceId,
        targetParentPageId,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to move page: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error moving page:', error);
    throw error;
  }
};

/**
 * Export a page in a specific format
 */
export const exportPage = async (
  pageId: string,
  format: 'pdf' | 'html' | 'markdown' | 'docx'
): Promise<{ downloadUrl: string; fileName: string; expiresAt: Date }> => {
  try {
    const response = await fetch(`${API_BASE}/pages/${pageId}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ format }),
    });
    if (!response.ok) {
      throw new Error(`Failed to export page: ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.error('Error exporting page:', error);
    throw error;
  }
};

/**
 * Fetch page history/revisions
 */
export const getPageHistory = async (
  pageId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{
  total: number;
  revisions: PageHistory[];
}> => {
  try {
    const response = await fetch(
      `${API_BASE}/pages/${pageId}/history?limit=${limit}&offset=${offset}`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch page history: ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.error('Error fetching page history:', error);
    throw error;
  }
};
