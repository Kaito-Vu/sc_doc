import api from "@/lib/api-client";
import { IFileTask } from "@/features/file-task/types/file-task.types.ts";

export async function importEaXml(
  file: File,
  spaceId: string,
): Promise<IFileTask> {
  const formData = new FormData();
  formData.append("spaceId", spaceId);
  formData.append("file", file);

  const req = await api.post<IFileTask>("/pages/import-ea", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return req.data;
}
