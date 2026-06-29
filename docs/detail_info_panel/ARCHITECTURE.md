# Detail Info Panel - Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Page Component                            │
│  (apps/client/src/pages/page/page.tsx)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │   Page Content       │  │  DetailInfoPanel (EE)       │ │
│  │                      │  │                              │ │
│  │ - Title Editor       │  │ ┌──────────────────────────┐ │ │
│  │ - Full Editor        │  │ │ Header                   │ │ │
│  │ - History Modal      │  │ ├──────────────────────────┤ │ │
│  │ - Header/Breadcrumb  │  │ │ Content (Scrollable)     │ │ │
│  │                      │  │ │                          │ │ │
│  │                      │  │ │ Sections:                │ │ │
│  │                      │  │ │ • PeopleSection          │ │ │
│  │                      │  │ │ • StatsSection           │ │ │
│  │                      │  │ │ • DisplaySection         │ │ │
│  │                      │  │ │ • ProtectionSection      │ │ │
│  │                      │  │ │ • ActionsSection         │ │ │
│  │                      │  │ │ • DangerZoneSection      │ │ │
│  │                      │  │ │                          │ │ │
│  │                      │  │ └──────────────────────────┘ │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
App
└── Page (pages/page/page.tsx)
    ├── PageHeader
    │   └── PageHeaderMenu
    ├── FullEditor
    │   └── (existing content)
    └── DetailInfoPanel (NEW - EE Feature)
        ├── Header
        │   ├── Title
        │   ├── CollapseButton
        │   └── CloseButton
        └── ScrollArea
            └── Content
                ├── Badge (Owner info)
                ├── Divider
                ├── PeopleSection
                │   ├── CreatorItem
                │   └── LastUpdatedByItem
                ├── Divider
                ├── StatsSection
                │   ├── StatItem (Views)
                │   ├── StatItem (Edits)
                │   ├── StatItem (Created)
                │   └── StatItem (Updated)
                ├── Divider
                ├── DisplaySection
                │   └── SettingRow (Full-width toggle)
                ├── Divider
                ├── ProtectionSection
                │   └── SettingRow (Protection toggle)
                ├── Divider
                ├── ActionsSection
                │   ├── ActionButton (Move)
                │   ├── ActionButton (History)
                │   ├── ActionButton (Export)
                │   └── ActionButton (Print)
                ├── Divider
                └── DangerZoneSection
                    ├── DangerAction (Archive)
                    └── DangerAction (Trash)
```

## Data Flow

### Initial Page Load

```
Page Component
    ↓
usePageQuery() - Fetch basic page data
    ↓
DetailInfoPanel renders
    ├── Pass pageId to sections
    ├── usePageStats() - Fetch stats (cached)
    ├── usePageSettings() - Fetch settings (cached)
    └── Display all sections with data
```

### User Action Flow

```
User clicks action (e.g., Archive)
    ↓
Section dispatches event/calls handler
    ↓
Mutation function called (archivePage)
    ↓
API request sent to backend
    ↓
Backend processes request
    ↓
Response returned
    ↓
UI updates:
    ├── Success toast
    ├── Invalidate cache
    ├── Refetch data
    └── Update component state
    ↓
User sees changes
```

## State Management

### Local Component State

```typescript
// DetailInfoPanel.tsx
const [isCollapsed, setIsCollapsed] = useState(false);

// DangerZoneSection.tsx
const [openModal, setOpenModal] = useState<'archive' | 'delete' | null>(null);
```

### Server State (React Query)

```typescript
// Fetch page stats
const pageStatsQuery = useQuery({
  queryKey: ['page-stats', pageId],
  queryFn: () => getPageStats(pageId),
  staleTime: 30000,
});

// Fetch page settings
const pageSettingsQuery = useQuery({
  queryKey: ['page-settings', pageId],
  queryFn: () => getPageSettings(pageId),
  staleTime: 300000,
});

// Mutations
const archiveMutation = useMutation({
  mutationFn: () => archivePage(pageId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['page-stats', pageId] });
  },
});
```

## Data Models

### Page Metadata

```typescript
interface Page {
  id: string;
  title: string;
  icon?: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  creator: User;
  updatedBy: User;
  contributors: Contributor[];
  space: Space;
  isArchived: boolean;
  deletedAt?: Date;
  permissions: PagePermissions;
  isFullWidth: boolean;
  isProtected: boolean;
}

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface Contributor {
  userId: string;
  role: 'viewer' | 'editor' | 'admin';
  joinedAt: Date;
}
```

### Page Stats

```typescript
interface PageStats {
  viewCount: number;
  editCount: number;
  createdAt: Date;
  updatedAt: Date;
  creator: User;
  lastUpdatedBy: User;
}
```

### Page Settings

```typescript
interface PageSettings {
  isFullWidth: boolean;
  isProtected: boolean;
  isArchived: boolean;
  allowComments: boolean;
  allowVersionHistory: boolean;
  publicLink?: string;
}
```

## API Integration

### Backend API Layer

```
API Server
    ├── GET /pages/:id/stats
    ├── GET /pages/:id/settings
    ├── PUT /pages/:id/settings
    ├── PATCH /pages/:id/move
    ├── PATCH /pages/:id/archive
    ├── PATCH /pages/:id/restore
    ├── PATCH /pages/:id/trash
    ├── POST /pages/:id/export
    └── GET /pages/:id/history
```

### Frontend API Client

```typescript
// api/page-api.ts
export const getPageStats = async (pageId: string) => {...}
export const getPageSettings = async (pageId: string) => {...}
export const updatePageSettings = async (pageId: string, settings: PageSettings) => {...}
export const archivePage = async (pageId: string) => {...}
export const restorePage = async (pageId: string) => {...}
export const deletePage = async (pageId: string) => {...}
export const movePage = async (pageId: string, targetSpaceId: string) => {...}
export const exportPage = async (pageId: string, format: ExportFormat) => {...}
```

## Hooks Architecture

### Custom Hooks

```typescript
// useDetailInfoPanel() - Panel state
export const useDetailInfoPanel = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  return { isOpen, setIsOpen, isCollapsed, setIsCollapsed, ... };
};

// usePageStats() - Fetch page stats
export const usePageStats = (pageId: string) => {
  return useQuery({
    queryKey: ['page-stats', pageId],
    queryFn: () => getPageStats(pageId),
    staleTime: 30000,
  });
};

// usePageActions() - Handle page actions
export const usePageActions = (pageId: string) => {
  const archiveMutation = useMutation({
    mutationFn: () => archivePage(pageId),
  });
  // ... other mutations
  return { archiveMutation, ... };
};
```

## Feature Flag Integration

```typescript
// ee/features.ts
export enum Feature {
  BASES = 'bases',
  AUDIT = 'audit',
  CUSTOM_BRANDING = 'custom_branding',
  DETAIL_INFO_PANEL = 'detail_info_panel', // NEW
  // ... other features
}

// Usage in components
const hasDetailPanel = useHasFeature(Feature.DETAIL_INFO_PANEL);

if (!hasDetailPanel) {
  return null;
}

return <DetailInfoPanel ... />;
```

## Styling Architecture

### CSS Modules

```
detail-info-panel/
├── DetailInfoPanel.module.css
└── sections/
    ├── PeopleSection.module.css
    ├── StatsSection.module.css
    ├── DisplaySection.module.css
    ├── ProtectionSection.module.css
    ├── ActionsSection.module.css
    └── DangerZoneSection.module.css
```

### Mantine Integration

```typescript
// Use Mantine components for consistent styling
import { Box, Stack, Group, Text, Button, Switch, Avatar } from '@mantine/core';

// Use Mantine theme colors
import { useMantineTheme } from '@mantine/core';

const theme = useMantineTheme();
const color = theme.colors.blue[5];
```

### Dark Mode Support

```css
/* Use CSS variables from Mantine */
.panel {
  background-color: var(--mantine-color-white);
}

.panel:global([data-color-scheme='dark']) {
  background-color: var(--mantine-color-dark-7);
}
```

## Error Handling Strategy

```
User Action
    ↓
Try Mutation
    ↓
Error?
    ├─ YES → Show error toast with message
    │         Allow user to retry
    └─ NO → Show success toast
              Invalidate cache
              Refetch data
```

## Performance Optimization

### Memoization

```typescript
// Memoize expensive components
const MemoizedDetailInfoPanel = React.memo(DetailInfoPanel);
const MemoizedPeopleSection = React.memo(PeopleSection);

// Memoize callbacks
const handleClose = useCallback(() => setIsOpen(false), []);
```

### Lazy Loading

```typescript
// Lazy load sections with intersection observer
const SectionWithLazyLoad = ({ section, pageId }) => {
  const ref = useRef();
  const isVisible = useIntersectionObserver(ref);
  
  return (
    <div ref={ref}>
      {isVisible ? <section.Component pageId={pageId} /> : <Skeleton />}
    </div>
  );
};
```

### Query Caching

```typescript
// Configure React Query for optimal caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      cacheTime: 300000, // 5 minutes
      refetchOnWindowFocus: true,
    },
  },
});
```

## Accessibility Architecture

```typescript
// ARIA labels
<ActionIcon aria-label={t('Close panel')} />

// Focus management
<div ref={focusRef} tabIndex={-1}>

// Semantic HTML
<section role="complementary">
  <h2>{t('Page details')}</h2>
  ...
</section>

// Keyboard navigation
onKeyDown={(e) => {
  if (e.key === 'Escape') handleClose();
}}
```

## Testing Architecture

### Unit Tests

```typescript
// PeopleSection.test.tsx
describe('PeopleSection', () => {
  it('renders creator info', () => {
    render(<PeopleSection page={mockPage} />);
    expect(screen.getByText('Creator')).toBeInTheDocument();
  });
});
```

### Integration Tests

```typescript
// DetailInfoPanel.integration.test.tsx
describe('DetailInfoPanel Integration', () => {
  it('fetches and displays stats', async () => {
    render(<DetailInfoPanel pageId="abc123" />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });
});
```

### E2E Tests

```typescript
// detail-info-panel.e2e.test.ts
describe('Detail Info Panel E2E', () => {
  it('archives page and shows confirmation', () => {
    cy.visit('/page/abc123');
    cy.contains('Archive').click();
    cy.contains('Are you sure').should('be.visible');
    cy.contains('Archive').click();
    cy.contains('Page archived').should('be.visible');
  });
});
```

## Browser Support

```
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
```

## Bundle Size Impact

- DetailInfoPanel main component: ~15KB
- Section components: ~25KB total
- Hooks and utilities: ~8KB
- **Total**: ~48KB (gzipped: ~12KB)

## Deployment Strategy

### Feature Flag Rollout
1. Deploy code with feature flag OFF
2. Enable for internal testing
3. Roll out to 10% of users
4. Monitor errors and performance
5. Roll out to remaining users

### Monitoring
- Error tracking (Sentry)
- Performance metrics (Web Vitals)
- User analytics (Mixpanel)
- API performance (New Relic)

## Versioning

- Minor version bump for new features
- Patch version for bug fixes
- No breaking changes in v1

## Documentation Structure

```
docs/detail_info_panel/
├── README.md                 # Overview
├── DESIGN.md                 # Design specs
├── IMPLEMENTATION.md         # Code implementation guide
├── API_REQUIREMENTS.md       # Backend API specs
├── ARCHITECTURE.md           # This file
└── TIMELINE.md              # Project timeline
```

## Integration Checklist

- [ ] Feature flag added to Feature enum
- [ ] Components integrated into page.tsx
- [ ] API endpoints implemented
- [ ] Hooks created and tested
- [ ] CSS and theming applied
- [ ] Internationalization keys added
- [ ] Tests written and passing
- [ ] Documentation complete
- [ ] Code review approved
- [ ] Deployed to staging
- [ ] QA sign-off received
- [ ] Deployed to production
