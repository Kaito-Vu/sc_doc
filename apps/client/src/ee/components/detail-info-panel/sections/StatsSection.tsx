import React from 'react';
import { IconCalendar, IconClock, IconEdit, IconEye } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { usePageStats } from '@/ee/hooks/usePageStats';
import { useTimeAgo } from '@/hooks/use-time-ago';
import { formattedDate } from '@/lib/time';
import type { SectionProps } from '../detail-info-panel.types';
import classes from '../DetailInfoPanel.module.css';

const StatsSectionComponent: React.FC<SectionProps> = ({ page, pageId }) => {
  const { t } = useTranslation();
  const { data: pageStats } = usePageStats(pageId);
  const updatedAgo = useTimeAgo(page.updatedAt);

  return (
    <>
      <p className={classes.sectionLabel}>{t('Stats')}</p>

      <div className={classes.row}>
        <span className={classes.rowLabel}><IconEye size={13} />{t('Views')}</span>
        <span className={classes.rowValue}>{pageStats?.viewCount ?? 0}</span>
      </div>

      <div className={classes.row}>
        <span className={classes.rowLabel}><IconEdit size={13} />{t('Edits')}</span>
        <span className={classes.rowValue}>{pageStats?.editCount ?? 0}</span>
      </div>

      <div className={classes.row}>
        <span className={classes.rowLabel}><IconCalendar size={13} />{t('Created')}</span>
        <span className={classes.rowText}>
          {page.createdAt ? formattedDate(page.createdAt) : '—'}
        </span>
      </div>

      <div className={classes.row}>
        <span className={classes.rowLabel}><IconClock size={13} />{t('Last updated')}</span>
        <span className={classes.rowText}>{updatedAgo ?? '—'}</span>
      </div>
    </>
  );
};

export const StatsSection = React.memo(StatsSectionComponent);
