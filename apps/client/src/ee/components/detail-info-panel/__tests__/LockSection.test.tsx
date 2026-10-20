import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LockSection } from '../sections/LockSection';

const lock = { mutate: vi.fn(), isPending: false };
const unlock = { mutate: vi.fn(), isPending: false };
let state: Record<string, unknown>;

// jsdom lacks these; Mantine needs them.
window.matchMedia ??= ((q: string) => ({
  matches: false, media: q, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
})) as any;
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;

vi.mock('@/ee/page-lock/use-page-lock', () => ({
  usePageLock: () => state,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const renderSection = () =>
  render(
    <MantineProvider>
      <LockSection page={{} as any} pageId="p1" />
    </MantineProvider>,
  );

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  state = {
    enabled: true,
    page: { permissions: { canEdit: true } },
    locked: false,
    canUnlock: false,
    lock,
    unlock,
  };
});

describe('LockSection', () => {
  it('renders nothing when plugin is disabled or page is a base', () => {
    state.enabled = false;
    renderSection();
    expect(screen.queryByRole('switch')).toBeNull();
    cleanup();
    state = { ...state, enabled: true, page: { isBase: true } };
    renderSection();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('unlocked: shows Unlocked badge and locks on toggle', () => {
    const { container } = renderSection();
    expect(container.textContent).toContain('Lock this page');
    expect(container.textContent).toContain('Unlocked');
    fireEvent.click(screen.getByRole('switch'));
    expect(lock.mutate).toHaveBeenCalledTimes(1);
  });

  it('locked + can unlock: shows Locked badge and unlocks on toggle', () => {
    state.locked = true;
    state.canUnlock = true;
    const { container } = renderSection();
    expect(container.textContent).toContain('Locked');
    fireEvent.click(screen.getByRole('switch'));
    expect(unlock.mutate).toHaveBeenCalledTimes(1);
  });

  it('disables the switch when the user cannot change the lock', () => {
    state.locked = true; // locked by someone else, canUnlock=false
    renderSection();
    expect(screen.getByRole('switch')).toHaveProperty('disabled', true);
    cleanup();
    state = { ...state, locked: false, page: { permissions: { canEdit: false } } };
    renderSection();
    expect(screen.getByRole('switch')).toHaveProperty('disabled', true);
  });
});
