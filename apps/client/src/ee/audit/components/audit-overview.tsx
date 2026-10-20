import React from "react";
import {
  Group,
  Paper,
  SimpleGrid,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { LineChart } from "@mantine/charts";
import "@mantine/charts/styles.css";
import {
  IconActivityHeartbeat,
  IconAlertTriangle,
  IconCalendarStats,
  IconShieldExclamation,
  IconUsers,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IAuditStats } from "@/ee/audit/types/audit.types";

type AuditOverviewProps = {
  stats?: IAuditStats;
  isLoading: boolean;
};

function formatNumber(value?: number): string {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat().format(value);
}

type MetricCardProps = {
  label: string;
  value?: number;
  hint?: string;
  icon: React.ElementType;
  color: string;
};

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  color,
}: MetricCardProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            {label}
          </Text>
          <Text fw={700} size="1.75rem" lh={1.2} mt={4}>
            {formatNumber(value)}
          </Text>
          {hint && (
            <Text size="xs" c="dimmed" mt={4}>
              {hint}
            </Text>
          )}
        </div>
        <ThemeIcon variant="light" color={color} size={38} radius="md">
          <Icon size={20} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

export function AuditOverview({ stats, isLoading }: AuditOverviewProps) {
  const { t } = useTranslation();

  if (!stats && !isLoading) return null;

  const timeline = (stats?.timeline ?? []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    [t("Events")]: point.count,
  }));

  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" mb="md">
        <MetricCard
          label={t("Total events")}
          value={stats?.total}
          hint={t("Matching the current filters")}
          icon={IconActivityHeartbeat}
          color="blue"
        />
        <MetricCard
          label={t("Events today")}
          value={stats?.today}
          hint={t("Since midnight UTC")}
          icon={IconCalendarStats}
          color="indigo"
        />
        <MetricCard
          label={t("Active actors")}
          value={stats?.activeActors}
          hint={t("Unique users, keys and apps")}
          icon={IconUsers}
          color="teal"
        />
        <MetricCard
          label={t("Security events")}
          value={stats?.securityEvents}
          hint={t("{{failed}} failed sign-ins", {
            failed: formatNumber(stats?.failedLogins),
          })}
          icon={IconShieldExclamation}
          color="red"
        />
      </SimpleGrid>

      {timeline.length > 1 && (
        <Paper withBorder p="md" radius="md" mb="md">
          <Group justify="space-between" mb="xs">
            <Group gap={6}>
              <IconAlertTriangle
                size={16}
                color="var(--mantine-color-dimmed)"
              />
              <Text fw={600}>{t("Activity trend")}</Text>
            </Group>
            <Tooltip label={t("Events per day, matching the current filters")}>
              <Text size="xs" c="dimmed">
                {t("{{days}} day(s)", { days: timeline.length })}
              </Text>
            </Tooltip>
          </Group>
          <LineChart
            h={160}
            data={timeline}
            dataKey="date"
            series={[{ name: t("Events"), color: "blue.6" }]}
            curveType="linear"
            withDots={timeline.length <= 20}
            gridAxis="y"
            withXAxis
            withYAxis
          />
        </Paper>
      )}
    </>
  );
}
