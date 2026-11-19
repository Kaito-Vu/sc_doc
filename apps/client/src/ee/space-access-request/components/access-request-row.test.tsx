import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { MantineProvider } from "@mantine/core";
import { AccessRequestRow } from "./access-request-row";

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

const request = {
  id: "r1",
  spaceId: "s1",
  roleRequested: "writer",
  message: "please",
  createdAt: "2026-11-19T00:00:00Z",
  requesterId: "u2",
  requesterName: "Linh",
  requesterAvatarUrl: null,
  spaceName: "Finance",
  spaceSlug: "finance",
} as any;

function setup() {
  const onApprove = vi.fn();
  const onReject = vi.fn();
  render(
    <MemoryRouter>
      <MantineProvider>
        <I18nextProvider i18n={i18n}>
          <AccessRequestRow request={request} onApprove={onApprove} onReject={onReject} />
        </I18nextProvider>
      </MantineProvider>
    </MemoryRouter>,
  );
  return { onApprove, onReject };
}

describe("AccessRequestRow", () => {
  it("defaults the approve role to the requested role", () => {
    const { onApprove } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledWith("writer");
  });

  it("lets the approver change the role before approving", () => {
    const { onApprove } = setup();
    fireEvent.click(screen.getAllByLabelText("Permission")[0]);
    fireEvent.click(screen.getByText("Can view"));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledWith("reader");
  });

  it("reject sends the optional reason", () => {
    const { onReject } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByPlaceholderText("Reason (optional)"), {
      target: { value: " not your team " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject" }));
    expect(onReject).toHaveBeenCalledWith("not your team");
  });

  it("reject without a reason sends undefined", () => {
    const { onReject } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject" }));
    expect(onReject).toHaveBeenCalledWith(undefined);
  });
});
