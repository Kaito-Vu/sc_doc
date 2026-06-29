import { useQuery } from '@tanstack/react-query';
import type { PageSettings } from '../components/detail-info-panel/detail-info-panel.types';

/**
 * Fetch page settings (full-width, protection, archiving, etc.)
 */
export const usePageSettings = (pageId: string) => {
  return useQuery<PageSettings>({
    queryKey: ['page-settings', pageId],
    queryFn: async () => {
      // This will be replaced with real API call in Phase 3 (Task 7)
      // For now, return mock data
      return {
        isFullWidth: false,
        isProtected: false,
        isArchived: false,
        allowComments: true,
        allowVersionHistory: true,
        publicLink: undefined,
      };
    },
    staleTime: 300000, // 5 minutes
    enabled: !!pageId,
  });
};
