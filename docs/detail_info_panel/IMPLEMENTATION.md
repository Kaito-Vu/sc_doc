# Detail Info Panel - Implementation Guide

## Project Structure

```
apps/client/src/ee/
├── components/
│   └── detail-info-panel/
│       ├── DetailInfoPanel.tsx              # Main panel component
│       ├── DetailInfoPanel.module.css       # Panel styles
│       ├── index.ts                         # Export
│       └── sections/
│           ├── index.ts                     # Export all sections
│           ├── PeopleSection.tsx
│           ├── PeopleSection.module.css
│           ├── StatsSection.tsx
│           ├── StatsSection.module.css
│           ├── DisplaySection.tsx
│           ├── DisplaySection.module.css
│           ├── ProtectionSection.tsx
│           ├── ProtectionSection.module.css
│           ├── ActionsSection.tsx
│           ├── ActionsSection.module.css
│           ├── DangerZoneSection.tsx
│           └── DangerZoneSection.module.css
├── hooks/
│   ├── useDetailInfoPanel.ts                # Panel state management
│   ├── usePageStats.ts                      # Fetch page stats
│   └── usePageActions.ts                    # Handle page actions
├── utils/
│   └── formatting.ts                        # Format dates, numbers, etc
└── detail-info-panel.types.ts               # TypeScript types
```

## Component Implementation

### DetailInfoPanel.tsx

```typescript
import React, { useState } from 'react';
import { Box, Stack, ActionIcon, Group, Tooltip, ScrollArea } from '@mantine/core';
import { IconX, IconChevronRight } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { usePageQuery } from '@/features/page/queries/page-query';
import classes from './DetailInfoPanel.module.css';
import {
  PeopleSection,
  StatsSection,
  DisplaySection,
  ProtectionSection,
  ActionsSection,
  DangerZoneSection,
} from './sections';

interface Props {
  pageId: string;
  onClose?: () => void;
}

export const DetailInfoPanel: React.FC<Props> = ({ pageId, onClose }) => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data: page, isLoading } = usePageQuery({ pageId });

  if (!page) {
    return null;
  }

  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  return (
    <aside
      className={`${classes.panel} ${isCollapsed ? classes.collapsed : ''}`}
      data-testid="detail-info-panel"
    >
      {/* Header */}
      <Group
        justify="space-between"
        px="md"
        py="sm"
        className={classes.header}
        wrap="nowrap"
      >
        <div className={classes.title}>
          {!isCollapsed && (
            <span>{page.title}</span>
          )}
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
            <div className={classes.badge}>
              <span className={classes.avatarInitials}>
                {page.creator?.name?.charAt(0)?.toUpperCase()}
              </span>
              <span className={classes.badgeText}>
                {t('Owner')}, {page.contributors?.length || 0} {t('contributors')}
              </span>
            </div>

            {/* Sections */}
            <PeopleSection page={page} isLoading={isLoading} />
            <StatsSection page={page} isLoading={isLoading} />
            <DisplaySection page={page} pageId={pageId} />
            <ProtectionSection page={page} pageId={pageId} />
            <ActionsSection page={page} pageId={pageId} />
            <DangerZoneSection page={page} pageId={pageId} />
          </Stack>
        </ScrollArea>
      )}
    </aside>
  );
};

export default DetailInfoPanel;
```

### DetailInfoPanel.module.css

```css
.panel {
  width: 360px;
  height: 100%;
  border-left: 1px solid var(--mantine-color-gray-2);
  background-color: var(--mantine-color-white);
  display: flex;
  flex-direction: column;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.08);
  transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1),
              opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
}

.panel:global([data-color-scheme='dark']) {
  border-left-color: var(--mantine-color-dark-6);
  background-color: var(--mantine-color-dark-7);
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.3);
}

.collapsed {
  width: 0;
  opacity: 0;
  overflow: hidden;
  border-left: none;
}

.header {
  border-bottom: 1px solid var(--mantine-color-gray-2);
  background-color: var(--mantine-color-gray-0);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header:global([data-color-scheme='dark']) {
  border-bottom-color: var(--mantine-color-dark-6);
  background-color: var(--mantine-color-dark-6);
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--mantine-color-gray-9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.title:global([data-color-scheme='dark']) {
  color: var(--mantine-color-gray-0);
}

.content {
  flex: 1;
  overflow-y: auto;
}

.badge {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--mantine-color-blue-0);
  border-radius: 8px;
  margin-bottom: 8px;
}

.badge:global([data-color-scheme='dark']) {
  background-color: var(--mantine-color-blue-9);
}

.avatarInitials {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: var(--mantine-color-blue-5);
  color: white;
  font-weight: 600;
  font-size: 13px;
}

.badgeText {
  font-size: 12px;
  color: var(--mantine-color-gray-7);
  line-height: 1.4;
}

.badgeText:global([data-color-scheme='dark']) {
  color: var(--mantine-color-gray-3);
}
```

### Section Components Template

#### PeopleSection.tsx

```typescript
import React from 'react';
import { Stack, Group, Avatar, Text, Box, Skeleton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { Page } from '@/types';
import classes from './PeopleSection.module.css';

interface Props {
  page: Page;
  isLoading: boolean;
}

export const PeopleSection: React.FC<Props> = ({ page, isLoading }) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Stack gap="sm">
        <Skeleton height={8} width="30%" />
        <Skeleton height={40} />
        <Skeleton height={40} />
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <div className={classes.title}>{t('PEOPLE')}</div>

      {/* Creator */}
      <div className={classes.item}>
        <div className={classes.label}>{t('Creator')}</div>
        <Group gap="sm">
          <Avatar
            name={page.creator?.name}
            size="sm"
            radius="md"
          />
          <Box>
            <Text size="sm" fw={500}>
              {page.creator?.name || t('Unknown')}
            </Text>
            <Text size="xs" c="dimmed">
              {page.creator?.email}
            </Text>
          </Box>
        </Group>
      </div>

      {/* Last Updated By */}
      <div className={classes.item}>
        <div className={classes.label}>{t('Last updated by')}</div>
        <Group gap="sm">
          <Avatar
            name={page.updatedBy?.name}
            size="sm"
            radius="md"
          />
          <Box>
            <Text size="sm" fw={500}>
              {page.updatedBy?.name || t('Unknown')}
            </Text>
            <Text size="xs" c="dimmed">
              {page.updatedBy?.email}
            </Text>
          </Box>
        </Group>
      </div>
    </Stack>
  );
};
```

#### StatsSection.tsx

```typescript
import React from 'react';
import { Stack, Group, Text, Box, Skeleton, Badge } from '@mantine/core';
import { IconEye, IconEdit, IconClock, IconCalendar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { Page } from '@/types';
import { formatDate, formatRelativeTime } from '../utils/formatting';
import classes from './StatsSection.module.css';

interface Props {
  page: Page;
  isLoading: boolean;
}

export const StatsSection: React.FC<Props> = ({ page, isLoading }) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Stack gap="sm">
        <Skeleton height={8} width="30%" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={24} />
        ))}
      </Stack>
    );
  }

  const stats = [
    {
      icon: IconEye,
      label: t('Views'),
      value: page.viewCount || 0,
    },
    {
      icon: IconEdit,
      label: t('Edits'),
      value: page.editCount || 0,
    },
    {
      icon: IconCalendar,
      label: t('Created'),
      value: formatDate(page.createdAt),
    },
    {
      icon: IconClock,
      label: t('Last updated'),
      value: formatRelativeTime(page.updatedAt),
    },
  ];

  return (
    <Stack gap="sm">
      <div className={classes.title}>{t('STATS')}</div>

      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Group key={index} justify="space-between" className={classes.stat}>
            <Group gap="xs">
              <Icon size={16} opacity={0.6} />
              <Text size="sm">{stat.label}</Text>
            </Group>
            <Text size="sm" fw={500} c="dimmed">
              {stat.value}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
};
```

#### DisplaySection.tsx

```typescript
import React from 'react';
import { Stack, Switch, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { updatePageSettings } from '@/api/page-api';
import type { Page } from '@/types';
import classes from './DisplaySection.module.css';

interface Props {
  page: Page;
  pageId: string;
}

export const DisplaySection: React.FC<Props> = ({ page, pageId }) => {
  const { t } = useTranslation();
  const [isFullWidth, setIsFullWidth] = React.useState(page.isFullWidth ?? false);

  const mutation = useMutation({
    mutationFn: () =>
      updatePageSettings(pageId, { isFullWidth: !isFullWidth }),
    onSuccess: () => {
      setIsFullWidth(!isFullWidth);
      // Trigger layout update or re-render
    },
  });

  return (
    <Stack gap="sm">
      <div className={classes.title}>{t('DISPLAY')}</div>

      <div className={classes.setting}>
        <Text size="sm">{t('Full-width')}</Text>
        <Switch
          checked={isFullWidth}
          onChange={() => mutation.mutate()}
          disabled={mutation.isPending}
          aria-label={t('Toggle full-width mode')}
        />
      </div>
      <Text size="xs" c="dimmed">
        {t('Content spans full width when enabled')}
      </Text>
    </Stack>
  );
};
```

#### ActionsSection.tsx

```typescript
import React from 'react';
import { Stack, UnstyledButton, Group, Text } from '@mantine/core';
import {
  IconArrowRight,
  IconHistory,
  IconDownload,
  IconPrinter,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { Page } from '@/types';
import classes from './ActionsSection.module.css';

interface Props {
  page: Page;
  pageId: string;
}

export const ActionsSection: React.FC<Props> = ({ page, pageId }) => {
  const { t } = useTranslation();

  const actions = [
    {
      icon: IconArrowRight,
      label: t('Move'),
      action: 'move',
    },
    {
      icon: IconHistory,
      label: t('History'),
      action: 'history',
    },
    {
      icon: IconDownload,
      label: t('Export'),
      action: 'export',
    },
    {
      icon: IconPrinter,
      label: t('Print'),
      action: 'print',
    },
  ];

  const handleAction = (action: string) => {
    // Dispatch events or call functions
    window.dispatchEvent(
      new CustomEvent('detail-panel-action', { detail: { action, pageId } })
    );
  };

  return (
    <Stack gap="xs">
      <div className={classes.title}>{t('ACTIONS')}</div>

      {actions.map((item) => {
        const Icon = item.icon;
        return (
          <UnstyledButton
            key={item.action}
            className={classes.action}
            onClick={() => handleAction(item.action)}
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
  );
};
```

#### DangerZoneSection.tsx

```typescript
import React, { useState } from 'react';
import { Stack, Button, Group, Text, Modal, Stack as ModalStack } from '@mantine/core';
import { IconArchive, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { archivePage, deletePage } from '@/api/page-api';
import type { Page } from '@/types';
import classes from './DangerZoneSection.module.css';

interface Props {
  page: Page;
  pageId: string;
}

export const DangerZoneSection: React.FC<Props> = ({ page, pageId }) => {
  const { t } = useTranslation();
  const [openModal, setOpenModal] = useState<'archive' | 'delete' | null>(null);

  const archiveMutation = useMutation({
    mutationFn: () => archivePage(pageId),
    onSuccess: () => {
      setOpenModal(null);
      // Trigger navigation or toast notification
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePage(pageId),
    onSuccess: () => {
      setOpenModal(null);
      // Trigger navigation or toast notification
    },
  });

  return (
    <>
      <Stack gap="sm" className={classes.dangerZone}>
        <div className={classes.title}>{t('DANGER ZONE')}</div>

        <div className={classes.action}>
          <Group justify="space-between">
            <div>
              <Text size="sm" fw={500}>
                {t('Archive')}
              </Text>
              <Text size="xs" c="dimmed">
                {t('Move page to archive')}
              </Text>
            </div>
            <Button
              size="xs"
              variant="light"
              color="yellow"
              onClick={() => setOpenModal('archive')}
              disabled={page.isArchived}
            >
              {t('Archive')}
            </Button>
          </Group>
        </div>

        <div className={classes.action}>
          <Group justify="space-between">
            <div>
              <Text size="sm" fw={500}>
                {t('Trash')}
              </Text>
              <Text size="xs" c="dimmed">
                {t('Move page to trash (permanent)')}
              </Text>
            </div>
            <Button
              size="xs"
              variant="light"
              color="red"
              onClick={() => setOpenModal('delete')}
            >
              {t('Trash')}
            </Button>
          </Group>
        </div>
      </Stack>

      {/* Confirmation Modals */}
      <Modal
        opened={openModal === 'archive'}
        onClose={() => setOpenModal(null)}
        title={t('Archive page')}
      >
        <ModalStack gap="md">
          <Text>{t('Are you sure you want to archive this page?')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenModal(null)}>
              {t('Cancel')}
            </Button>
            <Button
              color="yellow"
              onClick={() => archiveMutation.mutate()}
              loading={archiveMutation.isPending}
            >
              {t('Archive')}
            </Button>
          </Group>
        </ModalStack>
      </Modal>

      <Modal
        opened={openModal === 'delete'}
        onClose={() => setOpenModal(null)}
        title={t('Delete page')}
      >
        <ModalStack gap="md">
          <Text>{t('Are you sure you want to delete this page?')}</Text>
          <Text size="sm" c="red">
            {t('This action cannot be undone.')}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenModal(null)}>
              {t('Cancel')}
            </Button>
            <Button
              color="red"
              onClick={() => deleteMutation.mutate()}
              loading={deleteMutation.isPending}
            >
              {t('Delete')}
            </Button>
          </Group>
        </ModalStack>
      </Modal>
    </>
  );
};
```

## Integration with Page Component

### Update apps/client/src/pages/page/page.tsx

```typescript
// ... existing imports ...
import { DetailInfoPanel } from '@/ee/components/detail-info-panel';
import { useHasFeature } from '@/ee/hooks/use-feature';
import { Feature } from '@/ee/features';

function PageContent({ pageSlug }: { pageSlug: string | undefined }) {
  // ... existing code ...
  const hasDetailPanel = useHasFeature(Feature.DETAIL_INFO_PANEL);
  const [showDetailPanel, setShowDetailPanel] = React.useState(true);

  // ... rest of the code ...

  return (
    <div style={{ display: 'flex' }}>
      <div style={{ flex: 1 }}>
        {/* Existing page content */}
        <MemoizedPageHeader readOnly={!canEdit} />
        <MemoizedFullEditor {...props} />
        <MemoizedHistoryModal pageId={page.id} />
      </div>

      {/* Detail Info Panel */}
      {hasDetailPanel && showDetailPanel && (
        <DetailInfoPanel
          pageId={page.id}
          onClose={() => setShowDetailPanel(false)}
        />
      )}
    </div>
  );
}
```

## Hooks Implementation

### useDetailInfoPanel.ts

```typescript
import { useState, useCallback } from 'react';

export const useDetailInfoPanel = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggle = useCallback(() => setIsOpen(!isOpen), [isOpen]);
  const toggleCollapse = useCallback(
    () => setIsCollapsed(!isCollapsed),
    [isCollapsed]
  );

  return {
    isOpen,
    setIsOpen,
    toggle,
    isCollapsed,
    setIsCollapsed,
    toggleCollapse,
  };
};
```

### usePageStats.ts

```typescript
import { useQuery } from '@tanstack/react-query';
import { getPageStats } from '@/api/page-api';

export const usePageStats = (pageId: string) => {
  return useQuery({
    queryKey: ['page-stats', pageId],
    queryFn: () => getPageStats(pageId),
    staleTime: 30000, // 30 seconds
  });
};
```

## API Integration

### Create apps/client/src/api/page-api.ts additions

```typescript
// Add to existing page-api.ts or create new file

export const getPageStats = async (pageId: string) => {
  const response = await apiClient.get(`/pages/${pageId}/stats`);
  return response.data;
};

export const updatePageSettings = async (
  pageId: string,
  settings: Partial<PageSettings>
) => {
  const response = await apiClient.put(`/pages/${pageId}/settings`, settings);
  return response.data;
};

export const archivePage = async (pageId: string) => {
  const response = await apiClient.patch(`/pages/${pageId}/archive`);
  return response.data;
};

export const deletePage = async (pageId: string) => {
  const response = await apiClient.patch(`/pages/${pageId}/trash`);
  return response.data;
};
```

## Type Definitions

### detail-info-panel.types.ts

```typescript
export interface DetailInfoPanelProps {
  pageId: string;
  onClose?: () => void;
}

export interface SectionProps {
  page: Page;
  pageId: string;
  isLoading?: boolean;
}

export interface PageStats {
  viewCount: number;
  editCount: number;
  createdAt: Date;
  updatedAt: Date;
  creator: UserInfo;
  lastUpdatedBy: UserInfo;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface PageSettings {
  isFullWidth: boolean;
  isProtected: boolean;
  isArchived: boolean;
}
```

## Testing Strategy

### Unit Tests
- Test each section component in isolation
- Mock data and API calls
- Test error states and loading states

### Integration Tests
- Test panel integration with page component
- Test data fetching and caching
- Test user interactions

### E2E Tests
- Test panel open/close
- Test all section interactions
- Test actions and confirmations

## Feature Flag Integration

```typescript
// In apps/client/src/ee/features.ts
export enum Feature {
  // ... existing features ...
  DETAIL_INFO_PANEL = 'detail_info_panel',
}

// Usage
const hasDetailPanel = useHasFeature(Feature.DETAIL_INFO_PANEL);
```

## Performance Considerations

- Lazy load sections (implement intersection observer)
- Memoize components to prevent unnecessary re-renders
- Virtual scrolling for long lists
- Debounce rapid actions
- Cache page stats with appropriate stale time
