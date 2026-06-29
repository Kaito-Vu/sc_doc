# Detail Info Panel - Design Document

## Visual Design

### Panel Layout

```
┌─────────────────────────────────────┐
│  Đăng ký người sử dụng    [✕] [─]   │ ← Header (title + collapse/close)
├─────────────────────────────────────┤
│                                       │
│ AD  Owner, no contributors           │ ← Avatar/badge
│                                       │
├─────────────────────────────────────┤
│ PEOPLE                                │ ← Section Title
│                                       │
│ 🔷 Creator                            │
│    admin                              │
│                                       │
│ 🔷 Last updated by                    │
│    admin                              │
│                                       │
├─────────────────────────────────────┤
│ STATS                                 │
│                                       │
│ 👁 Views                          0   │
│ ✎ Edits                           0   │
│ 📅 Created                            │
│    Jun 09, 2026, 9:18PM              │
│ ⏱ Last updated                       │
│    0 seconds ago                      │
│                                       │
├─────────────────────────────────────┤
│ DISPLAY                               │
│                                       │
│ ☐ Full-width                         │
│                                       │
├─────────────────────────────────────┤
│ PROTECTION                            │
│                                       │
│ 🔒 Protect this page                  │
│    [Toggle switch]                    │
│                                       │
├─────────────────────────────────────┤
│ ACTIONS                               │
│                                       │
│ ➜ Move                                │
│ ⏱ History                             │
│ ↓ Export                              │
│ 🖨 Print                              │
│                                       │
├─────────────────────────────────────┤
│ DANGER ZONE                           │
│                                       │
│ 📦 Archive      [Archive button]      │
│ 🗑 Trash        [Trash button]        │
│                                       │
└─────────────────────────────────────┘
```

### Dimensions

- **Width**: 360px (fixed)
- **Min-width**: 280px (mobile, when available)
- **Max-height**: 100% (responsive to viewport)
- **Section padding**: 16px
- **Section gap**: 12px

### Colors & Theming

| Element | Light Theme | Dark Theme |
|---------|-------------|-----------|
| Background | `#FFFFFF` | `#1A1B1E` |
| Border | `#E0E0E0` | `#373A40` |
| Text Primary | `#212529` | `#F8F9FA` |
| Text Secondary | `#666666` | `#A6ADBB` |
| Divider | `#E9ECEF` | `#25262B` |
| Danger | `#FA5252` | `#FF6B6B` |

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Section Title | Inter | 12px | 600 |
| Label | Inter | 13px | 400 |
| Value | Inter | 14px | 500 |
| Button | Inter | 13px | 500 |

### Spacing

- **Vertical rhythm**: 4px, 8px, 12px, 16px, 24px
- **Horizontal padding**: 16px
- **Component gap**: 8px-12px
- **Section margin**: 12px 0

## Sections Design Details

### PEOPLE Section

```
┌─ PEOPLE ─────────────────────────────┐
│                                       │
│ 🔷 Creator                            │
│    [Avatar] admin                     │
│    admin@example.com (on hover)       │
│                                       │
│ 🔷 Last updated by                    │
│    [Avatar] admin                     │
│    admin@example.com (on hover)       │
│                                       │
└───────────────────────────────────────┘
```

**Features**:
- Avatar display with initials fallback
- User name and email on hover
- Link to user profile (optional)

### STATS Section

```
┌─ STATS ───────────────────────────────┐
│                                        │
│ Metric                        Value    │
│ ─────────────────────────────────────  │
│ 👁 Views                           0   │
│ ✎ Edits                            0   │
│ 📅 Created          Jun 09, 2026     │
│ ⏱ Last updated      0 seconds ago    │
│                                        │
└────────────────────────────────────────┘
```

**Features**:
- Icon + label + value layout
- Formatted dates with relative time
- Metric updates in real-time (optional)

### DISPLAY Section

```
┌─ DISPLAY ─────────────────────────────┐
│                                        │
│ ☐ Full-width         [Toggle Switch]  │
│  Content spans full width when enabled │
│                                        │
└────────────────────────────────────────┘
```

**Features**:
- Toggle switch for full-width mode
- Description on hover/tooltip
- Real-time effect on page

### PROTECTION Section

```
┌─ PROTECTION ──────────────────────────┐
│                                        │
│ 🔒 Protect this page                   │
│    [Toggle Switch]                     │
│                                        │
│    When enabled:                       │
│    • Only editors can modify           │
│    • Viewers can read-only access      │
│                                        │
└────────────────────────────────────────┘
```

**Features**:
- Toggle protection status
- Permission explanation
- Icon feedback

### ACTIONS Section

```
┌─ ACTIONS ─────────────────────────────┐
│                                        │
│ ➜ Move              [clickable row]    │
│ ⏱ History           [clickable row]    │
│ ↓ Export            [clickable row]    │
│ 🖨 Print            [clickable row]    │
│                                        │
└────────────────────────────────────────┘
```

**Features**:
- Icon + label + optional chevron
- Hover state: highlight background
- Click opens dialogs/modals
- Keyboard accessible

### DANGER ZONE Section

```
┌─ DANGER ZONE ─────────────────────────┐
│  ⚠️  Destructive actions              │
│                                        │
│ 📦 Archive  [Archive...]               │
│    Move page to archive                │
│                                        │
│ 🗑 Trash    [Trash...]                 │
│    Move page to trash (permanent)      │
│                                        │
└────────────────────────────────────────┘
```

**Features**:
- Red/warning styling
- Confirmation dialog required
- Clear descriptions
- Disabled state when not allowed

## Interactions & Animations

### Panel Toggle
- **Duration**: 300ms
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` (Material easing)
- **Direction**: Slide in from right, slide out to right

### Hover States
- **Opacity**: 0.7 → 1.0
- **Background**: Transparent → Light gray/dark gray
- **Cursor**: pointer
- **Duration**: 150ms

### Button States
- **Default**: Normal styling
- **Hover**: Highlighted background
- **Active**: Pressed state with slight shadow
- **Disabled**: Opacity 0.5, cursor not-allowed

### Loading State
- **Skeleton loaders** for stats section
- **Pulsing animation** for stats values
- **Fade in** when data loads

## Responsive Design

### Desktop (> 1024px)
- Panel width: 360px
- Always visible option
- Smooth interactions

### Tablet (768px - 1024px)
- Panel width: 320px
- Toggle button in header
- Drawer/modal on small screens

### Mobile (< 768px)
- Full modal/bottom sheet
- Stacked layout
- Touch-friendly sizing (min 44px tap targets)

## Accessibility

### Focus Management
- Focus trap when panel opens
- Focus outline visible
- Tab order logical

### Keyboard Navigation
- `Escape` to close panel
- `Tab` between sections
- `Enter` to activate buttons
- Arrow keys for navigation (optional)

### Screen Reader
- ARIA labels on all controls
- Section heading hierarchy
- Role announcements for changes
- Live regions for dynamic content

### Color Contrast
- Text: 4.5:1 ratio (AA)
- UI Components: 3:1 ratio (AA)
- Focus indicators: 3:1 contrast

## Animation Specs

### Panel Open/Close
```css
transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
            opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
```

### Section Fade In
```css
animation: fadeIn 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
```

### Loading Skeleton
```css
animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
```

## Dark Mode Support

- All colors use CSS variables from Mantine theme
- Automatic switching based on system preference
- Manual toggle supported

## RTL Support

- Text alignment adjusts automatically
- Icons remain centered
- Panel position adjustable (left/right)
- Margins and padding reversed where needed

## Print Styles

- Panel hidden by default in print
- Option to include panel in exported PDFs
- Clean layout without interactive elements
