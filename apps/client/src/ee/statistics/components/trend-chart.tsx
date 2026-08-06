import { LineChart } from "@mantine/charts";
import { Paper, Text } from "@mantine/core";
import { IWeeklyCount } from "@/ee/statistics/types/statistics.types";

interface TrendChartProps {
  title: string;
  data: IWeeklyCount[];
  seriesName: string;
  color?: string;
}

export default function TrendChart({
  title,
  data,
  seriesName,
  color = "blue.6",
}: TrendChartProps) {
  const chartData = data.map((point) => ({
    week: new Date(point.weekStart).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    [seriesName]: point.count,
  }));

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
        withDots={chartData.length <= 20}
      />
    </Paper>
  );
}
