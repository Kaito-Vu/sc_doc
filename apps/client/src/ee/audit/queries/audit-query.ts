import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  exportAuditLogs,
  getAuditFacets,
  getAuditLogDetail,
  getAuditLogs,
  getAuditRetention,
  getAuditStats,
  updateAuditRetention,
} from "@/ee/audit/services/audit-service";
import {
  IAuditFacets,
  IAuditLog,
  IAuditLogParams,
  IAuditStats,
} from "@/ee/audit/types/audit.types";
import { IPagination } from "@/lib/types";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

export function useAuditLogsQuery(
  params?: IAuditLogParams,
  enabled = true,
): UseQueryResult<IPagination<IAuditLog>, Error> {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => getAuditLogs(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAuditStatsQuery(
  params?: IAuditLogParams,
  enabled = true,
): UseQueryResult<IAuditStats, Error> {
  return useQuery({
    queryKey: ["audit-stats", params],
    queryFn: () => getAuditStats(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAuditFacetsQuery(
  params?: IAuditLogParams,
  enabled = true,
): UseQueryResult<IAuditFacets, Error> {
  return useQuery({
    queryKey: ["audit-facets", params],
    queryFn: () => getAuditFacets(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAuditLogDetailQuery(id: string | null) {
  return useQuery({
    queryKey: ["audit-log-detail", id],
    queryFn: () => getAuditLogDetail(id!),
    enabled: Boolean(id),
  });
}

export function useExportAuditLogsMutation() {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (params: IAuditLogParams) => exportAuditLogs(params),
    onError: (error) => {
      const errorMessage =
        (error as any)?.response?.data?.message ?? t("Export failed");
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}

export function useAuditRetentionQuery() {
  return useQuery({
    queryKey: ["audit-retention"],
    queryFn: () => getAuditRetention(),
  });
}

export function useUpdateAuditRetentionMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: { auditRetentionDays: number }) =>
      updateAuditRetention(data),
    onSuccess: () => {
      notifications.show({ message: t("Audit retention updated") });
      queryClient.invalidateQueries({ queryKey: ["audit-retention"] });
    },
    onError: (error) => {
      const errorMessage = (error as any)["response"]?.data?.message;
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}
