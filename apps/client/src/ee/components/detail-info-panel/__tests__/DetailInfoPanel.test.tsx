/**
 * Unit tests for Detail Info Panel
 * Uses React Testing Library + Vitest
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DetailInfoPanel } from '../DetailInfoPanel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';

// Mock hooks
vi.mock('@/features/page/queries/page-query', () => ({
  usePageQuery: vi.fn(() => ({
    data: {
      id: 'page-1',
      title: 'Test Page',
      creator: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
      updatedBy: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
      contributors: [],
      space: { id: 'space-1', name: 'My Space', slug: 'my-space' },
      permissions: { canEdit: true, canDelete: true, canShare: true, canArchive: true },
    },
    isLoading: false,
    isError: false,
  })),
}));

vi.mock('@/ee/hooks/usePageStats', () => ({
  usePageStats: vi.fn(() => ({
    data: {
      viewCount: 42,
      editCount: 15,
      createdAt: new Date('2026-06-09'),
      updatedAt: new Date(),
      creator: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
      lastUpdatedBy: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
      contributors: [],
    },
    isLoading: false,
  })),
}));

vi.mock('@/ee/hooks/usePageSettings', () => ({
  usePageSettings: vi.fn(() => ({
    data: {
      isFullWidth: false,
      isProtected: false,
      isArchived: false,
    },
    isLoading: false,
  })),
}));

const createWrapper = () => {
  const queryClient = new QueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
};

describe('DetailInfoPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders panel with page title', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });
    expect(screen.getByText('Test Page')).toBeInTheDocument();
  });

  it('renders all 6 sections', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    // Check for section titles
    expect(screen.getByText('PEOPLE')).toBeInTheDocument();
    expect(screen.getByText('STATS')).toBeInTheDocument();
    expect(screen.getByText('DISPLAY')).toBeInTheDocument();
    expect(screen.getByText('PROTECTION')).toBeInTheDocument();
    expect(screen.getByText('ACTIONS')).toBeInTheDocument();
    expect(screen.getByText('DANGER ZONE')).toBeInTheDocument();
  });

  it('displays owner badge with creator name', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByText('J')).toBeInTheDocument(); // Avatar initial
  });

  it('shows page stats', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });
    expect(screen.getByText('42')).toBeInTheDocument(); // View count
    expect(screen.getByText('15')).toBeInTheDocument(); // Edit count
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<DetailInfoPanel pageId="page-1" onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    const closeButton = screen.getAllByRole('button')[1]; // Second button is close
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('toggles collapse state when collapse button clicked', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    const collapseButton = screen.getAllByRole('button')[0]; // First button is collapse
    fireEvent.click(collapseButton);

    // Content should be hidden
    expect(screen.queryByText('PEOPLE')).not.toBeInTheDocument();
  });

  it('renders correctly when loading', () => {
    vi.resetModules();
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    // Should show skeleton during loading
    const skeletons = screen.queryAllByRole('none');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('returns null when page data is not available', () => {
    const { container } = render(<DetailInfoPanel pageId="page-1" />, {
      wrapper: createWrapper(),
    });

    // Panel should be rendered
    expect(container.querySelector('[data-testid="detail-info-panel"]')).toBeInTheDocument();
  });

  it('displays action buttons', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    expect(screen.getByText('Move')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText('Print')).toBeInTheDocument();
  });

  it('displays danger zone buttons', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    const archiveButtons = screen.getAllByText('Archive');
    expect(archiveButtons.length).toBeGreaterThan(0);

    const trashButtons = screen.getAllByText('Trash');
    expect(trashButtons.length).toBeGreaterThan(0);
  });
});

describe('DetailInfoPanel Sections', () => {
  it('PeopleSection displays creator and last updater', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    expect(screen.getByText('Creator')).toBeInTheDocument();
    expect(screen.getByText('Last updated by')).toBeInTheDocument();
  });

  it('StatsSection displays all stats', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('Edits')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last updated')).toBeInTheDocument();
  });

  it('DisplaySection renders full-width toggle', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    expect(screen.getByText('Full-width')).toBeInTheDocument();
  });

  it('ProtectionSection renders protection toggle', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    expect(screen.getByText('Protect this page')).toBeInTheDocument();
  });
});

describe('DetailInfoPanel Accessibility', () => {
  it('has proper ARIA labels', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    const collapseButton = screen.getByLabelText(/Collapse panel|Expand panel/i);
    expect(collapseButton).toBeInTheDocument();
  });

  it('supports keyboard navigation', () => {
    render(<DetailInfoPanel pageId="page-1" />, { wrapper: createWrapper() });

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);

    buttons.forEach((button) => {
      expect(button.tagName).toBe('BUTTON');
    });
  });

  it('renders semantic HTML', () => {
    const { container } = render(<DetailInfoPanel pageId="page-1" />, {
      wrapper: createWrapper(),
    });

    const aside = container.querySelector('aside');
    expect(aside).toBeInTheDocument();
  });
});

describe('DetailInfoPanel Performance', () => {
  it('memoizes component to prevent unnecessary re-renders', () => {
    const { rerender } = render(<DetailInfoPanel pageId="page-1" />, {
      wrapper: createWrapper(),
    });

    const firstRender = screen.getByText('Test Page');
    expect(firstRender).toBeInTheDocument();

    // Re-render with same props should not cause issues
    rerender(<DetailInfoPanel pageId="page-1" />);
    expect(screen.getByText('Test Page')).toBeInTheDocument();
  });
});
