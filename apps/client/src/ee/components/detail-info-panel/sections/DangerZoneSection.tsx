import React, { useState } from 'react';
import { Stack, Button, Group, Text, Modal } from '@mantine/core';
import { IconArchive, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { SectionProps } from '../detail-info-panel.types';
import commonClasses from './common.module.css';
import classes from './DangerZoneSection.module.css';

const DangerZoneSectionComponent: React.FC<SectionProps> = ({ page, pageId }) => {
  const { t } = useTranslation();
  const [openModal, setOpenModal] = useState<'archive' | 'delete' | null>(null);

  const handleArchive = () => {
    // Will be connected to API in Phase 4
    console.log(`Archive page: ${pageId}`);
    setOpenModal(null);
  };

  const handleDelete = () => {
    // Will be connected to API in Phase 4
    console.log(`Delete page: ${pageId}`);
    setOpenModal(null);
  };

  return (
    <>
      <Stack gap="sm" className={classes.dangerZone}>
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
            onClick={() => setOpenModal('archive')}
            className={classes.dangerButton}
            disabled={page.isArchived}
          >
            {t('Archive')}
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
        onClose={() => setOpenModal(null)}
        title={t('Archive page')}
      >
        <Stack gap="md">
          <Text>
            {t('Are you sure you want to archive this page?')}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenModal(null)}>
              {t('Cancel')}
            </Button>
            <Button color="yellow" onClick={handleArchive}>
              {t('Archive')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={openModal === 'delete'}
        onClose={() => setOpenModal(null)}
        title={t('Delete page')}
      >
        <Stack gap="md">
          <Text>
            {t('Are you sure you want to delete this page?')}
          </Text>
          <Text size="sm" c="red">
            {t('This action cannot be undone.')}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenModal(null)}>
              {t('Cancel')}
            </Button>
            <Button color="red" onClick={handleDelete}>
              {t('Delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};

export const DangerZoneSection = React.memo(DangerZoneSectionComponent);
