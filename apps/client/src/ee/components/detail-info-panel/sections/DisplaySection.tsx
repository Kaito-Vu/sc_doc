import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageWidthToggle } from '@/features/user/components/page-width-pref';
import type { SectionProps } from '../detail-info-panel.types';
import classes from '../DetailInfoPanel.module.css';

// Full-width is a user preference: reuse the account-settings toggle, which
// saves via updateUser() and refreshes the user atom.
const DisplaySectionComponent: React.FC<SectionProps> = () => {
  const { t } = useTranslation();

  return (
    <>
      <p className={classes.sectionLabel}>{t('Display')}</p>
      <div className={classes.toggleRow}>
        <span className={classes.toggleLabel}>{t('Full-width')}</span>
        <PageWidthToggle size="xs" />
      </div>
    </>
  );
};

export const DisplaySection = React.memo(DisplaySectionComponent);
