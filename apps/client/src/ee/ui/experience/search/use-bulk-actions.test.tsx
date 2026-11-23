import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const addLabelsToPage = vi.fn();
const exportPage = vi.fn();
const deletePage = vi.fn();
const show = vi.fn();

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@mantine/notifications", () => ({ notifications: { show: (a: unknown) => show(a) } }));
vi.mock("@mantine/modals", () => ({ modals: { openConfirmModal: vi.fn() } }));
vi.mock("@/features/label/services/label-service", () => ({
  addLabelsToPage: (a: unknown) => addLabelsToPage(a),
}));
vi.mock("@/features/page/services/page-service", () => ({
  exportPage: (a: unknown) => exportPage(a),
  deletePage: (...a: unknown[]) => deletePage(...a),
}));
vi.mock("@/features/page/page.utils", () => ({
  buildPageUrl: (space: string, slug: string, title?: string) =>
    `/s/${space}/p/${title}-${slug}`,
}));

import {
  getSelectedPageIds,
  hrefOf,
  useBulkActions,
} from "./use-bulk-actions";

const page = { id: "p1", slugId: "sl1", title: "T1", space: { slug: "sp" } } as any;
const att = {
  id: "a1",
  fileName: "f.pdf",
  pageId: "p2",
  page: { slugId: "sl2", title: "T2" },
  space: { slug: "sp" },
} as any;

describe("helpers", () => {
  it("getSelectedPageIds maps attachments to their pageId", () => {
    expect(getSelectedPageIds([page, att], new Set(["p1", "a1"]))).toEqual([
      "p1",
      "p2",
    ]);
    expect(getSelectedPageIds([page, att], new Set(["a1"]))).toEqual(["p2"]);
    expect(getSelectedPageIds([page, att], new Set())).toEqual([]);
  });

  it("hrefOf handles page and attachment results", () => {
    expect(hrefOf(page)).toBe("/s/sp/p/T1-sl1");
    expect(hrefOf(att)).toBe("/s/sp/p/T2-sl2");
  });
});

describe("useBulkActions", () => {
  beforeEach(() => vi.clearAllMocks());

  const setup = (onDone = vi.fn()) => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      () =>
        useBulkActions({
          selected: new Set(["p1", "a1"]),
          selectedPageIds: ["p1", "p2"],
          results: [page, att],
          onDone,
        }),
      { wrapper },
    );
    return { ...hook, onDone };
  };

  it("bulkLabel labels every page, calls onDone, resolves true", async () => {
    addLabelsToPage.mockResolvedValue({});
    const { result, onDone } = setup();
    let ok = false;
    await act(async () => {
      ok = await result.current.bulkLabel("  tag ");
    });
    expect(ok).toBe(true);
    expect(addLabelsToPage).toHaveBeenCalledTimes(2);
    expect(addLabelsToPage).toHaveBeenCalledWith({ pageId: "p2", names: ["tag"] });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.bulkLoading).toBe(false);
  });

  it("bulkLabel failure resolves false and does not call onDone", async () => {
    addLabelsToPage.mockRejectedValue(new Error("x"));
    const { result, onDone } = setup();
    let ok = true;
    await act(async () => {
      ok = await result.current.bulkLabel("tag");
    });
    expect(ok).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ color: "red" }));
  });

  it("exportSelected exports each page without clearing selection", async () => {
    exportPage.mockResolvedValue(undefined);
    const { result, onDone } = setup();
    await act(async () => {
      await result.current.exportSelected();
    });
    expect(exportPage).toHaveBeenCalledTimes(2);
    expect(onDone).not.toHaveBeenCalled();
  });
});
