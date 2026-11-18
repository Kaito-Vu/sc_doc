import { useMemo } from "react";
import { LineChart } from "@mantine/charts";
import "@mantine/charts/styles.css";
import { Paper, Text } from "@mantine/core";
import { formatNumber } from "@/ee/statistics/lib/format-number";
import { IWeeklyCount } from "@/ee/statistics/types/statistics.types";

interface TrendChartProps {
  title: string;
  data: IWeeklyCount[];
  seriesName: string;
  color?: string;
  monthly?: boolean; // points are month starts; label as "Nov 26"
}

export default function TrendChart({
  title,
  data,
  seriesName,
  color = "blue.6",
  monthly = false,
}: TrendChartProps) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        week: new Date(point.weekStart).toLocaleDateString(
          undefined,
          monthly
            ? { month: "short", year: "2-digit", timeZone: "UTC" }
            : { month: "short", day: "numeric" },
        ),
        [seriesName]: point.count,
      })),
    [data, monthly, seriesName],
  );

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} mb="sm">
        {title}
      </Text>
      <LineChart
        h={220}
        data={chartData}
        dataKey="week"
        series={[{ name: seriesName, color }]}
        curveType="linear"
        valueFormatter={formatNumber}
        withDots={chartData.length <= 20}
      />
    </Paper>
  );
}
