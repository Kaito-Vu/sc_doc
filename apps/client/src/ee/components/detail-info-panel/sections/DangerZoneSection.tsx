import React from 'react';
import { Button } from '@mantine/core';
import { IconArchive, IconArchiveOff, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useRestorePageMutation } from '@/features/page/queries/page-query';
import { useDeletePageModal } from '@/features/page/hooks/use-delete-page-modal';
import { useTreeMutation } from '@/features/page/tree/hooks/use-tree-mutation';
import { archivePage } from '@/ee/api/detail-info-panel-api';
import type { SectionProps } from '../detail-info-panel.types';
import classes from '../DetailInfoPanel.module.css';

const DangerZoneSectionComponent: React.FC<SectionProps> = ({ page, pageId }) => {
  const { t } = useTranslation();
  // Same trash/restore flow as the page header menu (tree update, undo toast,
  // navigation) instead of ad-hoc fetch calls.
  const { openDeleteModal } = useDeletePageModal();
  const { handleDelete } = useTreeMutation(page.spaceId);
  const restoreMutation = useRestorePageMutation();
  // TODO: archive needs its own server endpoint (docs/detail_info_panel/API_REQUIREMENTS.md).
  const archiveMutation = useMutation({
    mutationFn: () => archivePage(page.id),
    onError: () => {
      notifications.show({ message: t('Failed to archive page'), color: 'red' });
    },
  });

  const isArchived = page.deletedAt !== null && page.deletedAt !== undefined;

  const handleArchiveToggle = () => {
    if (isArchived) restoreMutation.mutate(page.id);
    else archiveMutation.mutate();
  };

  return (
    <>
      <div className={classes.dangerDivider} />
      <p className={classes.dangerLabel}>{t('Danger Zone')}</p>
      <div className={classes.dangerGrid}>
        <Button
          variant="light"
          color={isArchived ? 'blue' : 'yellow'}
          size="xs"
          leftSection={isArchived ? <IconArchiveOff size={13} /> : <IconArchive size={13} />}
          className={classes.actionBtn}
          fullWidth
          onClick={handleArchiveToggle}
          loading={archiveMutation.isPending || restoreMutation.isPending}
        >
          {isArchived ? t('Restore') : t('Archive')}
        </Button>
        <Button
          variant="light"
          color="red"
          size="xs"
          leftSection={<IconTrash size={13} />}
          className={classes.actionBtn}
          fullWidth
          onClick={() => openDeleteModal({ onConfirm: () => handleDelete(page.id) })}
        >
          {t('Trash')}
        </Button>
      </div>
    </>
  );
};

export const DangerZoneSection = React.memo(DangerZoneSectionComponent);
