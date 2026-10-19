import React from 'react';
import { Avatar } from '@mantine/core';
import { IconEdit, IconUser, IconUsers } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import StarButton from '@/features/favorite/components/star-button';
import type { SectionProps } from '../detail-info-panel.types';
import classes from '../DetailInfoPanel.module.css';

/** Owner card (title, contributors, favorite toggle) + creator / last editor rows. */
const PeopleSectionComponent: React.FC<SectionProps> = ({ page }) => {
  const { t } = useTranslation();
  const { creator, lastUpdatedBy } = page;
  const contributorsCount = page.contributors?.length ?? 0;
  const contributorLabel = contributorsCount === 0
    ? t('Owner, no contributors')
    : `${t('Owner')}, ${contributorsCount} ${t('contributors')}`;

  return (
    <>
      <div className={classes.ownerCard}>
        <Avatar
          src={creator?.avatarUrl}
          name={creator?.name ?? page.title ?? '?'}
          size="lg"
          color="blue"
          radius="md"
        />
        <div className={classes.ownerInfo}>
          <p className={classes.ownerName}>{page.title ?? '—'}</p>
          <p className={classes.ownerRole}>{contributorLabel}</p>
        </div>
        <div className={classes.ownerActions}>
          <StarButton type="page" pageId={page.id} name={page.title} size={15} />
        </div>
      </div>

      <p className={classes.sectionLabel}>{t('People')}</p>

      {creator && (
        <div className={classes.personRow}>
          <span className={classes.personLabel}>
            <IconUser size={13} />
            {t('Creator')}
          </span>
          <div className={classes.personRight}>
            <Avatar src={creator.avatarUrl} name={creator.name} size="xs" color="blue" />
            <span className={classes.personName}>{creator.name}</span>
          </div>
        </div>
      )}

      {lastUpdatedBy && (
        <div className={classes.personRow}>
          <span className={classes.personLabel}>
            <IconEdit size={13} />
            {t('Last updated by')}
          </span>
          <div className={classes.personRight}>
            <Avatar src={lastUpdatedBy.avatarUrl} name={lastUpdatedBy.name} size="xs" color="blue" />
            <span className={classes.personName}>{lastUpdatedBy.name}</span>
          </div>
        </div>
      )}

      {contributorsCount > 0 && (
        <div className={classes.personRow}>
          <span className={classes.personLabel}>
            <IconUsers size={13} />
            {t('Contributors')}
          </span>
          <span className={classes.rowValue}>{contributorsCount}</span>
        </div>
      )}
    </>
  );
};

export const PeopleSection = React.memo(PeopleSectionComponent);
