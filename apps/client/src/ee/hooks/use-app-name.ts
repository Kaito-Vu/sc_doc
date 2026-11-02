import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { getAppName } from "@/lib/config.ts";

// Browser-title suffix: "<workspace name> - Quản lý tài liệu".
export function useAppName(): string {
  const name = useAtomValue(workspaceAtom)?.name;
  return name ? `${name} - Quản lý tài liệu` : getAppName();
}
