import { useState } from "react";
import { Grid } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IconFiles, IconUsers, IconActivity } from "@tabler/icons-react";
import StatCard from "@/ee/statistics/components/stat-card";
import TopContributors from "@/ee/statistics/components/top-contributors";
import {
  useSpaceStatisticsQuery,
  useSpaceTopContributorsQuery,
} from "@/ee/statistics/queries/statistics-query";
import { StatsPeriod } from "@/ee/statistics/types/statistics.types";

interface SpaceStatisticsProps {
  spaceId: string;
}

export default function SpaceStatistics({ spaceId }: SpaceStatisticsProps) {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useSpaceStatisticsQuery(spaceId, true);
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const { data: contributors, isLoading: contributorsLoading } =
    useSpaceTopContributorsQuery(spaceId, period, true);

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
