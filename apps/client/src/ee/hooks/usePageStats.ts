import { useQuery } from '@tanstack/react-query';
import type { PageStats } from '../components/detail-info-panel/detail-info-panel.types';

/**
 * Fetch page statistics (views, edits, creator info, etc.)
 */
export const usePageStats = (pageId: string) => {
  return useQuery<PageStats>({
    queryKey: ['page-stats', pageId],
    queryFn: async () => {
      // This will be replaced with real API call in Phase 3 (Task 7)
      // For now, return mock data
      return {
        viewCount: 42,
        editCount: 15,
        createdAt: new Date(),
        updatedAt: new Date(),
        creator: {
          id: 'user-1',
          name: 'admin',
          email: 'admin@example.com',
          avatar: undefined,
        },
        lastUpdatedBy: {
          id: 'user-1',
          name: 'admin',
          email: 'admin@example.com',
          avatar: undefined,
        },
        contributors: [],
      };
    },
    staleTime: 30000, // 30 seconds
    enabled: !!pageId,
  });
};
