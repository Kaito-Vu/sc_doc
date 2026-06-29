import React from 'react';
import { Stack, UnstyledButton, Group, Text } from '@mantine/core';
import {
  IconArrowRight,
  IconHistory,
  IconDownload,
  IconPrinter,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { SectionProps } from '../detail-info-panel.types';
import commonClasses from './common.module.css';
import classes from './ActionsSection.module.css';

const ActionsSectionComponent: React.FC<SectionProps> = ({ page, pageId }) => {
  const { t } = useTranslation();

  const actions = [
    {
      icon: IconArrowRight,
      label: t('Move'),
      action: 'move',
    },
    {
      icon: IconHistory,
      label: t('History'),
      action: 'history',
    },
    {
      icon: IconDownload,
      label: t('Export'),
      action: 'export',
    },
    {
      icon: IconPrinter,
      label: t('Print'),
      action: 'print',
    },
  ];

  const handleAction = (action: string) => {
    // Will be connected to real handlers in Phase 4
    console.log(`Action: ${action} for page ${pageId}`);
  };

  return (
    <Stack gap="xs">
      <div className={commonClasses.title}>{t('ACTIONS')}</div>

      {actions.map((item) => {
        const Icon = item.icon;
        return (
          <UnstyledButton
            key={item.action}
            className={commonClasses.action}
            onClick={() => handleAction(item.action)}
          >
            <Group justify="space-between">
              <Group gap="sm">
                <Icon size={16} opacity={0.6} />
                <Text size="sm">{item.label}</Text>
              </Group>
            </Group>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
};

export const ActionsSection = React.memo(ActionsSectionComponent);
