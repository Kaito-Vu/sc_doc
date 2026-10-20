# Experience Layer — trạng thái triển khai Phase C

**Trạng thái:** Đã triển khai phần lớn Phase 1–3 của Phương án C  
**Nguyên tắc:** EE-first; core chỉ nhận điểm nối cơ học; server mới nằm trong `apps/server/src/ee/docs/`

---

## 1. Đã giao

### 1.1 Reading Appearance

Xem `READING_APPEARANCE.md`.

- Font Inter/System/Serif/Monospace.
- Phân biệt `I / l / 1` bằng OpenType `cv05`, `cv08`, `zero`.
- Cỡ chữ, giãn dòng, giãn chữ.
- 6 nền đọc đạt WCAG AA/AAA.
- Độ rộng đọc; lưu theo trình duyệt.

### 1.2 Command palette

- Mở bằng `Ctrl/Cmd + Shift + K` hoặc nút command trên header.
- Nhóm lệnh: tạo tài liệu, tìm kiếm, review queue, document library, home, spaces, favorites, preferences, Ask AI.
- Tìm trang trực tiếp qua unified search.
- Chuyển không gian, mở tài liệu gần đây.
- Điều hướng bàn phím `↑ ↓ Enter Esc`.

### 1.3 Quick create

- Chọn không gian hoặc trang cha bằng `DestinationPicker`.
- Tạo trang trống hoặc dùng template.
- Điều hướng thẳng tới trang mới.

### 1.4 Home v2

- Lời chào theo thời gian + quick actions.
- **Continue working**: 20 trang gần nhất (localStorage).
- **Needs attention**: review đang chờ, tài liệu sắp hết hạn/quá hạn.
- **Recently updated**: tái sử dụng `RecentChanges`.
- **Your spaces**: favorite spaces hoặc spaces gần đây.
- Lối tắt Ask AI nếu workspace bật AI chat.

### 1.5 Document info hợp nhất

Thay hai tab trùng `Details` + `Detail Info` bằng một `DocInfoPanel`:

- **Info**: people, lifecycle, metadata, stats, display, lock, access.
- **Links**: backlinks + labels.
- **Activity**: trạng thái review, người duyệt, thời điểm duyệt, lịch sử trang.
- **Actions**: move/history/export/print + archive/trash.

Lifecycle hiển thị trạng thái review hiện có (draft/in review/approved/expired/obsolete) và hành động:
- Set up review, submit for review, open review, mark obsolete.

### 1.6 Review queue

Trang `/reviews`:

- My reviews (đang chờ tôi duyệt).
- Due soon (trong 7 ngày).
- Overdue (đã hết hạn).
- All (gộp các hàng đợi đang mở).
- Mở trang review hoặc trang tài liệu.

### 1.7 Search page + saved views + bulk actions

Trang `/search`:

- Tìm theo từ khóa, không gian, loại nội dung, nhãn, title-only.
- Lưu/xóa chế độ xem tìm kiếm (localStorage).
- Chọn nhiều kết quả.
- Bulk: thêm nhãn, sao chép liên kết, export Markdown, move to trash.

### 1.8 Document library + health

Trang `/documents`:

- Health cards: tracked documents, missing owner, missing classification, review overdue, in review, archived, orphan documents, duplicate titles.
- Bộ lọc theo space/classification/từ khóa.
- Bảng tài liệu: owner, classification, review due, review status.
- Sửa metadata trực tiếp.

### 1.9 Document metadata (server EE)

Bảng `ee_doc_metadata` (migration `20261019T000001-ee-doc-metadata.ts`):

- `owner_id`, `reviewer_id`
- `classification` (public/internal/confidential/restricted)
- `doc_type`
- `effective_at`, `review_due_at`, `archived_at`
- `notes`
- audit nhẹ: `created_by_id`, `updated_by_id`, timestamps

API:

```text
POST /api/ee/docs/metadata/info
POST /api/ee/docs/metadata/update
POST /api/ee/docs/metadata/list
POST /api/ee/docs/metadata/health
```

Đặc điểm:
- Lazy tạo metadata khi editor mở tài liệu hoặc mở Doc info.
- Quyền đọc/ghi dùng `PageAccessService` và page permissions hiện có.
- Không thêm cột vào bảng `pages`, không sửa core page service.
- Không cần hook mới trong core.

### 1.10 Navigation phụ

- Header: nút **New** + command palette.
- Global sidebar: Review queue (badge số việc chờ) + Document library.
- Space sidebar: quick links Home / Review queue / Document library.

### 1.11 Space overview v2

- Hero: avatar, tên space, mô tả, badge Public/Private, member count, role.
- Actions: New page, Search, Favorite, Watch, Space settings.
- Stat strip: Members, Your role, Visibility, Created.
- Cột chính: tab **Recently updated / Favorites / Created by me** tái sử dụng các bảng hiện có.
- Cột phụ: Members (avatar stack, mở settings tab Members), Quick actions (Review queue, Document library, Favorites, Space settings, public site).
- Space settings modal nhận `initialTab` để mở đúng tab General/Members.

### 1.12 Sidebar v2

- **Global sidebar** thay mới hoàn toàn trong EE: workspace identity, New document, nhóm nav chính, favorite spaces, spaces, invite/settings/user footer.
- **Space sidebar**: header space switcher + command, nút New page, nav Overview/Search/Review queue/Library/Space settings; tree bên dưới.
- **Settings sidebar**: cùng nhịp 34px, section heading uppercase, active pill, spacing 10px.
- Row height 34px, radius 8px, icon 17px, active pill xanh nhạt, hover nhẹ, scrollbar mảnh.
- Sidebar surface dùng gray-0/dark-8, border phải hairline; content giữ body color.
- Tree row: 30px, radius 7px, active theo `aria-current`, hover nhẹ.

---

## 2. Điểm nối core

| File core | Thay đổi |
|---|---|
| `apps/client/src/App.tsx` | Reading runtime + 3 route mới (`/reviews`, `/search`, `/documents`) |
| `app-header.tsx` | `<GlobalActions />` |
| `global-app-shell.tsx` | dùng `<GlobalSidebarV2 />`, width 284 |
| `space-sidebar.tsx` | `<SpaceSidebarTop />`, `data-sc-*` attributes |
| `settings-sidebar.tsx` | `data-sc-sidebar="settings"`, `data-sc-nav` |
| `space-sidebar.module.css` | tree section flex/min-height |
| `layout.tsx` | `<UiCommands />`, import `sidebar-v2.css` |
| `aside.tsx` | hai tab cũ dùng chung `<DocInfoPanel />` |
| `page-header.tsx` | không đổi |
| `full-editor.tsx` | `<ReadingAppearanceTrigger />`, `<RecentPageTracker />` |
| `space-sidebar.tsx` | `<SpaceGlobalLinks />` |
| `editor.module.css` | dùng `--sc-reading-width` |
| `pages/dashboard/home.tsx` | render `<HomeExperience />` |
| `pages/space/space-home.tsx` | render `<SpaceOverviewPage />` |
| `features/space/components/settings-modal.tsx` | thêm prop `initialTab` |
| `ee/page-verification/...query.ts` | thêm tham số `enabled` (backward-compatible) |
| `ee.module.ts` | đăng ký `DocMetadataModule` |

Toàn bộ logic mới nằm trong:

```text
apps/client/src/ee/ui/
apps/client/src/ee/docs/
apps/server/src/ee/docs/
```

---

## 3. Kiểm chứng

```bash
pnpm --filter ./apps/client exec tsc --noEmit
pnpm --filter ./apps/server exec tsc -p tsconfig.build.json --noEmit
pnpm --filter ./apps/client exec vitest run src/ee/ui/reading/reading-preferences.test.ts
pnpm --filter ./apps/client exec stylelint "src/ee/ui/**/*.css"
pnpm --filter ./apps/client run build
pnpm --filter ./apps/server run build
```

Kết quả: typecheck client/server pass; unit test reading pass; stylelint file mới pass; build client/server pass.

Lint toàn client vẫn bị chặn bởi lỗi môi trường có sẵn (`@tanstack/eslint-plugin-query` thiếu thư mục `build/`), không liên quan thay đổi này.

---

## 4. Hạn chế hiện tại

1. **Saved views và reading preferences** lưu theo trình duyệt, chưa sync server.
2. **Metadata** chỉ được tạo cho tài liệu có editor mở hoặc metadata được chỉnh; tài liệu chưa từng mở sẽ chưa xuất hiện trong library.
3. **Bulk export** tải nhiều file tuần tự; trình duyệt có thể chặn nhiều download.
4. **Navigation** chưa tách thành rail 56px độc lập; đã bù bằng global actions, command palette và quick links.
5. **Governance dashboard** mới ở mức health cards; retention/audit/export center vẫn dùng trang settings hiện có.
6. **Tests** mới tập trung ở reading preferences; chưa có E2E cho command palette/search/bulk.

---

## 5. Bước tiếp theo đề xuất

1. Sync saved views + reading preferences qua EE user-preferences API.
2. Backfill metadata cho toàn bộ page hiện có (migration/job) để library đầy đủ.
3. Navigation rail 56px nếu muốn giảm thêm cognitive load.
4. Governance dashboard: retention, audit timeline trên tài liệu, export center.
5. E2E: create → search → review → approve → archive.
6. Đo telemetry: `command_use`, `doc_create`, `review_complete`, `bulk_action`, `doc_metadata_saved`.
