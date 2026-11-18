import { useState } from "react";
import { Grid, Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  IconFiles,
  IconUsers,
  IconActivity,
  IconFilePlus,
  IconEdit,
  IconMessage,
  IconClockPause,
} from "@tabler/icons-react";
import StatCard from "@/ee/statistics/components/stat-card";
import TopContributors from "@/ee/statistics/components/top-contributors";
import {
  useSpaceOverviewQuery,
  useSpaceStatisticsQuery,
  useSpaceTopContributorsQuery,
} from "@/ee/statistics/queries/statistics-query";
import { currentMonthKey } from "@/ee/statistics/lib/month";
import { formatNumber } from "@/ee/statistics/lib/format-number";

interface SpaceStatisticsProps {
  spaceId: string;
}

export default function SpaceStatistics({ spaceId }: SpaceStatisticsProps) {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useSpaceStatisticsQuery(spaceId, true);
  const { data: overview, isLoading: overviewLoading } = useSpaceOverviewQuery(
    spaceId,
    true,
  );
  const [month, setMonth] = useState<string>(currentMonthKey());
  const { data: contributors, isLoading: contributorsLoading } =
    useSpaceTopContributorsQuery(spaceId, month, true);

  const ov = (n?: number) => n ?? (overviewLoading ? "…" : 0);

  return (
    <>
      <Grid>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <StatCard
            label={t("Total pages")}
            value={stats?.totalPages ?? (isLoading ? "…" : 0)}
            icon={IconFiles}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <StatCard
            label={t("Members")}
            value={stats?.totalMembers ?? (isLoading ? "…" : 0)}
            icon={IconUsers}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <StatCard
            label={t("Updated (7 days)")}
            value={stats?.pagesUpdatedLast7Days ?? (isLoading ? "…" : 0)}
            icon={IconActivity}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <StatCard
            label={t("Pages created this month")}
            value={ov(overview?.pagesCreated)}
            icon={IconFilePlus}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <StatCard
            label={t("Pages edited this month")}
            value={ov(overview?.pagesEdited)}
            icon={IconEdit}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <StatCard
            label={t("Comments this month")}
            value={ov(overview?.comments.createdInMonth)}
            icon={IconMessage}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <StatCard
            label={t("Stale pages (90 days)")}
            value={ov(overview?.stalePages90Days)}
            icon={IconClockPause}
          />
        </Grid.Col>
      </Grid>

      <Grid mt="md">
        <Grid.Col span={12}>
          <Paper withBorder p="md" radius="md">
            <Text fw={600} mb="sm">
              {t("Most edited pages this month")}
            </Text>
            <Stack gap="xs">
              {overview && overview.mostEditedPages.length === 0 && (
                <Text size="sm" c="dimmed">
                  {t("No data yet.")}
                </Text>
              )}
              {overview?.mostEditedPages.map((page, index) => (
                <Group key={page.pageId} justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap">
                    <Text size="sm" c="dimmed" w={20}>
                      {index + 1}
                    </Text>
                    <Text size="sm" lineClamp={1}>
                      {page.icon ? `${page.icon} ` : ""}
                      {page.title || t("Untitled")}
                    </Text>
                  </Group>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    {t("{{count}} edits", { count: formatNumber(page.edits) })}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={12}>
          <TopContributors
            data={contributors}
            isLoading={contributorsLoading}
            month={month}
            onMonthChange={setMonth}
          />
        </Grid.Col>
      </Grid>
    </>
  );
}
