import { afterEach, describe, expect, it } from "vitest";
import { getDefaultStore } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { getWorkspaceUploadLimit } from "./upload-limit";

const setWorkspace = (settings: unknown) =>
  getDefaultStore().set(currentUserAtom, {
    user: {},
    workspace: { settings },
  } as any);

describe("getWorkspaceUploadLimit", () => {
  afterEach(() => getDefaultStore().set(currentUserAtom, null as any));

  it("defaults to 10 MB with no workspace or no attachments setting", () => {
    expect(getWorkspaceUploadLimit()).toBe(10 * 1024 * 1024);
    setWorkspace({});
    expect(getWorkspaceUploadLimit()).toBe(10 * 1024 * 1024);
  });

  it("returns the configured value", () => {
    setWorkspace({ attachments: { maxUploadBytes: 123 } });
    expect(getWorkspaceUploadLimit()).toBe(123);
  });

  it("ignores garbage values", () => {
    setWorkspace({ attachments: { maxUploadBytes: -5 } });
    expect(getWorkspaceUploadLimit()).toBe(10 * 1024 * 1024);
  });
});
