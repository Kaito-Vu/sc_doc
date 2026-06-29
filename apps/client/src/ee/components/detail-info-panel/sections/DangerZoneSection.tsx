import React, { useState } from 'react';
import { Stack, Button, Group, Text, Modal, Checkbox, Alert } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SectionProps } from '../detail-info-panel.types';
import { archivePage, deletePage, restorePage } from '@/ee/api/detail-info-panel-api';
import commonClasses from './common.module.css';
import classes from './DangerZoneSection.module.css';

const DangerZoneSectionComponent: React.FC<SectionProps> = ({ page, pageId }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState<'archive' | 'delete' | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: () => archivePage(pageId),
    onSuccess: () => {
      setOpenModal(null);
      setConfirmed(false);
      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['page-stats', pageId] });
      console.log('Page archived successfully');
    },
    onError: (error) => {
      console.error('Error archiving page:', error);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deletePage(pageId),
    onSuccess: () => {
      setOpenModal(null);
      setConfirmed(false);
      queryClient.invalidateQueries({ queryKey: ['page-stats', pageId] });
      // Navigate away after deletion
      globalThis.location.href = '/home';
    },
    onError: (error) => {
      console.error('Error deleting page:', error);
    },
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: () => restorePage(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-stats', pageId] });
      console.log('Page restored successfully');
    },
    onError: (error) => {
      console.error('Error restoring page:', error);
    },
  });

  const handleArchiveAction = () => {
    if (page.isArchived) {
      restoreMutation.mutate();
      return;
    }
    setOpenModal('archive');
  };

  const handleArchive = () => {
    if (confirmed) {
      archiveMutation.mutate();
    }
  };

  const handleDelete = () => {
    if (confirmed) {
      deleteMutation.mutate();
    }
  };

  return (
    <>
      <Stack gap="sm" className={commonClasses.dangerZone}>
        <div className={commonClasses.title}>{t('DANGER ZONE')}</div>

        <div className={classes.dangerAction}>
          <div>
            <Text className={classes.dangerActionTitle}>
              {t('Archive')}
            </Text>
            <Text className={classes.dangerActionDescription}>
              {t('Move page to archive')}
            </Text>
          </div>
          <Button
            size="xs"
            variant="light"
            color="yellow"
            onClick={handleArchiveAction}
            className={classes.dangerButton}
            loading={page.isArchived && restoreMutation.isPending}
          >
            {page.isArchived ? t('Restore') : t('Archive')}
          </Button>
        </div>

        <div className={classes.dangerAction}>
          <div>
            <Text className={classes.dangerActionTitle}>
              {t('Trash')}
            </Text>
            <Text className={classes.dangerActionDescription}>
              {t('Move page to trash')}
            </Text>
          </div>
          <Button
            size="xs"
            variant="light"
            color="red"
            onClick={() => setOpenModal('delete')}
            className={classes.dangerButton}
          >
            {t('Trash')}
          </Button>
        </div>
      </Stack>

      {/* Archive Confirmation Modal */}
      <Modal
        opened={openModal === 'archive'}
        onClose={() => {
          setOpenModal(null);
          setConfirmed(false);
        }}
        title={t('Archive page')}
      >
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={16} />} color="yellow" title={t('Archive page')}>
            {t('This page will be moved to archive. You can restore it later.')}
          </Alert>

          <Text size="sm">
            {t('Page title')}: <strong>{page?.title}</strong>
          </Text>

          <Checkbox
            label={t('I understand this action cannot be undone immediately')}
            checked={confirmed}
            onChange={(e) => setConfirmed(e.currentTarget.checked)}
          />

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setOpenModal(null);
                setConfirmed(false);
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              color="yellow"
              onClick={handleArchive}
              loading={archiveMutation.isPending}
              disabled={!confirmed}
            >
              {t('Archive')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={openModal === 'delete'}
        onClose={() => {
          setOpenModal(null);
          setConfirmed(false);
        }}
        title={t('Delete page')}
      >
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={16} />} color="red" title={t('Danger Zone')}>
            {t('This action is permanent and cannot be undone. The page will be permanently deleted after 30 days in trash.')}
          </Alert>

          <Text size="sm">
            {t('Page title')}: <strong>{page?.title}</strong>
          </Text>

          <Checkbox
            label={t('I understand this will delete the page permanently')}
            checked={confirmed}
            onChange={(e) => setConfirmed(e.currentTarget.checked)}
          />

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setOpenModal(null);
                setConfirmed(false);
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              color="red"
              onClick={handleDelete}
              loading={deleteMutation.isPending}
              disabled={!confirmed}
            >
              {t('Delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};

export const DangerZoneSection = React.memo(DangerZoneSectionComponent);
