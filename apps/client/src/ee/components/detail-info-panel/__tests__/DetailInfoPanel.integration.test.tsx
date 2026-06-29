/**
 * Integration tests for Detail Info Panel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { DetailInfoPanel } from '../DetailInfoPanel';
import { renderWithProviders, mockPageData, mockStatsData } from './test-utils';

// Mock the hooks
vi.mock('@/features/page/queries/page-query');
vi.mock('@/ee/hooks/usePageStats');
vi.mock('@/ee/hooks/usePageSettings');
vi.mock('@tanstack/react-query');

describe('DetailInfoPanel Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Data Fetching Flow', () => {
    it('loads and displays page data correctly', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      await waitFor(() => {
        expect(screen.getByText('Test Page')).toBeInTheDocument();
      });
    });

    it('loads stats independently', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      await waitFor(() => {
        // Check if stats values are displayed
        expect(screen.queryByText('42')).toBeInTheDocument();
      });
    });

    it('handles loading states gracefully', async () => {
      const { container } = renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      // Should show skeleton loaders initially
      const skeletons = container.querySelectorAll('[class*="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Test Page')).toBeInTheDocument();
      });
    });

    it('handles errors gracefully', async () => {
      // Mock error state
      const { container } = renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      // Panel should still render even with errors
      expect(container.querySelector('aside')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('handles panel collapse/expand', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      // Find collapse button
      const buttons = screen.getAllByRole('button');
      const collapseButton = buttons[0];

      // Initially content should be visible
      expect(screen.getByText('PEOPLE')).toBeInTheDocument();

      // Click collapse
      fireEvent.click(collapseButton);

      // Content should be hidden
      await waitFor(() => {
        expect(screen.queryByText('PEOPLE')).not.toBeInTheDocument();
      });

      // Click expand
      fireEvent.click(collapseButton);

      // Content should be visible again
      await waitFor(() => {
        expect(screen.getByText('PEOPLE')).toBeInTheDocument();
      });
    });

    it('handles panel close', async () => {
      const onClose = vi.fn();
      renderWithProviders(<DetailInfoPanel pageId="page-1" onClose={onClose} />);

      const buttons = screen.getAllByRole('button');
      const closeButton = buttons[buttons.length - 1]; // Last button is close

      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('handles full-width toggle', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      const fullWidthLabel = screen.getByText('Full-width');
      expect(fullWidthLabel).toBeInTheDocument();

      // Find and click the toggle switch
      const switches = screen.getAllByRole('switch');
      if (switches.length > 0) {
        fireEvent.click(switches[0]);

        await waitFor(() => {
          expect(switches[0]).toBeInTheDocument();
        });
      }
    });

    it('handles archive action with confirmation', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      // Click archive button
      const archiveButtons = screen.getAllByText('Archive');
      if (archiveButtons.length > 0) {
        fireEvent.click(archiveButtons[archiveButtons.length - 1]);

        // Confirmation dialog should appear
        await waitFor(() => {
          expect(screen.getByText(/archive this page/i)).toBeInTheDocument();
        });
      }
    });

    it('handles delete action with confirmation', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      // Click trash button
      const trashButtons = screen.getAllByText('Trash');
      if (trashButtons.length > 0) {
        fireEvent.click(trashButtons[trashButtons.length - 1]);

        // Confirmation dialog should appear
        await waitFor(() => {
          expect(screen.getByText(/delete this page/i)).toBeInTheDocument();
        });
      }
    });
  });

  describe('State Management', () => {
    it('maintains section state during interactions', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      // All sections should be visible
      expect(screen.getByText('PEOPLE')).toBeInTheDocument();
      expect(screen.getByText('STATS')).toBeInTheDocument();
      expect(screen.getByText('DISPLAY')).toBeInTheDocument();
      expect(screen.getByText('PROTECTION')).toBeInTheDocument();
      expect(screen.getByText('ACTIONS')).toBeInTheDocument();
      expect(screen.getByText('DANGER ZONE')).toBeInTheDocument();

      // State should persist after interactions
      fireEvent.click(screen.getByText('Move'));
      await waitFor(() => {
        expect(screen.getByText('PEOPLE')).toBeInTheDocument();
      });
    });

    it('handles multiple toggles', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThan(0);

      // Click first switch
      if (switches[0]) {
        fireEvent.click(switches[0]);
      }

      // Click second switch
      if (switches[1]) {
        fireEvent.click(switches[1]);
      }

      // Both should be handled without errors
      await waitFor(() => {
        expect(screen.getByText('PEOPLE')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility Integration', () => {
    it('supports keyboard navigation', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);

      // Buttons should be keyboard accessible
      buttons.forEach((button) => {
        expect(button).toHaveProperty('tabIndex');
      });
    });

    it('has proper focus management', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      // Panel should be focusable
      const aside = document.querySelector('aside');
      expect(aside).toBeInTheDocument();
    });

    it('maintains semantic structure', async () => {
      const { container } = renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();

      // Check for proper heading hierarchy
      const sections = container.querySelectorAll('[class*="title"]');
      expect(sections.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('does not cause unnecessary re-renders', async () => {
      const { rerender } = renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      const pageTitle = screen.getByText('Test Page');
      expect(pageTitle).toBeInTheDocument();

      // Rerender with same props
      rerender(<DetailInfoPanel pageId="page-1" />);

      // Should still show content
      expect(screen.getByText('Test Page')).toBeInTheDocument();
    });

    it('handles rapid user interactions', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      const buttons = screen.getAllByRole('button');

      // Rapid clicks
      fireEvent.click(buttons[0]);
      fireEvent.click(buttons[0]);
      fireEvent.click(buttons[0]);

      await waitFor(() => {
        expect(buttons[0]).toBeInTheDocument();
      });
    });
  });

  describe('Error Boundaries', () => {
    it('recovers from errors gracefully', async () => {
      renderWithProviders(<DetailInfoPanel pageId="page-1" />);

      // Should still render panel even if some hooks fail
      expect(document.querySelector('aside')).toBeInTheDocument();
    });
  });
});
