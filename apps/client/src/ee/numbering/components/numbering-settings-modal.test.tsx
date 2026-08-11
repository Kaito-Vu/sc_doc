import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { NumberingSettingsModal } from "./numbering-settings-modal";
import * as numberingService from "@/ee/numbering/services/numbering-service";
import { DEFAULT_NUMBERING_SETTINGS } from "@docmost/editor-ext";

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <NumberingSettingsModal
          pageId="p1"
          opened
          onClose={() => {}}
          numberingSettings={DEFAULT_NUMBERING_SETTINGS}
        />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("NumberingSettingsModal", () => {
  it("renders exactly 10 level rows", () => {
    renderModal();
    expect(screen.getAllByTestId(/numbering-level-row-/)).toHaveLength(10);
  });

  it("saves the edited settings on submit", async () => {
    const spy = vi
      .spyOn(numberingService, "updateNumberingSettings")
      .mockResolvedValue({ numberingSettings: DEFAULT_NUMBERING_SETTINGS });

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: "p1" }),
    );
  });
});
