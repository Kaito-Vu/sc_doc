# Detail Info Panel - EE Feature Implementation

## Overview

Detail Info Panel là một tính năng giao diện người dùng mới cho trang page detail, cho phép hiển thị thông tin chi tiết về trang hiện tại ở bên phải màn hình. Panel này cung cấp các chức năng quản lý trang như xem lịch sử, thay đổi chủ sở hữu, quản lý quyền truy cập, v.v.

## Vision

Giải pháp EE features sẽ cung cấp một side panel có thể thu gọn (collapsible) hiển thị:
- **PEOPLE**: Thông tin người tạo, người cập nhật cuối cùng
- **STATS**: Số lượt xem, chỉnh sửa, ngày tạo, ngày cập nhật cuối cùng
- **DISPLAY**: Cài đặt hiển thị (full-width, ...)
- **PROTECTION**: Cài đặt bảo vệ trang (khóa trang, ...)
- **ACTIONS**: Các hành động (Move, History, Export, Print)
- **DANGER ZONE**: Các hành động nguy hiểm (Archive, Trash)

## Architecture

### Location

```
apps/client/src/ee/
├── components/
│   └── detail-info-panel/
│       ├── DetailInfoPanel.tsx          # Main component
│       ├── sections/
│       │   ├── PeopleSection.tsx        # Creator, Last updated by
│       │   ├── StatsSection.tsx         # Views, Edits, Created, Updated
│       │   ├── DisplaySection.tsx       # Display settings (full-width, etc)
│       │   ├── ProtectionSection.tsx    # Page protection settings
│       │   ├── ActionsSection.tsx       # Move, History, Export, Print
│       │   └── DangerZoneSection.tsx    # Archive, Trash
│       ├── DetailInfoPanel.module.css   # Styles
│       └── hooks/
│           ├── usePageStats.ts          # Hook to fetch page stats
│           └── usePageActions.ts        # Hook to handle page actions
└── features.ts                          # Feature flag (DETAIL_INFO_PANEL)
```

### Component Structure

```
DetailInfoPanel
├── Header (Minimize/Maximize button)
├── Content (scrollable)
│   ├── PeopleSection
│   ├── Divider
│   ├── StatsSection
│   ├── Divider
│   ├── DisplaySection
│   ├── Divider
│   ├── ProtectionSection
│   ├── Divider
│   ├── ActionsSection
│   ├── Divider
│   └── DangerZoneSection
└── Footer (optional)
```

## Implementation Phases

### Phase 1: Core Infrastructure
- Create DetailInfoPanel component with basic layout
- Create section components (all sections)
- Integrate panel into page.tsx
- Add toggle button in page header
- Style with Mantine components

### Phase 2: Data Fetching & Display
- Create usePageStats hook to fetch page metadata
- Implement each section with real data
- Add loading states
- Add error handling

### Phase 3: Actions & Interactions
- Implement ACTIONS section (Move, History, Export, Print)
- Implement DANGER ZONE section (Archive, Trash)
- Wire up actions to existing features
- Add confirmation dialogs where needed

### Phase 4: Polish & EE Integration
- Add animations/transitions
- Mobile responsiveness
- Feature flag integration
- Performance optimization

## Data Models

### Page Stats
```typescript
interface PageStats {
  viewCount: number;
  editCount: number;
  createdAt: Date;
  updatedAt: Date;
  creator: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  lastUpdatedBy: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}
```

### Page Settings
```typescript
interface PageSettings {
  isFullWidth: boolean;
  isProtected: boolean;
  isArchived: boolean;
}
```

## API Requirements

Endpoints cần thiết:
- `GET /api/pages/{id}/stats` - Lấy thống kê trang
- `GET /api/pages/{id}/settings` - Lấy cài đặt trang
- `PUT /api/pages/{id}/settings` - Cập nhật cài đặt trang
- `PATCH /api/pages/{id}/move` - Di chuyển trang
- `PATCH /api/pages/{id}/archive` - Lưu trữ trang
- `PATCH /api/pages/{id}/restore` - Khôi phục trang

## UI/UX Considerations

1. **Responsive Design**: Panel nên có chiều rộng cố định (320px-400px), collapse trên mobile
2. **Performance**: Lazy load sections, virtual scrolling cho danh sách dài
3. **Accessibility**: ARIA labels, keyboard navigation, focus management
4. **Theming**: Sử dụng Mantine theme system
5. **Animations**: Smooth transitions, no jank

## Testing Strategy

1. Unit tests cho từng section component
2. Integration tests cho data fetching
3. E2E tests cho user interactions
4. Visual regression tests

## Browser Support

- Chrome/Edge latest 2 versions
- Firefox latest 2 versions
- Safari 14+

## Performance Goals

- Initial panel render: < 200ms
- Section render: < 100ms each
- Data fetch: < 500ms
- Smooth 60fps animations

## Accessibility

- WCAG 2.1 Level AA compliance
- Keyboard navigation support
- Screen reader friendly
- High contrast mode support

## Internationalization

Tất cả text được dịch thông qua i18n system hiện tại:
- `detail_info_panel.*` namespace
- Hỗ trợ multiple languages từ đầu

## Security Considerations

- Validate all user inputs
- Check permissions before allowing actions
- XSS prevention through React's built-in escaping
- CSRF token handling cho API calls

## Feature Flags

```typescript
enum Feature {
  // ... existing features
  DETAIL_INFO_PANEL = 'detail_info_panel'
}
```

Panel sẽ chỉ hiển thị khi feature được enable trong EE plan.
