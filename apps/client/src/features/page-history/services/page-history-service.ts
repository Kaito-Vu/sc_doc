import api from "@/lib/api-client";
import { IPageHistory } from "@/features/page-history/types/page.types";
import { IPagination } from "@/lib/types.ts";

export async function getPageHistoryList(
  pageId: string,
  cursor?: string,
  limit?: number,
): Promise<IPagination<IPageHistory>> {
  const req = await api.post("/pages/history", {
    pageId,
    cursor,
    limit,
  });
  return req.data;
}

export async function getPageHistoryById(
  historyId: string,
): Promise<IPageHistory> {
  const req = await api.post<IPageHistory>("/pages/history/info", {
    historyId,
  });
  return req.data;
}

export async function restorePageHistory(historyId: string): Promise<void> {
  await api.post("/pages/history/restore", {
    historyId,
  });
}
