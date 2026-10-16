import api from "@/lib/api-client";

export async function lockPage(pageId: string): Promise<void> {
  await api.post("/pages/lock", { pageId });
}

export async function unlockPage(pageId: string): Promise<void> {
  await api.post("/pages/unlock", { pageId });
}

export interface IPageLockInfo {
  locked: boolean;
  lockedBy?: { id: string; name: string; avatarUrl: string | null };
  lockedAt?: string;
}

export async function getPageLockInfo(pageId: string): Promise<IPageLockInfo> {
  const req = await api.post("/pages/lock-info", { pageId });
  return req.data;
}
