import React from 'react';
import { Stack, Group, Text, Skeleton } from '@mantine/core';
import { IconEye, IconEdit, IconClock, IconCalendar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { SectionProps } from '../detail-info-panel.types';
import { formatDate, formatRelativeTime, formatNumber } from '@/ee/utils/formatting';
import commonClasses from './common.module.css';
import classes from './StatsSection.module.css';

const StatsSectionComponent: React.FC<SectionProps> = ({ page, isLoading }) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Stack gap="sm">
        <Skeleton height={8} width="30%" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={24} />
        ))}
      </Stack>
    );
  }

  const stats = [
    {
      icon: IconEye,
      label: t('Views'),
      value: formatNumber(page?.viewCount || 0),
    },
    {
      icon: IconEdit,
      label: t('Edits'),
      value: formatNumber(page?.editCount || 0),
    },
    {
      icon: IconCalendar,
      label: t('Created'),
      value: page?.createdAt ? formatDate(page.createdAt) : '-',
    },
    {
      icon: IconClock,
      label: t('Last updated'),
      value: page?.updatedAt ? formatRelativeTime(page.updatedAt) : '-',
    },
  ];

  return (
    <Stack gap="sm">
      <div className={commonClasses.title}>{t('STATS')}</div>

      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Group key={index} justify="space-between" className={commonClasses.stat}>
            <Group gap="xs">
              <Icon size={16} opacity={0.6} />
              <Text size="sm">{stat.label}</Text>
            </Group>
            <Text size="sm" fw={500} c="dimmed">
              {stat.value}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
};

export const StatsSection = React.memo(StatsSectionComponent);
