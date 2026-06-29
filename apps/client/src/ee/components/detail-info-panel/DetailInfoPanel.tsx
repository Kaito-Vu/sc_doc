import React, { useState } from 'react';
import { Box, Stack, ActionIcon, Group, Tooltip, ScrollArea, Skeleton } from '@mantine/core';
import { IconX, IconChevronRight } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { usePageQuery } from '@/features/page/queries/page-query';
import { usePageStats } from '@/ee/hooks/usePageStats';
import { usePageSettings } from '@/ee/hooks/usePageSettings';
import type { DetailInfoPanelProps } from './detail-info-panel.types';
import {
  PeopleSection,
  StatsSection,
  DisplaySection,
  ProtectionSection,
  ActionsSection,
  DangerZoneSection,
} from './sections';
import classes from './DetailInfoPanel.module.css';

const DetailInfoPanelComponent: React.FC<DetailInfoPanelProps> = ({ pageId, onClose }) => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data: page, isLoading } = usePageQuery({ pageId });
  const { data: pageStats, isLoading: statsLoading } = usePageStats(pageId);
  const { data: pageSettings, isLoading: settingsLoading } = usePageSettings(pageId);

  // Merge page data with stats and settings
  const enrichedPage = page ? {
    ...page,
    viewCount: pageStats?.viewCount,
    editCount: pageStats?.editCount,
    ...pageSettings,
  } : null;

  if (!enrichedPage) {
    return null;
  }

  const toggleCollapse = () => setIsCollapsed(!isCollapsed);
  const isAnyLoading = isLoading || statsLoading || settingsLoading;

  return (
    <aside
      className={`${classes.panel} ${isCollapsed ? classes.collapsed : ''}`}
      data-testid="detail-info-panel"
    >
      {/* Header */}
      <Group
        justify="space-between"
        wrap="nowrap"
        className={classes.header}
      >
        <div className={classes.title}>
          {!isCollapsed && <span>{enrichedPage.title}</span>}
        </div>
        <Group gap="xs" wrap="nowrap">
          <Tooltip label={isCollapsed ? t('Expand') : t('Collapse')}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={toggleCollapse}
              aria-label={isCollapsed ? t('Expand panel') : t('Collapse panel')}
            >
              <IconChevronRight
                size={16}
                style={{
                  transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 200ms',
                }}
              />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t('Close')}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={onClose}
              aria-label={t('Close panel')}
            >
              <IconX size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Content */}
      {!isCollapsed && (
        <ScrollArea className={classes.content}>
          <Stack gap="md" px="md" py="lg">
            {/* Owner badge */}
            {isLoading ? (
              <Skeleton height={56} />
            ) : (
              <div className={classes.badge}>
                <span className={classes.avatarInitials}>
                  {enrichedPage.creator?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
                <span className={classes.badgeText}>
                  {t('Owner')}, {enrichedPage.contributors?.length || 0} {t('contributors')}
                </span>
              </div>
            )}

            {/* Sections */}
            <PeopleSection page={enrichedPage} pageId={pageId} isLoading={isLoading} />
            <StatsSection page={enrichedPage} pageId={pageId} isLoading={statsLoading || isLoading} />
            <DisplaySection page={enrichedPage} pageId={pageId} />
            <ProtectionSection page={enrichedPage} pageId={pageId} />
            <ActionsSection page={enrichedPage} pageId={pageId} />
            <DangerZoneSection page={enrichedPage} pageId={pageId} />
          </Stack>
        </ScrollArea>
      )}
    </aside>
  );
};

export const DetailInfoPanel = React.memo(DetailInfoPanelComponent);

export default DetailInfoPanel;
