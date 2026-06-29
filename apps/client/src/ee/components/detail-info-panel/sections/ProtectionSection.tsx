import React from 'react';
import { Stack, Switch, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SectionProps } from '../detail-info-panel.types';
import commonClasses from './common.module.css';
import classes from './ProtectionSection.module.css';

const ProtectionSectionComponent: React.FC<SectionProps> = ({ page, pageId }) => {
  const { t } = useTranslation();
  const [isProtected, setIsProtected] = React.useState(page.isProtected ?? false);

  const handleToggle = () => {
    // Will be connected to API in Phase 3
    setIsProtected(!isProtected);
  };

  return (
    <Stack gap="sm">
      <div className={commonClasses.title}>{t('PROTECTION')}</div>

      <div className={classes.setting}>
        <Text size="sm">{t('Protect this page')}</Text>
        <Switch
          checked={isProtected}
          onChange={handleToggle}
          aria-label={t('Toggle page protection')}
        />
      </div>
      <Text className={classes.description} size="xs">
        {t('Only editors can modify this page')}
      </Text>
    </Stack>
  );
};

export const ProtectionSection = React.memo(ProtectionSectionComponent);
