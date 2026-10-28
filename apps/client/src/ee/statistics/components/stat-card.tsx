import { Group, Paper, Text, ThemeIcon } from "@mantine/core";
import React from "react";
import { formatNumber } from "@/ee/statistics/lib/format-number";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
}

export default function StatCard({ label, value, icon: IconComp }: StatCardProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            {label}
          </Text>
          <Text fw={700} size="xl">
            {typeof value === "number" ? formatNumber(value) : value}
          </Text>
        </div>
        <ThemeIcon variant="light" size={38} radius="md">
          <IconComp size={20} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}
