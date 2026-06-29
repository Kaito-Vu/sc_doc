/**
 * Test utilities for Detail Info Panel tests
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';

/**
 * Create a test wrapper with all necessary providers
 */
export function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}

/**
 * Custom render function with all providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: createTestWrapper(), ...options });
}

/**
 * Mock page data for tests
 */
export const mockPageData = {
  id: 'page-1',
  title: 'Test Page',
  icon: '📄',
  content: 'Test content',
  createdAt: new Date('2026-06-09'),
  updatedAt: new Date(),
  creator: {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    avatarUrl: 'https://example.com/avatar.jpg',
  },
  lastUpdatedBy: {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    avatarUrl: 'https://example.com/avatar.jpg',
  },
  contributors: [
    {
      id: 'user-2',
      name: 'Jane Smith',
      avatarUrl: 'https://example.com/avatar2.jpg',
    },
  ],
  space: {
    id: 'space-1',
    name: 'My Space',
    slug: 'my-space',
  },
  permissions: {
    canEdit: true,
    canDelete: true,
    canShare: true,
    canArchive: true,
  },
  isFullWidth: false,
  isProtected: false,
  isArchived: false,
};

/**
 * Mock stats data
 */
export const mockStatsData = {
  viewCount: 42,
  editCount: 15,
  createdAt: new Date('2026-06-09'),
  updatedAt: new Date(),
  creator: mockPageData.creator,
  lastUpdatedBy: mockPageData.lastUpdatedBy,
  contributors: mockPageData.contributors,
};

/**
 * Mock settings data
 */
export const mockSettingsData = {
  isFullWidth: false,
  isProtected: false,
  isArchived: false,
  allowComments: true,
  allowVersionHistory: true,
};

/**
 * Wait for async operations
 */
export async function waitForAsync(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
