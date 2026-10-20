import { useState } from "react";
import { Grid } from "@mantine/core";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import {
  IconFiles,
  IconUsers,
  IconUserCheck,
  IconSpaces,
  IconDatabase,
  IconUserOff,
} from "@tabler/icons-react";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import StatCard from "@/ee/statistics/components/stat-card";
import TrendChart from "@/ee/statistics/components/trend-chart";
import TopContributors from "@/ee/statistics/components/top-contributors";
import UsersByRole from "@/ee/statistics/components/users-by-role";
import {
  useWorkspaceStatisticsQuery,
  useWorkspaceTopContributorsQuery,
} from "@/ee/statistics/queries/statistics-query";
import { StatsPeriod } from "@/ee/statistics/types/statistics.types";
import { formatBytes } from "@/ee/statistics/lib/format-bytes";

export default function WorkspaceStatistics() {
  const { t } = useTranslation();
  const hasStatistics = useHasFeature(Feature.STATISTICS);
  const { data: stats, isLoading } =
    useWorkspaceStatisticsQuery(hasStatistics);
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const { data: contributors, isLoading: contributorsLoading } =
    useWorkspaceTopContributorsQuery(period, hasStatistics);

  if (!hasStatistics) {
    return null;
  }

  const count = (n?: number) => n ?? (isLoading ? "…" : 0);
  const cards = [
    { label: t("Total pages"), value: count(stats?.totalPages), icon: IconFiles },
    { label: t("Total users"), value: count(stats?.totalUsers), icon: IconUsers },
    { label: t("Active users"), value: count(stats?.totalActiveUsers), icon: IconUserCheck },
    { label: t("Total spaces"), value: count(stats?.totalSpaces), icon: IconSpaces },
    { label: t("Storage used"), value: formatBytes(stats?.storageUsedBytes ?? 0), icon: IconDatabase },
    { label: t("Never logged in"), value: count(stats?.usersNeverLoggedIn), icon: IconUserOff },
  ];

  return (
    <>
      <Helmet>
        <title>
          {t("Statistics")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Statistics")} />

      <Grid mt="md">
        {cards.map((card) => (
          <Grid.Col key={card.label} span={{ base: 12, sm: 6, md: 4 }}>
            <StatCard {...card} />
          </Grid.Col>
        ))}
      </Grid>

      {stats?.usersByRole && (
        <Grid mt="md">
          <Grid.Col span={12}>
            <UsersByRole data={stats.usersByRole} />
          </Grid.Col>
        </Grid>
      )}

      <Grid mt="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TrendChart
            title={t("Pages created per week")}
            data={stats?.pagesCreatedByWeek ?? []}
            seriesName={t("Pages")}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TrendChart
            title={t("Users joined per week")}
            data={stats?.usersJoinedByWeek ?? []}
            seriesName={t("Users")}
            color="teal.6"
          />
        </Grid.Col>
      </Grid>

      <Grid mt="md">
        <Grid.Col span={12}>
          <TopContributors
            data={contributors}
            isLoading={contributorsLoading}
            period={period}
            onPeriodChange={setPeriod}
          />
        </Grid.Col>
      </Grid>
    </>
  );
}
