import React, { useEffect, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Button,
  Switch,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowRight,
  IconCalendar,
  IconClock,
  IconDownload,
  IconEdit,
  IconEye,
  IconHistory,
  IconArchive,
  IconArchiveOff,
  IconLock,
  IconLockOpen,
  IconPrinter,
  IconStar,
  IconTrash,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { usePageQuery } from '@/features/page/queries/page-query';
import { extractPageSlugId } from '@/lib';
import { userAtom } from '@/features/user/atoms/current-user-atom';
import { usePageStats } from '@/ee/hooks/usePageStats';
import { usePageSettings } from '@/ee/hooks/usePageSettings';
import type { DetailInfoPanelProps } from './detail-info-panel.types';
import classes from './DetailInfoPanel.module.css';
import { useTimeAgo } from '@/hooks/use-time-ago';
import { formattedDate } from '@/lib/time';
import { historyAtoms } from '@/features/page-history/atoms/history-atoms';
import MovePageModal from '@/features/page/components/move-page-modal';
import ExportModal from '@/components/common/export-modal';
import HistoryModal from '@/features/page-history/components/history-modal';
import {
  archivePage,
  restorePage,
  deletePage,
  updatePageSettings,
} from '@/ee/api/detail-info-panel-api';

const DetailInfoPanelComponent: React.FC<DetailInfoPanelProps> = (props) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [, setHistoryOpen] = useAtom(historyAtoms);
  const [user] = useAtom(userAtom);
  const { pageSlug } = useParams();
  const pageId = props.pageId ?? extractPageSlugId(pageSlug);
  const { data: page } = usePageQuery({ pageId });
  const { data: pageStats } = usePageStats(pageId);
  const { data: pageSettings } = usePageSettings(pageId);

  const [isProtected, setIsProtected] = useState(false);
  const [moveOpened, { open: openMove, close: closeMove }] = useDisclosure(false);
  const [exportOpened, { open: openExport, close: closeExport }] = useDisclosure(false);

  // Full-width is a user preference, read from user atom
  const fullWidth = user?.settings?.preferences?.fullPageWidth ?? false;

  useEffect(() => {
    if (pageSettings?.isProtected !== undefined) {
      setIsProtected(pageSettings.isProtected);
    }
  }, [pageSettings?.isProtected]);

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: () => archivePage(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-stats', pageId] });
    },
    onError: (error) => {
      console.error('Error archiving page:', error);
    },
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: () => restorePage(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-stats', pageId] });
    },
    onError: (error) => {
      console.error('Error restoring page:', error);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deletePage(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-stats', pageId] });
      // Navigate to home after deletion
      globalThis.location.href = '/home';
    },
    onError: (error) => {
      console.error('Error deleting page:', error);
    },
  });

  // Full width mutation - update user preference
  const fullWidthMutation = useMutation({
    mutationFn: (value: boolean) =>
      fetch('/api/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            preferences: {
              fullPageWidth: value,
            },
          },
        }),
      }).then(res => {
        if (!res.ok) throw new Error('Failed to update full-width setting');
        return res.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error) => {
      console.error('Error updating full width setting:', error);
    },
  });

  // Protection mutation
  const protectionMutation = useMutation({
    mutationFn: (value: boolean) => updatePageSettings(pageId, { isProtected: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-settings', pageId] });
    },
    onError: (error) => {
      console.error('Error updating protection setting:', error);
      // Revert state on error
      setIsProtected(!isProtected);
    },
  });

  const updatedAgo = useTimeAgo(page?.updatedAt);

  if (!page) return null;

  const creator = page?.creator;
  const lastUpdatedBy = page?.lastUpdatedBy;
  const contributorsCount = page?.contributors?.length ?? 0;
  const viewCount = pageStats?.viewCount ?? 0;
  const editCount = pageStats?.editCount ?? 0;
  const isArchived = page?.deletedAt !== null && page?.deletedAt !== undefined;

  const contributorLabel = contributorsCount === 0
    ? t('Owner, no contributors')
    : `${t('Owner')}, ${contributorsCount} ${t('contributors')}`;

  const handlePrint = () => {
    globalThis.print();
  };

  const handleArchiveToggle = () => {
    if (isArchived) {
      restoreMutation.mutate();
    } else {
      archiveMutation.mutate();
    }
  };

  const handleTrash = () => {
    if (confirm(t('Are you sure you want to move this page to trash?'))) {
      deleteMutation.mutate();
    }
  };

  return (
    <div className={classes.root}>
        {/* Owner Card */}
        <div className={classes.ownerCard}>
          <Avatar
            src={creator?.avatarUrl}
            name={creator?.name ?? page?.title ?? '?'}
            size="lg"
            color="blue"
            radius="md"
          />
          <div className={classes.ownerInfo}>
            <p className={classes.ownerName}>{page?.title ?? '—'}</p>
            <p className={classes.ownerRole}>{contributorLabel}</p>
          </div>
          <div className={classes.ownerActions}>
            <Tooltip label={t('Add to favorites')} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Toggle favorite"
              >
                <IconStar size={15} />
              </ActionIcon>
            </Tooltip>
          </div>
        </div>

        {/* People Section */}
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

        {/* Stats Section */}
        <p className={classes.sectionLabel}>{t('Stats')}</p>

        <div className={classes.row}>
          <span className={classes.rowLabel}><IconEye size={13} />{t('Views')}</span>
          <span className={classes.rowValue}>{viewCount}</span>
        </div>

        <div className={classes.row}>
          <span className={classes.rowLabel}><IconEdit size={13} />{t('Edits')}</span>
          <span className={classes.rowValue}>{editCount}</span>
        </div>

        <div className={classes.row}>
          <span className={classes.rowLabel}><IconCalendar size={13} />{t('Created')}</span>
          <span className={classes.rowText}>
            {page?.createdAt ? formattedDate(page.createdAt) : '—'}
          </span>
        </div>

        <div className={classes.row}>
          <span className={classes.rowLabel}><IconClock size={13} />{t('Last updated')}</span>
          <span className={classes.rowText}>{updatedAgo ?? '—'}</span>
        </div>

        {/* Display Section */}
        <p className={classes.sectionLabel}>{t('Display')}</p>

        <div className={classes.toggleRow}>
          <span className={classes.toggleLabel}>{t('Full-width')}</span>
          <Switch
            checked={fullWidth}
            onChange={(e) => {
              fullWidthMutation.mutate(e.currentTarget.checked);
            }}
            disabled={fullWidthMutation.isPending}
            size="xs"
            aria-label="Toggle full-width"
          />
        </div>

        {/* Protection Section */}
        <p className={classes.sectionLabel}>{t('Protection')}</p>
        <div className={classes.toggleRow}>
          <span className={classes.toggleLabel}>
            {isProtected
              ? <><IconLock size={13} /> {t('Protect this page')}</>
              : <><IconLockOpen size={13} /> {t('Protect this page')}</>}
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
            aria-label="Toggle page protection"
          />
        </div>

        {/* Actions Section */}
        <p className={classes.sectionLabel}>{t('Actions')}</p>
        <div className={classes.actionsGrid}>
          <Button
            variant="default"
            size="xs"
            leftSection={<IconArrowRight size={13} />}
            className={classes.actionBtn}
            fullWidth
            onClick={openMove}
          >
            {t('Move')}
          </Button>
          <Button
            variant="default"
            size="xs"
            leftSection={<IconHistory size={13} />}
            className={classes.actionBtn}
            fullWidth
            onClick={() => setHistoryOpen(true)}
          >
            {t('History')}
          </Button>
          <Button
            variant="default"
            size="xs"
            leftSection={<IconDownload size={13} />}
            className={classes.actionBtn}
            fullWidth
            onClick={openExport}
          >
            {t('Export')}
          </Button>
          <Button
            variant="default"
            size="xs"
            leftSection={<IconPrinter size={13} />}
            className={classes.actionBtn}
            fullWidth
            onClick={handlePrint}
          >
            {t('Print')}
          </Button>
        </div>

        {/* Danger Zone */}
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
            onClick={handleTrash}
            loading={deleteMutation.isPending}
          >
            {t('Trash')}
          </Button>
        </div>

      {/* Modals */}
      <HistoryModal pageId={pageId} pageTitle={page?.title} />
      <MovePageModal
        open={moveOpened}
        onClose={closeMove}
        pageId={pageId}
        slugId={page.slugId}
        currentSpaceSlug={page?.space?.slug ?? ''}
      />
      <ExportModal
        id={pageId}
        type="page"
        open={exportOpened}
        onClose={closeExport}
      />
    </div>
  );
};

export const DetailInfoPanel = React.memo(DetailInfoPanelComponent);

export default DetailInfoPanel;
