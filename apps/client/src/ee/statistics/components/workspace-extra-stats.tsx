import { Badge, Grid, Group, Paper, Stack, Table, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  IconActivity,
  IconClockPause,
  IconMessage,
  IconMessageExclamation,
} from "@tabler/icons-react";
import StatCard from "@/ee/statistics/components/stat-card";
import TrendChart from "@/ee/statistics/components/trend-chart";
import { formatBytes } from "@/ee/statistics/lib/format-bytes";
import { formatNumber } from "@/ee/statistics/lib/format-number";
import {
  useSpacesRankingQuery,
  useWorkspaceExtraStatisticsQuery,
} from "@/ee/statistics/queries/statistics-query";
import {
  ISpaceRankRow,
  IVerificationSummary,
} from "@/ee/statistics/types/statistics.types";

function RankingTable({
  title,
  valueLabel,
  rows,
  format = formatNumber,
  extraHeads = [],
  extraCells,
}: {
  title: string;
  valueLabel: string;
  rows: ISpaceRankRow[] | undefined;
  format?: (n: number) => string;
  extraHeads?: string[];
  extraCells?: (row: any) => (string | number)[];
}) {
  const { t } = useTranslation();
  return (
    <Paper withBorder p="md" radius="md" h="100%">
      <Text fw={600} mb="sm">
        {title}
      </Text>
      {rows && rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("No data yet.")}
        </Text>
      ) : (
        <Table verticalSpacing={4} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Space")}</Table.Th>
              <Table.Th ta="right">{valueLabel}</Table.Th>
              {extraHeads.map((h) => (
                <Table.Th key={h} ta="right">
                  {h}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows?.map((row) => (
              <Table.Tr key={row.spaceId}>
                <Table.Td>
                  <Text size="sm" lineClamp={1}>
                    {row.name}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">{format(row.value)}</Table.Td>
                {extraCells?.(row).map((c, i) => (
                  <Table.Td key={i} ta="right">
                    {typeof c === "number" ? formatNumber(c) : c}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}

function StatusBadges({
  title,
  counts,
  labels,
  overdueStatus,
}: {
  title: string;
  counts: Record<string, number>;
  labels: Record<string, string>;
  overdueStatus?: string;
}) {
  const entries = Object.entries(counts);
  return (
    <Stack gap={6}>
      <Text size="sm" c="dimmed">
        {title}
      </Text>
      <Group gap="md">
        {entries.map(([status, count]) => (
          <Group key={status} gap={6}>
            <Text size="sm">
              {labels[status] ??
                status.charAt(0).toUpperCase() +
                  status.slice(1).replace(/_/g, " ")}
            </Text>
            <Badge
              variant="light"
              color={status === overdueStatus ? "red" : undefined}
            >
              {formatNumber(count)}
            </Badge>
          </Group>
        ))}
      </Group>
    </Stack>
  );
}

function VerificationCard({ data }: { data: IVerificationSummary }) {
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    verified: t("Verified"),
    expiring: t("Expiring soon"),
    expired: t("Expired"),
    draft: t("Draft"),
    obsolete: t("Obsolete"),
    in_approval: t("In approval"),
    approved: t("Approved"),
    needs_clarification: t("Needs clarification"),
  };
  const hasExpiring = Object.keys(data.expiring).length > 0;
  const hasQms = Object.keys(data.qms).length > 0;

  return (
    <Paper withBorder p="md" radius="md" h="100%">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{t("Page verification")}</Text>
        {data.expiring.expired > 0 && (
          <Badge color="red" variant="light">
            {t("{{count}} overdue", { count: data.expiring.expired })}
          </Badge>
        )}
      </Group>
      {data.total === 0 && (
        <Text size="sm" c="dimmed">
          {t("No verification data yet.")}
        </Text>
      )}
      <Stack gap="md">
        {hasExpiring && (
          <StatusBadges
            title={t("Verification status")}
            counts={data.expiring}
            labels={labels}
            overdueStatus="expired"
          />
        )}
        {hasQms && (
          <StatusBadges
            title={t("Approval status")}
            counts={data.qms}
            labels={labels}
          />
        )}
      </Stack>
    </Paper>
  );
}

export default function WorkspaceExtraStats({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const { data, isLoading } = useWorkspaceExtraStatisticsQuery(enabled);
  const { data: ranking } = useSpacesRankingQuery(enabled);

  const n = (v?: number) => v ?? (isLoading ? "…" : 0);
  const trend = (pick: (p: NonNullable<typeof data>["monthlyTrend"][number]) => number) =>
    (data?.monthlyTrend ?? []).map((p) => ({
      weekStart: `${p.month}-01T00:00:00Z`,
      count: pick(p),
    }));

  const cards = [
    {
      label: t("Active users (7 days)"),
      value: n(data?.activeUsers.last7Days),
      icon: IconActivity,
    },
    {
      label: t("Active users (30 days)"),
      value: n(data?.activeUsers.last30Days),
      icon: IconActivity,
    },
    {
      label: t("Stale pages (90 days)"),
      value: n(data?.stalePages.over90Days),
      icon: IconClockPause,
    },
    {
      label: t("Stale pages (180 days)"),
      value: n(data?.stalePages.over180Days),
      icon: IconClockPause,
    },
    {
      label: t("Comments this month"),
      value: n(data?.comments.createdThisMonth),
      icon: IconMessage,
    },
    {
      label: t("Unresolved comments"),
      value: n(data?.comments.unresolved),
      icon: IconMessageExclamation,
    },
  ];

  return (
    <>
      <Grid mt="md">
        {cards.map((card) => (
          <Grid.Col key={card.label} span={{ base: 12, sm: 6, md: 4 }}>
            <StatCard {...card} />
          </Grid.Col>
        ))}
      </Grid>

      <Text fw={600} mt="lg">
        {t("Monthly trends (last 12 months)")}
      </Text>
      <Grid mt="xs">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TrendChart
            monthly
            title={t("Pages created per month")}
            data={trend((p) => p.pagesCreated)}
            seriesName={t("Pages")}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TrendChart
            monthly
            title={t("Active editors per month")}
            data={trend((p) => p.activeEditors)}
            seriesName={t("Editors")}
            color="violet.6"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TrendChart
            monthly
            title={t("Edits per month")}
            data={trend((p) => p.edits)}
            seriesName={t("Edits")}
            color="orange.6"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TrendChart
            monthly
            title={t("New users per month")}
            data={trend((p) => p.newUsers)}
            seriesName={t("Users")}
            color="teal.6"
          />
        </Grid.Col>
      </Grid>

      <Grid mt="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <RankingTable
            title={t("Top spaces by pages")}
            valueLabel={t("Pages")}
            rows={ranking?.byPages}
            extraHeads={[t("Edits this month"), t("Members")]}
            extraCells={(r) => [r.editsThisMonth, r.memberCount]}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <RankingTable
            title={t("Top spaces by storage")}
            valueLabel={t("Storage")}
            rows={ranking?.byStorage}
            format={formatBytes}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <RankingTable
            title={t("Top spaces by stale pages (90 days)")}
            valueLabel={t("Stale pages")}
            rows={ranking?.byStalePages}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          {data && <VerificationCard data={data.verification} />}
        </Grid.Col>
      </Grid>
    </>
  );
}
