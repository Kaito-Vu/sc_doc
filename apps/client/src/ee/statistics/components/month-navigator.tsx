import { ActionIcon, Group, Text } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  formatMonthLabel,
  MAX_MONTHS_BACK,
  monthsBetween,
  shiftMonth,
} from "@/ee/statistics/lib/month";

interface MonthNavigatorProps {
  month: string;
  /** Latest selectable month (server's current month). */
  current: string;
  onChange: (month: string) => void;
}

export default function MonthNavigator({
  month,
  current,
  onChange,
}: MonthNavigatorProps) {
  const { t, i18n } = useTranslation();

  return (
    <Group gap={4} wrap="nowrap">
      <ActionIcon
        variant="subtle"
        size="sm"
        aria-label={t("Previous month")}
        disabled={monthsBetween(month, current) >= MAX_MONTHS_BACK}
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <IconChevronLeft size={16} />
      </ActionIcon>
      <Text size="sm" fw={500} miw={120} ta="center">
        {formatMonthLabel(month, i18n.language)}
      </Text>
      <ActionIcon
        variant="subtle"
        size="sm"
        aria-label={t("Next month")}
        disabled={month >= current}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <IconChevronRight size={16} />
      </ActionIcon>
    </Group>
  );
}
