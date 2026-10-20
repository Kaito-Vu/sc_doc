import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  getDocMetadata,
  getDocMetadataHealth,
  listDocMetadata,
  updateDocMetadata,
} from "./services";
import type {
  DocMetadata,
  DocMetadataHealth,
  DocMetadataListParams,
  DocMetadataUpdate,
} from "./types";

const infoKey = (pageId: string) => ["doc-metadata", pageId];
const listKey = (params: DocMetadataListParams) => ["doc-metadata-list", params];
const healthKey = (spaceIds?: string[]) => ["doc-metadata-health", spaceIds ?? []];

export function useDocMetadataQuery(
  pageId: string | undefined,
): UseQueryResult<DocMetadata, Error> {
  return useQuery({
    queryKey: infoKey(pageId ?? ""),
    queryFn: () => getDocMetadata(pageId as string),
    enabled: !!pageId,
  });
}

export function useUpdateDocMetadataMutation(pageId: string | undefined) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<DocMetadata, Error, DocMetadataUpdate>({
    mutationFn: (data) => updateDocMetadata(data),
    onSuccess: (data) => {
      queryClient.setQueryData(infoKey(data.pageId ?? pageId ?? ""), data);
      queryClient.invalidateQueries({ queryKey: ["doc-metadata-list"] });
      queryClient.invalidateQueries({ queryKey: ["doc-metadata-health"] });
      notifications.show({ message: t("Document metadata saved") });
    },
    onError: (error: any) => {
      notifications.show({
        message:
          error?.response?.data?.message ?? t("Failed to save metadata"),
        color: "red",
      });
    },
  });
}

export function useDocMetadataListQuery(
  params: DocMetadataListParams,
): UseQueryResult<{ items: DocMetadata[]; hasMore: boolean }, Error> {
  return useQuery({
    queryKey: listKey(params),
    queryFn: () => listDocMetadata(params),
    placeholderData: keepPreviousData,
  });
}

export function useDocMetadataHealthQuery(
  spaceIds?: string[],
): UseQueryResult<DocMetadataHealth, Error> {
  return useQuery({
    queryKey: healthKey(spaceIds),
    queryFn: () => getDocMetadataHealth({ spaceIds }),
  });
}
