import { useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Space,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { IconDownload, IconRefresh, IconSettings } from "@tabler/icons-react";
import { saveAs } from "file-saver";
import { useQueryClient } from "@tanstack/react-query";
import SettingsTitle from "@/components/settings/settings-title";
import Paginate from "@/components/common/paginate";
import { useCursorPaginate } from "@/hooks/use-cursor-paginate";
import {
  useAuditFacetsQuery,
  useAuditLogsQuery,
  useAuditLogDetailQuery,
  useAuditStatsQuery,
  useExportAuditLogsMutation,
} from "@/ee/audit/queries/audit-query";
import { IAuditLog, IAuditLogParams } from "@/ee/audit/types/audit.types";
import AuditLogsTable from "@/ee/audit/components/audit-logs-table";
import { AuditOverview } from "@/ee/audit/components/audit-overview";
import {
  AuditFilters,
  AuditFilterState,
  emptyAuditFilters,
} from "@/ee/audit/components/audit-filters";
import { AuditLogDrawer } from "@/ee/audit/components/audit-log-drawer";
import { AuditRetentionModal } from "@/ee/audit/components/audit-retention-modal";
import SiemStreamingPanel from "@/ee/siem/components/siem-streaming-panel";
import useUserRole from "@/hooks/use-user-role";
import { DocumentTitle } from "@/components/ui/document-title.tsx";

const PAGE_SIZE = 50;

function looksLikeIp(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;

  const ipv4 = candidate.split(".");
  if (
    ipv4.length === 4 &&
    ipv4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  ) {
    return true;
  }

  return candidate.includes(":") && /^[0-9a-fA-F:]+$/.test(candidate);
}

export default function AuditLogs() {
  const { t } = useTranslation();
  const { isOwner } = useUserRole();
  const { cursor, goNext, goPrev, resetCursor } = useCursorPaginate();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<AuditFilterState>(emptyAuditFilters);
  const [debouncedSearch] = useDebouncedValue(filters.search, 350);
  const [retentionOpened, setRetentionOpened] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const queryFilters: IAuditLogParams = useMemo(() => {
    const search = debouncedSearch.trim();
    const ipAddress = filters.ipAddress.trim();

    return {
      search: search || undefined,
      events: filters.events.length > 0 ? filters.events : undefined,
      resourceType: filters.resourceType ?? undefined,
      actorId: filters.actorId ?? undefined,
      spaceId: filters.spaceId ?? undefined,
      actorTypes:
        filters.actorTypes.length > 0 ? filters.actorTypes : undefined,
      ipAddress: looksLikeIp(ipAddress) ? ipAddress : undefined,
      startDate: filters.startDate ?? undefined,
      endDate: filters.endDate ?? undefined,
    };
  }, [
    debouncedSearch,
    filters.events,
    filters.resourceType,
    filters.actorId,
    filters.spaceId,
    filters.actorTypes,
    filters.ipAddress,
    filters.startDate,
    filters.endDate,
  ]);

  const params: IAuditLogParams = useMemo(
    () => ({ ...queryFilters, cursor, limit: PAGE_SIZE }),
    [queryFilters, cursor],
  );

  const { data, isLoading, isFetching } = useAuditLogsQuery(params);
  const { data: stats, isLoading: statsLoading } =
    useAuditStatsQuery(queryFilters);
  const { data: facets } = useAuditFacetsQuery(queryFilters);
  const detailQuery = useAuditLogDetailQuery(selectedLogId);
  const exportMutation = useExportAuditLogsMutation();

  const activeFilterCount =
    (filters.events.length > 0 ? 1 : 0) +
    (filters.resourceType ? 1 : 0) +
    (filters.actorId ? 1 : 0) +
    (filters.spaceId ? 1 : 0) +
    (filters.actorTypes.length > 0 ? 1 : 0) +
    (filters.ipAddress ? 1 : 0) +
    (filters.startDate ? 1 : 0) +
    (filters.search ? 1 : 0);

  const activeTab = location.pathname.endsWith("/siem") ? "siem" : "audit";

  if (!isOwner) {
    return null;
  }

  const handleFilters = (next: AuditFilterState) => {
    setFilters(next);
    resetCursor();
  };

  const handleReset = () => {
    handleFilters(emptyAuditFilters);
  };

  const handleTabChange = (value: string | null) => {
    if (value === "siem") {
      navigate("/settings/audit/siem");
    } else {
      navigate("/settings/audit");
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    queryClient.invalidateQueries({ queryKey: ["audit-stats"] });
    queryClient.invalidateQueries({ queryKey: ["audit-facets"] });
  };

  const handleExport = () => {
    exportMutation.mutate(queryFilters, {
      onSuccess: (blob) => {
        saveAs(blob, `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`);
        notifications.show({
          message: t("Audit log export is ready."),
          color: "green",
        });
      },
    });
  };

  const handleSelect = (entry: IAuditLog) => {
    setSelectedLogId(entry.id);
  };

  const totalLabel =
    data?.items && data.items.length > 0
      ? t("Showing {{total}} events", { total: data.items.length })
      : null;

  return (
    <>
      <DocumentTitle title={t("Audit logs")} />

      <SettingsTitle title={t("Audit logs")} />

      <Tabs color="dark" value={activeTab} onChange={handleTabChange}>
        <Tabs.List>
          <Tabs.Tab fw={500} value="audit">
            {t("Audit logs")}
          </Tabs.Tab>
          <Tabs.Tab fw={500} value="siem">
            {t("SIEM")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="audit" pt="md">
          <AuditOverview stats={stats} isLoading={statsLoading} />

          <AuditFilters
            value={filters}
            facets={facets}
            onChange={handleFilters}
            onReset={handleReset}
          />

          <Group justify="space-between" mb="xs" wrap="wrap" gap="sm">
            <Group gap="xs">
              <Text fw={600}>{t("Activity")}</Text>
              {totalLabel && (
                <Text size="xs" c="dimmed">
                  {totalLabel}
                </Text>
              )}
              {isFetching && (
                <Text size="xs" c="dimmed">
                  {t("Refreshing…")}
                </Text>
              )}
            </Group>

            <Group gap="xs">
              <Tooltip label={t("Refresh")}>
                <ActionIcon
                  variant="default"
                  size="input-sm"
                  onClick={handleRefresh}
                  loading={isFetching && !isLoading}
                  aria-label={t("Refresh")}
                >
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("Export current view as CSV")}>
                <Button
                  variant="default"
                  size="compact-sm"
                  leftSection={<IconDownload size={16} />}
                  onClick={handleExport}
                  loading={exportMutation.isPending}
                >
                  {t("Export CSV")}
                </Button>
              </Tooltip>
              <Tooltip label={t("Retention settings")}>
                <ActionIcon
                  variant="default"
                  size="input-sm"
                  onClick={() => setRetentionOpened(true)}
                  aria-label={t("Retention settings")}
                >
                  <IconSettings size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <AuditLogsTable
            items={data?.items}
            isLoading={isLoading}
            onSelect={handleSelect}
            hasFilters={activeFilterCount > 0}
            onClearFilters={handleReset}
          />

          <Space h="md" />

          {data?.items && data.items.length > 0 && (
            <Paginate
              hasPrevPage={data?.meta?.hasPrevPage}
              hasNextPage={data?.meta?.hasNextPage}
              onNext={() => goNext(data?.meta?.nextCursor)}
              onPrev={goPrev}
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="siem" pt="md">
          <SiemStreamingPanel />
        </Tabs.Panel>
      </Tabs>

      <AuditLogDrawer
        opened={Boolean(selectedLogId)}
        onClose={() => setSelectedLogId(null)}
        log={detailQuery.data}
        isLoading={detailQuery.isLoading}
      />

      <AuditRetentionModal
        opened={retentionOpened}
        onClose={() => setRetentionOpened(false)}
      />
    </>
  );
}
