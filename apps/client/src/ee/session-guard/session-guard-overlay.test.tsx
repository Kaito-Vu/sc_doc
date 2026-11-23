import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifications } from "@mantine/notifications";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import { SessionGuardOverlay } from "./session-guard-overlay";

const svc = vi.hoisted(() => ({
  getSessionGuardStatus: vi.fn(),
  allowSessionConflict: vi.fn(),
  denySessionConflict: vi.fn(),
}));
vi.mock("@/ee/session-guard/services/session-guard-service", () => svc);
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));
// Stable `t` identity like real i18next; a fresh fn per render would restart effects.
const tStable = vi.hoisted(
  () => (k: string, o?: Record<string, unknown>) =>
    k.replace(/{{\s*(\w+)\s*}}/g, (_: string, n: string) => String(o?.[n])),
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: tStable }),
}));
vi.mock("@mantine/core", () => ({
  Modal: ({ opened, children }: any) =>
    opened ? <div role="dialog">{children}</div> : null,
  Stack: ({ children }: any) => <div>{children}</div>,
  Group: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <p>{children}</p>,
  Loader: () => null,
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

function makeSocket() {
  const handlers = new Map<string, Set<(p?: any) => void>>();
  return {
    connected: false,
    on: (e: string, h: any) => {
      if (!handlers.has(e)) handlers.set(e, new Set());
      handlers.get(e)!.add(h);
    },
    off: (e: string, h: any) => handlers.get(e)?.delete(h),
    io: { on: vi.fn(), off: vi.fn() },
    emit: (e: string, p?: any) => handlers.get(e)?.forEach((h) => h(p)),
  };
}

let socket: ReturnType<typeof makeSocket>;
const replace = vi.fn();

function mount() {
  const store = createStore();
  store.set(socketAtom as any, socket);
  return render(
    <Provider store={store}>
      <SessionGuardOverlay />
    </Provider>,
  );
}

const conflict = (extra: Record<string, unknown> = {}) => ({
  conflictId: "c1",
  role: "existing",
  deadline: Date.now() + 60_000,
  ...extra,
});

const emit = async (e: string, p: unknown) => {
  await act(async () => {
    socket.emit(e, p);
  });
};
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const hasReject = () => !!screen.queryByText("Reject new login");

beforeEach(() => {
  vi.useFakeTimers();
  socket = makeSocket();
  Object.values(svc).forEach((m) => m.mockReset());
  svc.getSessionGuardStatus.mockResolvedValue({ status: "none" });
  replace.mockReset();
  (notifications.show as any).mockReset();
  vi.stubGlobal("location", { pathname: "/home", replace });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SessionGuardOverlay characterization", () => {
  it("socket merge keeps previous canRespond when payload omits it", async () => {
    mount();
    await emit("security:session-conflict", conflict({ canRespond: true }));
    expect(hasReject()).toBe(true);
    await emit("security:session-conflict", {
      conflictId: "c1",
      deadline: Date.now() + 60_000,
    });
    expect(hasReject()).toBe(true);
  });

  it("socket merge resets canRespond for a different conflictId", async () => {
    mount();
    await emit("security:session-conflict", conflict({ canRespond: true }));
    await emit("security:session-conflict", conflict({ conflictId: "c2" }));
    expect(hasReject()).toBe(false);
  });

  it("poll merge falls back to canRespond=false when status omits it", async () => {
    mount();
    await emit("security:session-conflict", conflict({ canRespond: true }));
    expect(hasReject()).toBe(true);
    svc.getSessionGuardStatus.mockResolvedValue({
      status: "pending",
      conflictId: "c1",
    });
    await advance(2000);
    expect(svc.getSessionGuardStatus).toHaveBeenCalledTimes(1);
    expect(hasReject()).toBe(false);
  });

  it("poll merge keeps role/deadline from previous when omitted", async () => {
    mount();
    await emit("security:session-conflict", conflict({ canRespond: true }));
    svc.getSessionGuardStatus.mockResolvedValue({
      status: "pending",
      conflictId: "c1",
      canRespond: true,
    });
    await advance(2000);
    expect(hasReject()).toBe(true); // role stayed "existing"
  });

  it("ignores a poll response superseded by a realtime event", async () => {
    mount();
    await emit("security:session-conflict", conflict({ canRespond: true }));
    let resolve!: (v: unknown) => void;
    svc.getSessionGuardStatus.mockReturnValue(
      new Promise((r) => (resolve = r)),
    );
    await advance(2000); // poll in flight
    await advance(10);
    await emit("security:session-conflict", conflict({ canRespond: true }));
    await act(async () => {
      resolve({ status: "none" });
    });
    expect(hasReject()).toBe(true);
  });

  it("applies the current-sequence poll response", async () => {
    mount();
    await emit("security:session-conflict", conflict({ canRespond: true }));
    let resolve!: (v: unknown) => void;
    svc.getSessionGuardStatus.mockReturnValue(
      new Promise((r) => (resolve = r)),
    );
    await advance(2000);
    await act(async () => {
      resolve({ status: "none" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ticker updates remaining seconds every 250ms", async () => {
    svc.getSessionGuardStatus.mockResolvedValue({
      status: "pending",
      conflictId: "c1",
      role: "new",
    });
    mount();
    await emit(
      "security:session-conflict",
      conflict({ role: "new", deadline: Date.now() + 10_000 }),
    );
    expect(screen.getByText("Time remaining: 10s")).toBeTruthy();
    await advance(3000);
    expect(screen.getByText("Time remaining: 7s")).toBeTruthy();
  });

  it("revoked event closes modal and redirects after 1200ms", async () => {
    mount();
    await emit("security:session-conflict", conflict());
    await emit("security:session-revoked", {
      conflictId: "c1",
      reason: "denied_by_existing",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: "red", autoClose: 1500 }),
    );
    await advance(1199);
    expect(replace).not.toHaveBeenCalled();
    await advance(1);
    expect(replace).toHaveBeenCalledWith("/login?session=revoked");
  });

  it("revoked redirect is skipped on auth paths", async () => {
    vi.stubGlobal("location", { pathname: "/login", replace });
    mount();
    await emit("security:session-revoked", { conflictId: "c1" });
    await advance(1300);
    expect(replace).not.toHaveBeenCalled();
  });

  it("revoked via poll status redirects", async () => {
    mount();
    await emit("security:session-conflict", conflict());
    svc.getSessionGuardStatus.mockResolvedValue({
      status: "revoked",
      conflictId: "c1",
    });
    await advance(2000);
    await advance(1200);
    expect(replace).toHaveBeenCalledWith("/login?session=revoked");
  });

  it("deduplicates revoked events per conflictId", async () => {
    mount();
    await emit("security:session-revoked", { conflictId: "c1" });
    await emit("security:session-revoked", { conflictId: "c1" });
    expect(notifications.show).toHaveBeenCalledTimes(1);
  });

  it("resolved event clears matching pending and notifies once", async () => {
    mount();
    await emit("security:session-conflict", conflict());
    const p = { conflictId: "c1", outcome: "denied" };
    await emit("security:session-conflict-resolved", p);
    await emit("security:session-conflict-resolved", p);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: "red", message: "New login rejected" }),
    );
  });

  it("respond: deny calls service and closes modal", async () => {
    mount();
    await emit("security:session-conflict", conflict({ canRespond: true }));
    await act(async () => {
      fireEvent.click(screen.getByText("Reject new login"));
    });
    expect(svc.denySessionConflict).toHaveBeenCalledWith("c1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("respond: allow calls service", async () => {
    mount();
    await emit("security:session-conflict", conflict({ canRespond: true }));
    await act(async () => {
      fireEvent.click(screen.getByText("Allow and sign out this device"));
    });
    expect(svc.allowSessionConflict).toHaveBeenCalledWith("c1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("respond: 400 shows expired notice, refreshes status, closes", async () => {
    svc.denySessionConflict.mockRejectedValue({ response: { status: 400 } });
    mount();
    await emit("security:session-conflict", conflict({ canRespond: true }));
    await act(async () => {
      fireEvent.click(screen.getByText("Reject new login"));
    });
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: "The request expired." }),
    );
    expect(svc.getSessionGuardStatus).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("respond: other error keeps the modal open", async () => {
    svc.denySessionConflict.mockRejectedValue(new Error("boom"));
    mount();
    await emit("security:session-conflict", conflict({ canRespond: true }));
    await act(async () => {
      fireEvent.click(screen.getByText("Reject new login"));
    });
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Something went wrong", color: "red" }),
    );
  });
});
