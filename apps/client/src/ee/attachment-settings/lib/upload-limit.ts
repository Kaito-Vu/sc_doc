import { getDefaultStore } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";

export const DEFAULT_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;

// Sync read of the workspace's attachment limit (the server enforces it too).
export function getWorkspaceUploadLimit(): number {
  const v = getDefaultStore().get(workspaceAtom)?.settings?.attachments
    ?.maxUploadBytes;
  return typeof v === "number" && v > 0 ? v : DEFAULT_UPLOAD_LIMIT_BYTES;
}
