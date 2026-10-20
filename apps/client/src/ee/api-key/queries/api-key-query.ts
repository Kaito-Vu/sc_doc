import { IPagination, QueryParams } from "@/lib/types.ts";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  createApiKey,
  getApiKeys,
  IApiKey,
  ICreateApiKeyRequest,
  IUpdateApiKeyRequest,
  revokeApiKey,
  updateApiKey,
} from "@/ee/api-key";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { notifyError } from "../../lib/notify-error";

export function useGetApiKeysQuery(
  params?: QueryParams,
): UseQueryResult<IPagination<IApiKey>, Error> {
  return useQuery({
    queryKey: ["api-key-list", params],
    queryFn: () => getApiKeys(params),
    staleTime: 0,
    gcTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useRevokeApiKeyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<
    void,
    Error,
    {
      apiKeyId: string;
    }
  >({
    mutationFn: (data) => revokeApiKey(data),
    onSuccess: (data, variables) => {
      notifications.show({ message: t("Revoked successfully") });
      queryClient.invalidateQueries({
        predicate: (item) =>
          ["api-key-list"].includes(item.queryKey[0] as string),
      });
    },
    onError: (error) => notifyError(error, t("Failed to revoke API key")),
  });
}

export function useCreateApiKeyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<IApiKey, Error, ICreateApiKeyRequest>({
    mutationFn: (data) => createApiKey(data),
    onSuccess: () => {
      notifications.show({
        message: t("{{credential}} created successfully", {
          credential: t("API key"),
        }),
      });
      queryClient.invalidateQueries({
        predicate: (item) =>
          ["api-key-list"].includes(item.queryKey[0] as string),
      });
    },
    onError: (error) => notifyError(error, t("Failed to create API key")),
  });
}

export function useUpdateApiKeyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<IApiKey, Error, IUpdateApiKeyRequest>({
    mutationFn: (data) => updateApiKey(data),
    onSuccess: (data, variables) => {
      notifications.show({ message: t("Updated successfully") });
      queryClient.invalidateQueries({
        predicate: (item) =>
          ["api-key-list"].includes(item.queryKey[0] as string),
      });
    },
    onError: (error) => notifyError(error, t("Failed to update API key")),
  });
}
