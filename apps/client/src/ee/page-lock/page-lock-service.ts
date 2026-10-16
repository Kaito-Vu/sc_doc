import api from "@/lib/api-client";

export async function lockPage(pageId: string): Promise<void> {
  await api.post("/pages/lock", { pageId });
}

export async function unlockPage(pageId: string): Promise<void> {
  await api.post("/pages/unlock", { pageId });
}
