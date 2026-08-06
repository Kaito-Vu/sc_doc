import { Group, Paper, SegmentedControl, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import {
  IContributorStat,
  StatsPeriod,
} from "@/ee/statistics/types/statistics.types";

interface TopContributorsProps {
  data: IContributorStat[] | undefined;
  isLoading: boolean;
  period: StatsPeriod;
  onPeriodChange: (period: StatsPeriod) => void;
}

export default function TopContributors({
  data,
  isLoading,
  period,
  onPeriodChange,
}: TopContributorsProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{t("Top contributors")}</Text>
        <SegmentedControl
          size="xs"
          value={period}
          onChange={(value) => onPeriodChange(value as StatsPeriod)}
          data={[
            { label: t("Week"), value: "week" },
            { label: t("Month"), value: "month" },
            { label: t("Year"), value: "year" },
          ]}
        />
      </Group>

      <Stack gap="xs">
        {!isLoading && (!data || data.length === 0) && (
          <Text size="sm" c="dimmed">
            {t("No activity in this period yet.")}
          </Text>
        )}
        {data?.map((contributor, index) => (
          <Group
            key={contributor.userId}
            justify="space-between"
            wrap="nowrap"
          >
            <Group gap="sm" wrap="nowrap">
              <Text size="sm" c="dimmed" w={20}>
                {index + 1}
              </Text>
              <CustomAvatar
                size="sm"
                avatarUrl={contributor.avatarUrl}
                name={contributor.name}
              />
              <Text size="sm" lineClamp={1}>
                {contributor.name}
              </Text>
            </Group>
            <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              {t("{{created}} created · {{edited}} edited", {
                created: contributor.createdCount,
                edited: contributor.editCount,
              })}
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}
