import React, { useEffect, useState } from 'react';
import { Switch } from '@mantine/core';
import { IconLock, IconLockOpen } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePageSettings } from '@/ee/hooks/usePageSettings';
import { updatePageSettings } from '@/ee/api/detail-info-panel-api';
import type { SectionProps } from '../detail-info-panel.types';
import classes from '../DetailInfoPanel.module.css';

const ProtectionSectionComponent: React.FC<SectionProps> = ({ pageId }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: pageSettings } = usePageSettings(pageId);
  const [isProtected, setIsProtected] = useState(false);

  useEffect(() => {
    if (pageSettings?.isProtected !== undefined) {
      setIsProtected(pageSettings.isProtected);
    }
  }, [pageSettings?.isProtected]);

  const protectionMutation = useMutation({
    mutationFn: (value: boolean) => updatePageSettings(pageId, { isProtected: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-settings', pageId] });
    },
    onError: (error, value) => {
      console.error('Error updating protection setting:', error);
      setIsProtected(!value);
    },
  });

  return (
    <>
      <p className={classes.sectionLabel}>{t('Protection')}</p>
      <div className={classes.toggleRow}>
        <span className={classes.toggleLabel}>
          {isProtected ? <IconLock size={13} /> : <IconLockOpen size={13} />}{' '}
          {t('Protect this page')}
        </span>
        <Switch
          checked={isProtected}
          onChange={(e) => {
            const newValue = e.currentTarget.checked;
            setIsProtected(newValue);
            protectionMutation.mutate(newValue);
          }}
          size="xs"
          color="blue"
          disabled={protectionMutation.isPending}
          aria-label={t('Toggle page protection')}
        />
      </div>
    </>
  );
};

export const ProtectionSection = React.memo(ProtectionSectionComponent);
