import api from "@/lib/api-client";
import { IFileTask } from "@/features/file-task/types/file-task.types.ts";

export type EaImportMode = "replace" | "keep";

export async function importEaXml(
  file: File,
  spaceId: string,
  mode?: EaImportMode,
): Promise<IFileTask> {
  const formData = new FormData();
  formData.append("spaceId", spaceId);
  if (mode) {
    formData.append("mode", mode);
  }
  formData.append("file", file);

  const req = await api.post<IFileTask>("/pages/import-ea", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return req.data;
}

export async function getActiveEaImports(): Promise<IFileTask[]> {
  const req = await api.post<IFileTask[]>("/pages/import-ea/active");
  return req.data;
}

export async function cancelEaImport(fileTaskId: string): Promise<void> {
  await api.post("/pages/import-ea/cancel", { fileTaskId });
}
