# Accessibility review — Experience Layer, Sidebar v2, Space Overview

**Phạm vi:** các thay đổi UI gần đây trong `apps/client/src/ee/ui/` và các điểm nối core liên quan  
**Chuẩn tham chiếu:** WCAG 2.2 AA, keyboard-only, screen reader semantics  
**Trạng thái:** Đã review và sửa các lỗi phát hiện; chưa chạy axe/Playwright tự động trong môi trường này

---

## 1. Phương pháp

- Kiểm tra thủ công theo WCAG 2.2 AA: contrast, focus, keyboard, name/role/value, target size.
- Rà soát semantic của modal, listbox, nav, tree, form.
- Tính contrast bằng công thức WCAG cho các cặp màu tự định nghĩa.
- Kiểm tra các luồng bàn phím: command palette, quick create, search, doc info tabs, sidebar sections, space overview.
- Không chạy axe do môi trường không có browser automation; khuyến nghị bổ sung vào CI.

---

## 2. Đã sửa trong review này

| # | Vấn đề | File | Cách sửa |
|---|---|---|---|
| 1 | Command palette thiếu semantics combobox/listbox; screen reader không biết option đang chọn | `experience/command-palette.tsx` | `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; listbox + option + `aria-selected`; live region đếm kết quả |
| 2 | Saved view là `Badge` clickable, không vào được bằng bàn phím | `experience/search/search-page.tsx` | Chuyển thành `Badge component="button"` + `ActionIcon` xóa riêng; thêm aria-label và focus ring |
| 3 | Health cards không thông báo trạng thái filter | `experience/library/document-library-page.tsx` | Thêm `aria-pressed` |
| 4 | Section sidebar thiếu liên kết điều khiển và landmark label | `sidebar/sidebar-components.tsx` | `aria-controls`, `id` cho Collapse, `aria-label` cho `<section>` |
| 5 | Settings sidebar dùng `div` thay vì landmark nav | `components/settings/settings-sidebar.tsx` | `<nav aria-label="Settings navigation">` |
| 6 | Section heading/hint trong sidebar dùng gray-5 → contrast ~1.97:1 | `sidebar/*.css` | Đổi sang gray-7/dark-1 (7.76:1 trên gray-0) |
| 7 | Badge đếm review dùng orange-8 trên orange-1 → ~3.96:1 | `sidebar/sidebar-components.module.css` | Dùng `--mantine-color-orange-light-color` (#a63508) → 6.17:1 |
| 8 | Highlight search mark ở dark mode ~4.11:1 | `experience/search/search-page.module.css` | Đặt màu chữ dark-0 trên yellow-9 → 7.67:1 |
| 9 | Preview label/meta trong Reading Appearance dùng opacity thấp | `ui/reading/reading-appearance.module.css` | Tăng opacity 0.8/0.84 |
| 10 | Doc info tabs thiếu accessible name | `ui/doc-info/doc-info-panel.tsx` | Thêm `aria-label="Document info"` |
| 11 | Avatar nhóm reviewer không có group label | `experience/reviews/review-queue-page.tsx` | `role="group" aria-label="Reviewers"` |
| 12 | Nút “View all” trong Members card thiếu ngữ cảnh | `ui/space-overview/space-overview-page.tsx` | `aria-label="View all members"` |
| 13 | Badge Public là link nhưng accessible name chỉ “Public” | `ui/space-overview/space-overview-page.tsx` | `aria-label="Open public site"` |
| 14 | Link “View all” ở Continue working trỏ sai `/favorites` | `experience/home/home-experience.tsx` | Bỏ link gây nhầm hướng |
| 15 | Mobile target 34px/30px hơi nhỏ | `sidebar/*.css` | Nâng lên 40px cho item/settings/tree/new page trên mobile (AA 24px, gần AAA 44px) |

---

## 3. Contrast đã kiểm tra

| Cặp màu | Tỷ lệ | Kết luận |
|---|---:|---|
| Sidebar active: blue-8 trên blue-0 | 6.02:1 | Pass AA |
| Sidebar badge: orange-light-color trên orange-1 | 6.17:1 | Pass AA |
| Sidebar section heading: gray-7 trên gray-0 | 7.76:1 | Pass AA/AAA |
| Dimmed text trên body | 7.56:1 | Pass AAA |
| Search mark dark: dark-0 trên yellow-9 | 7.67:1 | Pass AAA |
| Search mark light: gray-8 trên yellow-1 | >9:1 | Pass AAA |
| Reading palettes (paper/sepia/sage/mist/contrast) | 10.7–21:1 | Pass AAA |
| Error text theme | 5.7:1 | Pass AA |

---

## 4. Đã xác nhận

- Command palette: mở/đóng bằng `Ctrl/Cmd+Shift+K`, `Esc`; `↑/↓/Enter` hoạt động; live region đếm kết quả.
- Quick create: modal focus trap; DestinationPicker rows có role button, tabIndex, Enter/Space; summary có `aria-live`.
- Sidebar: nav landmark, active `aria-current`, collapse `aria-expanded/aria-controls`, focus-visible rõ.
- Space tree: `role=treeitem`, `aria-level`, `aria-expanded`, `aria-selected`, `aria-current` (core, giữ nguyên).
- Space overview: h1/h2 hierarchy, action icons có aria-label, public link có ngữ cảnh, tabs chuẩn.
- Doc info: tabs có label; metadata form có label cho owner/reviewer/classification/date/notes/archive.
- Review queue: tabs, counts, status text, reviewer group label, nút Review/Open.
- Search: inputs/select/switch có label; checkbox từng kết quả có tên; bảng bulk actions có text/aria-label; saved views thao tác được bằng bàn phím.
- Document library: filter cards có aria-pressed; bảng có header; nút Edit/Open có label; form metadata có label.
- Reading appearance: swatch buttons có `aria-pressed` + label; slider có aria-label; switch có label/description; Drawer có title/focus trap.
- `prefers-reduced-motion` được xử lý bởi override toàn cục hiện có.

---

## 5. Rủi ro còn lại / khuyến nghị

1. **Chưa chạy axe tự động.** Nên thêm Playwright + `@axe-core/playwright` cho 8 màn: Home, Space Overview, Page, Search, Reviews, Library, Settings, Command palette.
2. **Target size mobile 40px** đạt AA 24px nhưng chưa đạt AAA 44px. Có thể nâng lên 44px nếu ưu tiên touch.
3. **Disabled sidebar items** dùng tooltip nhưng không focusable; keyboard user không đọc được lý do khóa. Có thể cho `tabIndex=0` + `aria-disabled` nếu cần.
4. **Command palette** khi không có item: `aria-controls` trỏ tới listbox không render. Có thể luôn render listbox rỗng để loại bỏ cảnh báo.
5. **Core tree action icons** (menu/emoji/create) chưa được audit trong phạm vi này; nên kiểm tra target size và aria-label.
6. **Font size một số label** 10–10.5px tuy contrast tốt nhưng khó đọc; cân nhắc 11px.

---

## 6. Lệnh kiểm chứng đã chạy

```bash
pnpm --filter ./apps/client exec tsc --noEmit
pnpm --filter ./apps/client exec stylelint "src/ee/ui/**/*.css"
pnpm --filter ./apps/client run build
```

Tất cả pass. i18n en-US/vi-VN không thiếu key mới.
