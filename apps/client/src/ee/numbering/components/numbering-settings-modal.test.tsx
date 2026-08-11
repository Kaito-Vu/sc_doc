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

  it("discards an abandoned edit when reopened after being closed without saving", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { rerender } = render(
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

    const level1Row = screen.getByTestId("numbering-level-row-1");
    const inputs = level1Row.querySelectorAll("input");
    const textInput = inputs[inputs.length - 1] as HTMLInputElement;
    expect(textInput.value).toBe("%1.");

    // Edit the field without saving.
    fireEvent.change(textInput, { target: { value: "ABANDONED" } });
    expect(textInput.value).toBe("ABANDONED");

    const rerenderWith = (opened: boolean) =>
      rerender(
        <MantineProvider>
          <QueryClientProvider client={queryClient}>
            <NumberingSettingsModal
              pageId="p1"
              opened={opened}
              onClose={() => {}}
              numberingSettings={DEFAULT_NUMBERING_SETTINGS}
            />
          </QueryClientProvider>
        </MantineProvider>,
      );

    // Simulate "Cancel" (close without saving) then reopening later.
    rerenderWith(false);
    rerenderWith(true);

    const reopenedRow = screen.getByTestId("numbering-level-row-1");
    const reopenedInputs = reopenedRow.querySelectorAll("input");
    const reopenedInput = reopenedInputs[
      reopenedInputs.length - 1
    ] as HTMLInputElement;
    expect(reopenedInput.value).toBe("%1.");
  });

  it("does not clobber an in-progress edit when numberingSettings gets a new object reference while still open", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { rerender } = render(
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

    const level1Row = screen.getByTestId("numbering-level-row-1");
    const inputs = level1Row.querySelectorAll("input");
    const textInput = inputs[inputs.length - 1] as HTMLInputElement;
    expect(textInput.value).toBe("%1.");

    // Edit the field without saving (in-progress edit).
    fireEvent.change(textInput, { target: { value: "IN_PROGRESS" } });
    expect(textInput.value).toBe("IN_PROGRESS");

    // Simulate a websocket-triggered refetch of the underlying page query:
    // numberingSettings gets a brand-new object reference with equivalent
    // content, while the modal stays open (no opened transition).
    const refetchedSettings = {
      ...DEFAULT_NUMBERING_SETTINGS,
      levels: [...DEFAULT_NUMBERING_SETTINGS.levels],
    };
    rerender(
      <MantineProvider>
        <QueryClientProvider client={queryClient}>
          <NumberingSettingsModal
            pageId="p1"
            opened
            onClose={() => {}}
            numberingSettings={refetchedSettings}
          />
        </QueryClientProvider>
      </MantineProvider>,
    );

    const rowAfterRefetch = screen.getByTestId("numbering-level-row-1");
    const inputsAfterRefetch = rowAfterRefetch.querySelectorAll("input");
    const textInputAfterRefetch = inputsAfterRefetch[
      inputsAfterRefetch.length - 1
    ] as HTMLInputElement;
    expect(textInputAfterRefetch.value).toBe("IN_PROGRESS");
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
