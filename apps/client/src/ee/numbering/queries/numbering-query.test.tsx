import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUpdateNumberingSettingsMutation } from "./numbering-query";
import * as numberingService from "@/ee/numbering/services/numbering-service";
import { DEFAULT_NUMBERING_SETTINGS } from "@docmost/editor-ext";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useUpdateNumberingSettingsMutation", () => {
  it("calls updateNumberingSettings and resolves with the response", async () => {
    vi.spyOn(numberingService, "updateNumberingSettings").mockResolvedValue({
      numberingSettings: DEFAULT_NUMBERING_SETTINGS,
    });

    const { result } = renderHook(() => useUpdateNumberingSettingsMutation(), {
      wrapper,
    });

    result.current.mutate({
      pageId: "p1",
      numberingSettings: DEFAULT_NUMBERING_SETTINGS,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(numberingService.updateNumberingSettings).toHaveBeenCalledWith({
      pageId: "p1",
      numberingSettings: DEFAULT_NUMBERING_SETTINGS,
    });
  });
});
