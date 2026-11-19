import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { MantineProvider } from "@mantine/core";
import { RequestAccessPanel } from "./request-access-panel";

const createMutate = vi.fn();
const cancelMutate = vi.fn();
let info: any;

vi.mock("@/ee/space-access-request/queries/space-access-request-query", () => ({
  useAccessInfoQuery: () => ({ data: info, isLoading: false }),
  useCreateAccessRequestMutation: () => ({ mutate: createMutate, isPending: false }),
  useCancelAccessRequestMutation: () => ({ mutate: cancelMutate, isPending: false }),
}));

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: {} } },
    interpolation: { escapeValue: false },
  });
}
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const space = { id: "s1", name: "Finance", slug: "finance" };

function renderPanel() {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <I18nextProvider i18n={i18n}>
          <RequestAccessPanel spaceSlug="finance" />
        </I18nextProvider>
      </MantineProvider>
    </MemoryRouter>,
  );
}

describe("RequestAccessPanel", () => {
  beforeEach(() => {
    createMutate.mockClear();
    cancelMutate.mockClear();
  });

  it("shows the locked space name and a Send button when a request can be made", () => {
    info = { space, request: null, canRequest: true };
    renderPanel();
    expect(screen.getAllByText("Finance").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("Send calls create with the default Can view (reader) role", () => {
    info = { space, request: null, canRequest: true };
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(createMutate).toHaveBeenCalledWith({
      spaceId: "s1",
      role: "reader",
      message: undefined,
    });
  });

  it("pending state shows Withdraw and hides the form", () => {
    info = {
      space,
      canRequest: false,
      request: { id: "r1", status: "pending", roleRequested: "writer" },
    };
    renderPanel();
    expect(screen.getByText("Request pending")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw request" }));
    expect(cancelMutate).toHaveBeenCalledWith("r1");
  });

  it("rejected state shows the reason", () => {
    info = {
      space,
      canRequest: false,
      request: { id: "r1", status: "rejected", roleRequested: "reader", decisionReason: "Not your team" },
    };
    renderPanel();
    expect(screen.getByText("Not your team")).toBeTruthy();
  });

  it("unknown space falls back to the generic 403", () => {
    info = { space: null, request: null, canRequest: false };
    renderPanel();
    expect(screen.getByText("403 - Access denied")).toBeTruthy();
  });
});
