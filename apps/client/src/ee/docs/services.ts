import api from "@/lib/api-client";
import type {
  DocMetadata,
  DocMetadataHealth,
  DocMetadataListParams,
  DocMetadataUpdate,
} from "./types";

export async function getDocMetadata(pageId: string): Promise<DocMetadata> {
  const response = await api.post<DocMetadata>("/ee/docs/metadata/info", {
    pageId,
  });
  return response.data;
}

export async function updateDocMetadata(
  data: DocMetadataUpdate,
): Promise<DocMetadata> {
  const response = await api.post<DocMetadata>("/ee/docs/metadata/update", data);
  return response.data;
}

export async function listDocMetadata(
  params: DocMetadataListParams,
): Promise<{ items: DocMetadata[]; hasMore: boolean }> {
  const response = await api.post<{ items: DocMetadata[]; hasMore: boolean }>(
    "/ee/docs/metadata/list",
    params,
  );
  return response.data;
}

export async function getDocMetadataHealth(params: {
  spaceIds?: string[];
}): Promise<DocMetadataHealth> {
  const response = await api.post<DocMetadataHealth>(
    "/ee/docs/metadata/health",
    params,
  );
  return response.data;
}
