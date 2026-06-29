import React, { useEffect, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Button,
  ScrollArea,
  Switch,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowRight,
  IconCalendar,
  IconClock,
  IconDownload,
  IconEdit,
  IconEye,
  IconHistory,
  IconArchive,
  IconLock,
  IconLockOpen,
  IconPrinter,
  IconStar,
  IconTrash,
  IconUser,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { usePageQuery } from '@/features/page/queries/page-query';
import { usePageStats } from '@/ee/hooks/usePageStats';
import { usePageSettings } from '@/ee/hooks/usePageSettings';
import type { DetailInfoPanelProps } from './detail-info-panel.types';
import classes from './DetailInfoPanel.module.css';
import { useTimeAgo } from '@/hooks/use-time-ago';
import { formattedDate } from '@/lib/time';

const DetailInfoPanelComponent: React.FC<DetailInfoPanelProps> = ({ pageId, onClose }) => {
  const { t } = useTranslation();
  const { data: page } = usePageQuery({ pageId });
  const { data: pageStats } = usePageStats(pageId);
  const { data: pageSettings } = usePageSettings(pageId);

  const [fullWidth, setFullWidth] = useState(false);
  const [isProtected, setIsProtected] = useState(false);

  useEffect(() => {
    if (pageSettings?.isFullWidth !== undefined) {
      setFullWidth(pageSettings.isFullWidth);
    }
  }, [pageSettings?.isFullWidth]);

  useEffect(() => {
    if (pageSettings?.isProtected !== undefined) {
      setIsProtected(pageSettings.isProtected);
    }
  }, [pageSettings?.isProtected]);

  const updatedAgo = useTimeAgo(page?.updatedAt);

  if (!page) return null;

  const creator = page?.creator;
  const lastUpdatedBy = page?.lastUpdatedBy;
  const contributorsCount = page?.contributors?.length ?? 0;
  const viewCount = pageStats?.viewCount ?? 0;
  const editCount = pageStats?.editCount ?? 0;

  const contributorLabel = contributorsCount === 0
    ? t('Owner, no contributors')
    : `${t('Owner')}, ${contributorsCount} ${t('contributors')}`;

  return (
    <div className={classes.root}>
      {/* Fixed header */}
      <div className={classes.panelHeader}>
        <span className={classes.panelHeaderTitle}>{t('Detail Info')}</span>
        {onClose && (
          <Tooltip label={t('Close')} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={onClose}
              aria-label={t('Close panel')}
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>

      <ScrollArea className={classes.scrollBody} scrollbarSize={4} type="hover">

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
            onChange={(e) => setFullWidth(e.currentTarget.checked)}
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
            onChange={(e) => setIsProtected(e.currentTarget.checked)}
            size="xs"
            color="blue"
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
          >
            {t('Move')}
          </Button>
          <Button
            variant="default"
            size="xs"
            leftSection={<IconHistory size={13} />}
            className={classes.actionBtn}
            fullWidth
          >
            {t('History')}
          </Button>
          <Button
            variant="default"
            size="xs"
            leftSection={<IconDownload size={13} />}
            className={classes.actionBtn}
            fullWidth
          >
            {t('Export')}
          </Button>
          <Button
            variant="default"
            size="xs"
            leftSection={<IconPrinter size={13} />}
            className={classes.actionBtn}
            fullWidth
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
            color="yellow"
            size="xs"
            leftSection={<IconArchive size={13} />}
            className={classes.actionBtn}
            fullWidth
          >
            {t('Archive')}
          </Button>
          <Button
            variant="light"
            color="red"
            size="xs"
            leftSection={<IconTrash size={13} />}
            className={classes.actionBtn}
            fullWidth
          >
            {t('Trash')}
          </Button>
        </div>

      </ScrollArea>
    </div>
  );
};

export const DetailInfoPanel = React.memo(DetailInfoPanelComponent);

export default DetailInfoPanel;
