import React from 'react';
import { Badge, Switch } from '@mantine/core';
import { IconLock, IconLockOpen } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { usePageLock } from '@/ee/page-lock/use-page-lock';
import type { SectionProps } from '../detail-info-panel.types';
import classes from '../DetailInfoPanel.module.css';

const LockSectionComponent: React.FC<SectionProps> = () => {
  const { t } = useTranslation();
  const { enabled, page, locked, canUnlock, lock, unlock } = usePageLock();

  if (!enabled || page?.isBase) return null;

  const canEdit = page?.permissions?.canEdit ?? false;
  const pending = lock.isPending || unlock.isPending;

  return (
    <div className={classes.toggleRow}>
      <span className={classes.toggleLabel}>
        {locked ? <IconLock size={13} /> : <IconLockOpen size={13} />}{' '}
        {t('Lock this page')}{' '}
        <Badge size="xs" variant="light" color={locked ? 'orange' : 'gray'}>
          {locked ? t('Locked') : t('Unlocked')}
        </Badge>
      </span>
      <Switch
        checked={locked}
        onChange={(e) =>
          e.currentTarget.checked ? lock.mutate() : unlock.mutate()
        }
        size="xs"
        color="blue"
        disabled={pending || (locked ? !canUnlock : !canEdit)}
        aria-label={t('Lock this page')}
      />
    </div>
  );
};

export const LockSection = React.memo(LockSectionComponent);
