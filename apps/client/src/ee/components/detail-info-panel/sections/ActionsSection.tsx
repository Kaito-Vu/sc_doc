import React, { useState } from 'react';
import { Stack, UnstyledButton, Group, Text, Modal, Button, Select, Alert } from '@mantine/core';
import {
  IconArrowRight,
  IconHistory,
  IconDownload,
  IconPrinter,
  IconAlertCircle,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import type { SectionProps } from '../detail-info-panel.types';
import { exportPage, movePage } from '../api/detail-info-panel-api';
import commonClasses from './common.module.css';
import classes from './ActionsSection.module.css';

const ActionsSectionComponent: React.FC<SectionProps> = ({ page, pageId }) => {
  const { t } = useTranslation();
  const [openDialog, setOpenDialog] = useState<'move' | 'export' | null>(null);
  const [targetSpace, setTargetSpace] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'html' | 'markdown' | 'docx'>('pdf');

  // Move page mutation
  const moveMutation = useMutation({
    mutationFn: () => movePage(pageId, targetSpace || ''),
    onSuccess: () => {
      setOpenDialog(null);
      setTargetSpace(null);
      // Show success notification
      console.log('Page moved successfully');
    },
    onError: (error) => {
      console.error('Error moving page:', error);
    },
  });

  // Export page mutation
  const exportMutation = useMutation({
    mutationFn: () => exportPage(pageId, exportFormat),
    onSuccess: (data) => {
      setOpenDialog(null);
      // Trigger download
      window.open(data.downloadUrl, '_blank');
      console.log('Page exported successfully');
    },
    onError: (error) => {
      console.error('Error exporting page:', error);
    },
  });

  const handleHistoryClick = () => {
    // Dispatch custom event to trigger history modal in main page
    window.dispatchEvent(
      new CustomEvent('detail-panel-action', {
        detail: { action: 'history', pageId },
      })
    );
  };

  const handlePrintClick = () => {
    // Open print dialog
    window.print();
  };

  const actions = [
    {
      icon: IconArrowRight,
      label: t('Move'),
      action: 'move',
      onClick: () => setOpenDialog('move'),
    },
    {
      icon: IconHistory,
      label: t('History'),
      action: 'history',
      onClick: handleHistoryClick,
    },
    {
      icon: IconDownload,
      label: t('Export'),
      action: 'export',
      onClick: () => setOpenDialog('export'),
    },
    {
      icon: IconPrinter,
      label: t('Print'),
      action: 'print',
      onClick: handlePrintClick,
    },
  ];

  return (
    <>
      <Stack gap="xs">
        <div className={commonClasses.title}>{t('ACTIONS')}</div>

        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <UnstyledButton
              key={item.action}
              className={commonClasses.action}
              onClick={item.onClick}
            >
              <Group justify="space-between">
                <Group gap="sm">
                  <Icon size={16} opacity={0.6} />
                  <Text size="sm">{item.label}</Text>
                </Group>
              </Group>
            </UnstyledButton>
          );
        })}
      </Stack>

      {/* Move Dialog */}
      <Modal
        opened={openDialog === 'move'}
        onClose={() => setOpenDialog(null)}
        title={t('Move page')}
      >
        <Stack gap="md">
          <Alert icon={<IconAlertCircle size={16} />} title={t('Select destination')}>
            {t('Choose the space where you want to move this page')}
          </Alert>

          <Select
            label={t('Target space')}
            placeholder={t('Select a space')}
            data={[
              { value: 'space-1', label: t('My Documents') },
              { value: 'space-2', label: t('Team Projects') },
              { value: 'space-3', label: t('Archive') },
            ]}
            value={targetSpace}
            onChange={setTargetSpace}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenDialog(null)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => moveMutation.mutate()}
              loading={moveMutation.isPending}
              disabled={!targetSpace}
            >
              {t('Move')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Export Dialog */}
      <Modal
        opened={openDialog === 'export'}
        onClose={() => setOpenDialog(null)}
        title={t('Export page')}
      >
        <Stack gap="md">
          <Select
            label={t('Format')}
            placeholder={t('Select format')}
            data={[
              { value: 'pdf', label: 'PDF' },
              { value: 'html', label: 'HTML' },
              { value: 'markdown', label: 'Markdown' },
              { value: 'docx', label: 'DOCX' },
            ]}
            value={exportFormat}
            onChange={(val) => setExportFormat((val as any) || 'pdf')}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenDialog(null)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => exportMutation.mutate()}
              loading={exportMutation.isPending}
            >
              {t('Export')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};

export const ActionsSection = React.memo(ActionsSectionComponent);
