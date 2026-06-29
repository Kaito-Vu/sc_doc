import React from 'react';
import { Stack, Switch, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SectionProps } from '../detail-info-panel.types';
import commonClasses from './common.module.css';
import classes from './DisplaySection.module.css';

const DisplaySectionComponent: React.FC<SectionProps> = ({ page, pageId }) => {
  const { t } = useTranslation();
  const [isFullWidth, setIsFullWidth] = React.useState(page.isFullWidth ?? false);

  const handleToggle = () => {
    // Will be connected to API in Phase 3
    setIsFullWidth(!isFullWidth);
  };

  return (
    <Stack gap="sm">
      <div className={commonClasses.title}>{t('DISPLAY')}</div>

      <div className={classes.setting}>
        <Text size="sm">{t('Full-width')}</Text>
        <Switch
          checked={isFullWidth}
          onChange={handleToggle}
          aria-label={t('Toggle full-width mode')}
        />
      </div>
      <Text className={classes.description} size="xs">
        {t('Content spans full width when enabled')}
      </Text>
    </Stack>
  );
};

export const DisplaySection = React.memo(DisplaySectionComponent);
