# Hội đồng chuyên gia UI / UX / Document Management
## Phân tích hiện trạng và phương án nâng cấp giao diện SC Doc

**Trạng thái:** Đã duyệt và triển khai Phương án C. Experience Layer (Phase 1–3) đã hoàn tất — xem `EXPERIENCE_LAYER.md` và `READING_APPEARANCE.md`.  
**Phạm vi:** `apps/client` (toàn bộ shell, navigation, home, page, aside), mở rộng có kiểm soát sang `apps/server/src/ee/`  
**Ràng buộc bắt buộc:** tối thiểu hóa diff với core/upstream; mọi logic mới nằm trong `ee/`; core chỉ nhận điểm nối cơ học  
**Căn cứ:** đọc trực tiếp codebase tại thời điểm lập hội đồng (commit `f2a3a96f`)  
**Tài liệu liên quan:** `CLAUDE.md` (Golden Rule), `FORK_SAFE_PLUGIN_ARCHITECTURE.md`, `docs/detail_info_panel/DESIGN.md`

---

## 1. Tóm tắt điều hành

SC Doc hiện là một fork Docmost đã được mở rộng mạnh: có 40+ module EE, phân quyền trang, xác thực tài liệu, lịch sử phiên bản, backlinks, labels, templates, public docs, AI chat/search. **Nền tảng chức năng tốt hơn mức giao diện của nó thể hiện.**

Hội đồng đánh giá tổng thể **6,4/10**:

| Góc nhìn | Điểm | Kết luận ngắn |
|---|---:|---|
| UI / Design System | 6,0 | Đúng Mantine, accessibility tốt, nhưng token quá mỏng và nhịp điệu không đồng nhất |
| UX / Information Architecture | 5,0 | Navigation gắn chặt với route, thiếu "create" toàn cục, page header quá tải |
| Document Management | 5,0 | Năng lực nền rất tốt nhưng thiếu vòng đời tài liệu, metadata và hàng đợi review |
| Accessibility | 8,0 | Trên trung bình rõ rệt; cần giữ vững khi redesign |
| Kiến trúc / Fork safety | 8,5 | Pattern EE đã chuẩn; rủi ro chính là CSS bám DOM và bundle core |
| Đo lường sản phẩm | 5,5 | Nhiều tính năng bị chôn, chưa có metric thành công |

**Khuyến nghị của hội đồng:** chọn **Phương án B — Experience Layer** trong 3 tháng, chia 4 phase, sau đó mở rộng sang **Phương án C — Document Management Platform** nếu các metric đạt. Không viết lại core, không fork shell.

**Điểm khác biệt then chốt:** không "làm đẹp CSS" đơn thuần. Cần một **lớp trải nghiệm (Experience Layer)** gồm design token, command palette, create toàn cục, home theo công việc, một panel thông tin tài liệu duy nhất, và vòng đời tài liệu — tất cả đặt trong `ee/`.

---

## 2. Hội đồng và phương pháp

### 2.1 Thành phần hội đồng

| Vai trò | Trách nhiệm trong phiên | Câu hỏi xuyên suốt |
|---|---|---|
| **UI Lead / Design System** | Ngôn ngữ thị giác, token, mật độ, phân cấp, motion | Người dùng có nhận ra đâu là hành động chính trong 2 giây? |
| **UX Lead / IA** | Mô hình điều hướng, mental model, luồng, cognitive load | Người dùng có biết mình đang ở đâu và đi đâu tiếp? |
| **Document Management Specialist** | Phân loại, metadata, vòng đời, review, governance | Tài liệu có được tìm thấy, tin cậy và quản trị đúng vòng đời? |
| **Accessibility / Inclusive Design** | WCAG 2.2 AA, keyboard, contrast, mobile, i18n | Redesign có làm mất các nền tảng a11y đang có? |
| **Frontend Architecture / Fork-safety** | EE-first, core touch budget, bundle, lazy load | Mỗi thay đổi tốn bao nhiêu dòng core và bao nhiêu phút merge upstream? |
| **Product / Measurement** | Metric, rollout, ưu tiên giá trị | Tính năng mới có đo được thành công không? |

### 2.2 Phương pháp

1. **Heuristic evaluation** theo 10 nguyên tắc Nielsen.
2. **WCAG 2.2 AA audit** dựa trên code và các override hiện có.
3. **IA walkthrough** 6 hành trình: tạo tài liệu, tìm tài liệu, chuyển không gian, review/duyệt, chia sẻ, quản trị.
4. **Document lifecycle mapping**: Draft → Review → Approve → Publish → Supersede/Archive.
5. **Fork-impact scoring**: số file core, số dòng, khả năng vỡ khi upstream đổi.
6. **Code evidence**: mọi phát hiện dưới đây gắn với file:dòng cụ thể.

### 2.3 Giả định

- Người dùng chính: nhân viên soạn thảo, trưởng nhóm/reviewer, admin quản trị tài liệu.
- Ưu tiên desktop; mobile cần dùng được nhưng không phải nơi soạn thảo chính.
- Giữ Mantine + Tabler Icons, không thay framework UI.
- Giữ nhận diện SC Doc hiện tại; không đổi brand trong phase này.
- Feature mới mặc định **tắt**, bật theo cờ cấu hình/local storage để rollout an toàn.

---

## 3. Hiện trạng có bằng chứng

### 3.1 Shell và điều hướng

| Quan sát | Bằng chứng | Hệ quả UX |
|---|---|---|
| Header cao cố định 45px | `components/layouts/global/global-app-shell.tsx:93`; `features/page/components/header/page-header.module.css:2` | Không đủ chỗ cho breadcrumb dài + 7 controls trên màn hình hẹp |
| Ba chiều rộng sidebar khác nhau: 300px global, 220–600px space, 350px aside | `global-app-shell.tsx:95`, `:58-66`, `:104` | Bố cục nhảy khi chuyển route; mất cảm giác ổn định |
| Container nội dung không nhất quán: 900 / 800 | `pages/dashboard/home.tsx:14`, `pages/space/space-home.tsx:15`, `pages/spaces/spaces.tsx:26`, `global-app-shell.tsx:142` | Nhịp đọc và căn lề thay đổi giữa các màn |
| Global sidebar biến mất ở `/s/` và `/settings/` | `global-app-shell.tsx:87`, `:128-138` | Người dùng mất điểm neo; muốn đổi space phải quay về Home/Spaces |
| Không có nút tạo tài liệu toàn cục | `global-sidebar.tsx` không có create; create chỉ nằm trong `features/space/components/sidebar/space-sidebar.tsx:171-184`, `:208-213` | Hành động quan trọng nhất của một doc tool bị chôn trong space |
| Hai mẫu sidebar khác nhau (global sections vs space menu) | `global-sidebar.tsx:74-199` so với `space-sidebar.tsx:94-227` | Người dùng phải học lại nav mỗi lần đổi ngữ cảnh |

### 3.2 Trang tài liệu (page)

| Quan sát | Bằng chứng | Hệ quả UX |
|---|---|---|
| Page header chứa 7–9 control cùng lúc | `page-header-menu.tsx:133-199`: connection warning, edit toggle, lock badge, share, revision badge, comments, TOC, detail info, overflow menu | Quá tải nhận thức; share (hành động chính) không nổi bật |
| Menu "..." có khoảng 15 mục, gồm cả metadata footer | `page-header-menu.tsx:318-484` | Tìm hành động chậm; destructive và thường dùng nằm lẫn |
| Hai panel thông tin trùng chức năng: "Details" và "Detail Info" | `components/layouts/global/aside.tsx:57-64`; `features/page-details/components/page-details-aside.tsx:24`; `ee/components/detail-info-panel/DetailInfoPanel.tsx` | Hai nguồn sự thật; người dùng không biết chọn cái nào |
| Hành động trong Detail Info trùng page menu | `ee/components/detail-info-panel/sections/ActionsSection.tsx`, `DangerZoneSection.tsx` so với `page-header-menu.tsx:414-448` | Cùng một hành động ở hai nơi, dễ sai trạng thái |
| Loading trang trả về chuỗi rỗng | `pages/page/page.tsx:78-80` | Nháy trắng, mất cảm giác phản hồi |
| Breadcrumb sâu >3 bị nén thành first + "..." + last | `features/page/components/breadcrumbs/breadcrumb.tsx:117-148` | Mất ngữ cảnh ở cây tài liệu sâu |
| Tiêu đề trang và metadata tách rời khỏi panel | `pages/page/page.tsx:171-198` | Không thấy owner/status/ngày hiệu lực khi đang đọc |

### 3.3 Home, tìm kiếm, không gian

| Quan sát | Bằng chứng | Hệ quả UX |
|---|---|---|
| Home = AI prompt + space carousel + 3 tab | `pages/dashboard/home.tsx:15-23`; `features/home/components/home-tabs.tsx:25-40` | Home là "trang trưng bày", chưa phải "bàn làm việc" |
| Không có "Recently viewed / Continue reading" | Không tìm thấy `recentlyViewed`, `lastViewed`, `continueReading` trong client/server | Người dùng mất mạch công việc sau khi đóng tab |
| Không có hàng đợi "cần tôi review/duyệt" trên Home | `home-tabs.tsx:25-40` chỉ có recent/favorites/created | Reviewer phải tự đi tìm tài liệu |
| Search mạnh nhưng chỉ ở dạng spotlight | `features/search/components/search-spotlight.tsx:24-262` | Không có trang kết quả đầy đủ, không lưu bộ lọc, không sort/bulk |
| Không có saved views / bộ lọc tái sử dụng | Search filters là state cục bộ `search-spotlight.tsx:31-40` | Lặp lại thao tác tìm kiếm mỗi ngày |
| Tree row thấp (30px; space pageLink padding 8px) | `global-sidebar.module.css:21`; `space-sidebar.module.css:67-79` | Khó chạm trên mobile; mật độ desktop chưa được kiểm soát |
| Tooltip tắt trên touch | `src/theme.ts:46` (`touch: false`) | Icon-only trên mobile không có nhãn hiển thị |

### 3.4 Design system và accessibility

| Quan sát | Bằng chứng | Hệ quả |
|---|---|---|
| Token layer rất mỏng: 18 dòng, ~8 biến | `ee/styles/sc-tokens.css` | Không đủ để đồng bộ toàn app |
| Token đã được import nhưng ít nơi dùng; phần lớn component dùng trực tiếp `light-dark(...)` hoặc hex | `components/layouts/global/layout.tsx:9`; nhiều file `.module.css` | Hai ngôn ngữ thiết kế song song |
| Radius mặc định `sm` nhưng card dùng `md`, panel dùng nhiều giá trị khác | `src/theme.ts:42`; `space-carousel.tsx:18`; `DetailInfoPanel.module.css` | Thiếu nhịp thị giác |
| A11y nền rất tốt: skip link, focus, reduced motion, contrast override, live region, roving tabindex | `styles/a11y-overrides.css`; `features/page/tree/components/doc-tree-row.tsx:262`, `:348`; `components/ui/skip-to-main.tsx` | Cần bảo vệ, không được regression |
| i18n 13 locale, có `vi-VN` | `apps/client/public/locales/*/translation.json` | Có thể ship song ngữ ngay |

### 3.5 Kiến trúc EE và fork safety

Pattern hiện tại đã rất tốt: core chỉ import component EE và render, ví dụ breadcrumb (`features/page/components/breadcrumbs/breadcrumb.tsx:24`) dùng `@/ee/breadcrumb/space-breadcrumb-link`. Danh sách điểm nối EE trong core hiện có khoảng 30 import ở `components/` và hàng chục ở `features/`.

Rủi ro chính không phải logic mà là:
1. **CSS bám DOM/class Mantine** — dễ vỡ khi upstream đổi markup.
2. **Core bundle** — nhiều component EE được import tĩnh trong shell (`DetailInfoPanel`, `TopMenuTrigger`, `PersonalSpaceNavItem`, hooks trial).
3. **Route/JSX đổi ở upstream** — các dòng wiring có thể conflict nhẹ.

Kết luận: cần một **runtime layer** trong `ee/` với slot rõ ràng, lazy load, và ngân sách core touch được đo bằng số dòng.

---

## 4. Biên bản hội đồng

### 4.1 UI Lead / Design System — 6,0/10

**Nhận định.** Nền Mantine giúp app nhất quán ở mức component, nhưng chưa có ngôn ngữ thị giác cấp sản phẩm. Token quá ít, mật độ và phân cấp đang do từng file tự quyết. Header 45px, sidebar 300px, container 900px là những hằng số rời rạc chứ không thuộc một hệ.

**Khuyến nghị.**
- Xây token 3 lớp: primitive (color/spacing/type) → semantic (surface, border, text, accent, danger, focus) → component (header height, nav width, reading width, aside width, row height, control height).
- Chuẩn hóa 3 chế độ mật độ: Comfortable (desktop mặc định), Compact (power user), Touch (mobile ≥44px).
- Chỉ dùng 3 bán kính (4/8/12), 2 mức elevation, 1 thang chữ cho nội dung.
- Đưa toàn bộ override vào `ee/ui/styles/` và import một lần; không sửa `theme.ts` trừ khi thật cần.
- Motion dùng token sẵn có `--sc-duration-fast/med` và `--sc-ease` (`ee/styles/sc-tokens.css:8-10`).

**Điều kiện thành công.** Không còn giá trị hex/`gray-x` rải rác trong các component thuộc diện redesign; visual regression chụp 12 màn chính ở light/dark/mobile.

### 4.2 UX Lead / IA — 5,0/10

**Nhận định.** App đang dùng **route-coupled navigation**: sidebar đổi hoàn toàn theo URL, và biến mất ở space/settings. Đây là nguyên nhân gốc của cảm giác "lạc" khi làm việc sâu. Hành động tạo tài liệu — quan trọng nhất — chỉ tồn tại trong space sidebar. Page header dồn gần như mọi hành động vào một hàng icon + một menu 15 mục.

**Khuyến nghị.**
- **Navigation 2 lớp:** rail cố định (Home, Search/Command, Inbox, Spaces, Favorites, Settings) + context sidebar (space tree/settings) + content + aside. Rail không biến mất.
- **Một điểm tạo tài liệu toàn cục:** nút "New" ở rail/header, mở destination picker (space + parent + template). Tái sử dụng `components/ui/destination-picker/` và `ee/template`.
- **Command palette** thay vai trò "launcher": tìm trang, chuyển space, tạo trang, mở settings, hỏi AI, chạy action. Giữ `⌘/Ctrl+K`.
- **Progressive disclosure ở page header:** Share là primary; Comments/TOC là icon; mọi thứ còn lại vào "More" có nhóm (Document, Export, Protect, Danger).
- **Hợp nhất "Details" + "Detail Info"** thành một panel `Document info` với tab Info / Links / Activity / Access.
- **Home theo công việc**, không theo tính năng: Continue, Needs attention, Recent, Spaces.
- **Skeleton thay vì blank** ở page và aside.

**Điều kiện thành công.** 5 task usability test đạt ≥85% không trợ giúp; số bước đổi space giảm từ ≥3 xuống 1; không còn hai entry cho cùng một panel.

### 4.3 Document Management Specialist — 5,0/10

**Nhận định.** Về năng lực nền, SC Doc đã có gần đủ nguyên liệu của một DMS: cây tài liệu, labels, templates, history, backlinks, comments, permissions, lock, verification, audit, retention, public docs, AI search. Nhưng **vòng đời tài liệu không hiện diện như một thực thể**. Không có status/owner/review cycle/classification; không có hàng đợi review; không có bulk actions; không có saved views; không có dashboard tài liệu cũ/hết hiệu lực.

**Khuyến nghị (theo thứ tự giá trị).**
1. **Metadata tối thiểu:** `status` (Draft / In review / Approved / Published / Superseded / Archived), `owner`, `reviewer`, `effectiveDate`, `reviewDueDate`, `classification` (Public / Internal / Confidential), `docType`.
2. **Lifecycle state machine** có transition hợp lệ và quyền tương ứng; audit mọi transition.
3. **Review queue** tái sử dụng page-verification + comments; "My reviews", due soon, overdue.
4. **Saved views + full search page**: facets theo space/label/owner/status/date; lưu view; bulk move/label/archive/export.
5. **Document health**: stale (quá reviewDueDate), orphan (không backlink), duplicate candidates, broken links, thiếu metadata bắt buộc.
6. **Governance dashboard**: retention, audit, export center, policy acknowledgement (về sau).

**Nguyên tắc.** Không đưa metadata vào bảng `pages` của core. Dùng bảng EE riêng khóa `page_id`, lazy-upsert khi đọc/ghi để **không cần hook mới trong core**.

### 4.4 Accessibility / Inclusive Design — 8,0/10

**Nhận định.** Đây là điểm mạnh hiếm có: skip link, focus management, contrast override có ghi chú WCAG, reduced motion, live region cho drag-and-drop, roving tabindex trong tree. Redesign phải **kế thừa** chứ không làm lại.

**Khuyến nghị.**
- Mobile: mọi target ≥44×44px; icon-only phải có nhãn nhìn thấy hoặc label trong menu, không chỉ tooltip (tooltip đang tắt touch: `theme.ts:46`).
- Không dùng màu làm tín hiệu duy nhất cho status; thêm icon/text.
- Command palette và panel mới phải có focus trap, Escape, aria-live cho kết quả.
- Giữ tỷ lệ tương phản đã đạt; thêm kiểm tra contrast cho token mới ở cả light/dark.
- Test keyboard-only cho 6 hành trình; axe không có lỗi critical/serious.

### 4.5 Frontend Architecture / Fork-safety — 8,5/10

**Nhận định.** Golden Rule trong `CLAUDE.md` đang được thực thi tốt. Rủi ro chuyển từ "sửa core" sang "CSS/JSX bám core" và "bundle core phình". Cần biến pattern thành cơ chế có tên, có ngân sách.

**Khuyến nghị.**
- Tạo `apps/client/src/ee/ui/` là **Experience Layer** duy nhất; core chỉ import runtime + slot components.
- Ưu tiên **slot tường minh** hơn DOM selector. Nếu buộc phải bám DOM, dùng `data-*` ổn định (ví dụ `data-page-header` đã có ở `page-header.tsx:34`).
- **Core touch budget:** mỗi file core ≤5 dòng; tổng ≤20 dòng cho toàn bộ phase 1. Ghi vào PR description.
- Lazy load mọi màn/panel nặng bằng `lazyWithPrefetch` (đã có: `lib/lazy-prefetch.ts`).
- Feature flag client-side (`ee/ui/config.ts`) đọc env + localStorage; không thêm cột DB cho UI flag.
- Thêm visual regression + smoke test cho các slot.

### 4.6 Product / Measurement — 5,5/10

**Nhận định.** Nhiều năng lực tốt bị chôn: templates, verification, backlinks, saved search, bulk. Không có định nghĩa "thành công" của một lần nâng cấp UI.

**Khuyến nghị.**
- North-star: **số tài liệu được tạo và hoàn thành vòng đời mỗi tuần** (tạo → review → publish), không chỉ DAU.
- Bộ metric ở mục 12.
- Rollout: dogfood nội bộ → 10% workspace → 50% → 100%; luôn có fallback tắt cờ.
- Instrument các event: `doc_create`, `doc_open`, `search_result_click`, `search_zero`, `review_start`, `review_complete`, `space_switch`, `command_use`, `panel_open`.

---

## 5. Tổng hợp vấn đề ưu tiên

### P0 — Chặn trải nghiệm cốt lõi (làm ngay trong Phase 1)

| # | Vấn đề | Bằng chứng | Hướng xử lý |
|---|---|---|---|
| P0-1 | Không có create toàn cục | `space-sidebar.tsx:171-184` | `QuickCreate` trong rail/header, EE |
| P0-2 | Navigation biến mất / đổi hình dạng theo route | `global-app-shell.tsx:87,128-138` | Rail cố định + context sidebar |
| P0-3 | Page header quá tải, share không nổi bật | `page-header-menu.tsx:133-199` | Page toolbar EE, phân nhóm lại |
| P0-4 | Hai panel thông tin trùng nhau | `aside.tsx:57-64` | Hợp nhất thành `DocInfoPanel` |
| P0-5 | Blank loading | `page.tsx:78-80` | Skeleton toàn trang + aside |
| P0-6 | Home không phản ánh công việc | `home.tsx:15-23` | Home v2 theo công việc |

### P1 — Giá trị cao, rủi ro thấp (Phase 1–2)

| # | Vấn đề | Hướng xử lý |
|---|---|---|
| P1-1 | Search chỉ là spotlight, không lưu bộ lọc | Trang `/search` EE + saved views |
| P1-2 | Không có "Continue reading" | Local recent (phase 1), server sync (phase 2) |
| P1-3 | Không có hàng đợi review | `/reviews` tái sử dụng verification |
| P1-4 | Không có metadata/vòng đời | EE docs module + bảng riêng |
| P1-5 | Không có bulk actions | Chọn nhiều ở search/list/tree |
| P1-6 | Token/mật độ không đồng nhất | Token v2 + density preference |

### P2 — Hoàn thiện và mở rộng (Phase 3–4)

- Document health dashboard, stale/orphan/duplicate.
- Governance dashboard: retention, audit timeline trên tài liệu, export center.
- Template gallery + doc types + required metadata.
- Link health, backlinks graph, supersedes/superseded-by.
- Onboarding, shortcut map, tour, i18n hoàn chỉnh.

---

## 6. Nguyên tắc thiết kế mới

1. **Work-first, not feature-first.** Home và nav trả lời "hôm nay tôi cần làm gì", không phải "hệ thống có gì".
2. **Một hành động chính mỗi màn.** Page: Share/Edit. Home: New. Search: mở kết quả. Review: Approve.
3. **Progressive disclosure.** 3–5 control hiển thị; còn lại vào menu có nhóm.
4. **Ổn định bố cục.** Rail và context sidebar không biến mất; chỉ nội dung thay đổi.
5. **Một nguồn sự thật cho mỗi khái niệm.** Một panel thông tin, một lifecycle, một search.
6. **Nhanh cảm nhận.** Skeleton, optimistic UI, prefetch, transition 120–220ms.
7. **Accessible by default.** Bàn phím, contrast, reduced motion, target size.
8. **EE-first, core-minimal.** Mọi logic mới trong `ee/`; core chỉ nối dây.
9. **Đo được.** Mỗi phase có metric và tiêu chí thoát.
10. **Có thể tắt.** Mọi thay đổi lớn sau feature flag, fallback về trải nghiệm cũ.

---

## 7. Ba phương án

### Phương án A — Visual Refresh (2–4 tuần)

**Nội dung:** token v2, CSS override, chuẩn hóa spacing/radius/container, làm gọn header, tinh chỉnh sidebar, skeleton cơ bản. Không thêm route, không thêm server.

- Giá trị: 40%
- Rủi ro: thấp
- Core touch: ~5 dòng
- Phù hợp: nếu chỉ có 1 frontend và cần kết quả nhanh.

**Hạn chế:** không giải quyết create/navigation/lifecycle; người dùng vẫn "lạc" và reviewer vẫn không có hàng đợi.

### Phương án B — Experience Layer (khuyến nghị, 10–12 tuần)

**Nội dung:** A + rail cố định + command palette + quick create + home v2 + page toolbar + doc info hợp nhất + skeleton + saved views (client) + review queue (UI).

- Giá trị: 75%
- Rủi ro: thấp–trung bình
- Core touch: ~17 dòng / 8 file
- Server: không bắt buộc (trừ review queue dùng API sẵn có)
- Phù hợp: mục tiêu "hiện đại, tăng trải nghiệm, core tối thiểu".

### Phương án C — Document Management Platform (5–6 tháng)

**Nội dung:** B + metadata/lifecycle (server EE) + bulk + document health + governance dashboard + template/doc type + analytics.

- Giá trị: 100%
- Rủi ro: trung bình
- Core touch: vẫn ~20 dòng; phần lớn nằm trong `ee/`
- Server: cần module `apps/server/src/ee/docs/` + migration riêng
- Phù hợp: nếu SC Doc là hệ thống quản lý tài liệu chính thức, có nhu cầu tuân thủ/audit.

### So sánh

| Tiêu chí | A | B | C |
|---|---|---|---|
| Cải thiện cảm nhận | Cao | Rất cao | Rất cao |
| Giải quyết "lạc navigation" | Không | Có | Có |
| Tăng tạo tài liệu | Thấp | Cao | Cao |
| Quản trị vòng đời | Không | Một phần | Đầy đủ |
| Rủi ro merge upstream | Rất thấp | Thấp | Thấp |
| Thời gian | 2–4 tuần | 10–12 tuần | 5–6 tháng |
| Nguồn lực tối thiểu | 1 FE + 0.5 design | 1–1.5 FE + 0.5 design | 2 FE + 1 BE + 0.5 design |

**Quyết định đề xuất:** duyệt **B ngay**, thiết kế schema và API cho **C** song song ở mức tài liệu (chưa code), để không phải làm lại UI khi bật lifecycle.

---

## 8. Kiến trúc đề xuất: Experience Layer trong `ee/`

### 8.1 Cấu trúc thư mục

```text
apps/client/src/ee/ui/
├── config.ts                     # cờ UI_V2 theo env + localStorage
├── runtime/
│   ├── ui-provider.tsx           # context: density, reading width, flags
│   ├── ui-runtime.tsx            # mount overlay/portal, keyboard layer
│   └── feature-gate.tsx          # fallback component khi tắt cờ
├── styles/
│   ├── ui-tokens.css             # token 3 lớp (kế thừa sc-tokens.css)
│   ├── ui-base.css               # override shell, typography, focus
│   └── ui-motion.css             # transition + reduced-motion
├── primitives/
│   ├── sc-button.tsx
│   ├── sc-card.tsx
│   ├── sc-section.tsx
│   ├── sc-toolbar.tsx
│   ├── sc-empty-state.tsx
│   ├── sc-skeleton.tsx
│   ├── sc-kbd.tsx
│   └── sc-badge.tsx
├── navigation/
│   ├── app-rail.tsx              # rail cố định
│   ├── app-navigation.tsx        # rail + context sidebar (wrapper)
│   ├── space-switcher.tsx
│   └── quick-create.tsx
├── command/
│   ├── command-palette.tsx
│   ├── command-registry.ts
│   └── commands/
│       ├── navigation.commands.ts
│       ├── page.commands.ts
│       ├── space.commands.ts
│       └── ai.commands.ts
├── home/
│   ├── home-experience.tsx
│   ├── continue-working.tsx
│   ├── needs-attention.tsx
│   ├── recent-documents.tsx
│   ├── quick-actions.tsx
│   └── pinned-spaces.tsx
├── page/
│   ├── page-toolbar.tsx          # bọc PageHeaderMenu hiện tại
│   ├── page-skeleton.tsx
│   ├── doc-info-panel.tsx        # hợp nhất Details + Detail Info
│   ├── doc-info-tabs.tsx
│   └── lifecycle-badge.tsx       # phase 2
├── search/
│   ├── search-page.tsx
│   ├── search-facets.tsx
│   └── saved-views.tsx
├── reviews/
│   ├── review-queue-page.tsx
│   └── review-card.tsx
└── preferences/
    ├── density-control.tsx
    └── reading-width-control.tsx
```

### 8.2 Ngân sách core touch (Phase 1)

| File core | Thay đổi | Số dòng |
|---|---|---:|
| `components/layouts/global/layout.tsx` | import `ui-tokens.css` + `<UiRuntime/>` | 2 |
| `components/layouts/global/app-header.tsx` | `<CommandTrigger/>`, `<QuickCreateButton/>` | 2 |
| `components/layouts/global/global-app-shell.tsx` | thay khối navbar bằng `<AppNavigation .../>` | 4 |
| `features/page/components/header/page-header.tsx` | đổi import `PageHeaderMenu` → EE `PageToolbar` (JSX giữ nguyên) | 1 |
| `components/layouts/global/aside.tsx` | `DetailInfoPanel` → `DocInfoPanel`; tab details dùng chung | 2 |
| `pages/dashboard/home.tsx` | `<HomeExperience/>` có fallback | 3 |
| `App.tsx` | route `/search`, `/reviews` | 2 |
| **Tổng** | **8 file** | **~16** |

Ghi chú: `page-header.tsx` hiện đã có `data-page-header="true"` (`:34`) nên có thể dùng làm slot ổn định nếu không muốn đổi JSX.

### 8.3 Server cho Phase 2 (chỉ khi duyệt C)

```text
apps/server/src/ee/docs/
├── docs.module.ts
├── controllers/
│   ├── doc-metadata.controller.ts
│   ├── doc-lifecycle.controller.ts
│   └── saved-view.controller.ts
├── services/
│   ├── doc-metadata.service.ts
│   ├── doc-lifecycle.service.ts
│   └── doc-health.service.ts
├── repositories/
│   ├── doc-metadata.repository.ts
│   └── saved-view.repository.ts
└── migrations/
    ├── 001_ee_doc_metadata.sql
    ├── 002_ee_doc_lifecycle_events.sql
    └── 003_ee_saved_views.sql
```

Nguyên tắc:
- Bảng riêng, khóa `page_id`, `ON DELETE CASCADE` theo page.
- **Lazy upsert** metadata khi đọc/ghi lần đầu → không cần hook `AFTER_PAGE_CREATE` trong core.
- Mọi API dùng guard/permission hiện có của page.
- Đăng ký module trong `ee/ee.module.ts` (file EE-owned).
- Không đổi `apps/server/src/core/**`, không thêm migration vào `database/migrations/`.

### 8.4 Cờ và rollout

```ts
// ee/ui/config.ts
export const uiFlags = {
  shellV2: readFlag("SC_UI_SHELL_V2"),
  homeV2: readFlag("SC_UI_HOME_V2"),
  commandPalette: readFlag("SC_UI_COMMAND"),
  docInfoV2: readFlag("SC_UI_DOC_INFO"),
  searchPage: readFlag("SC_UI_SEARCH_PAGE"),
  reviewQueue: readFlag("SC_UI_REVIEWS"),
  lifecycle: readFlag("SC_UI_LIFECYCLE"), // phase 2
};
```

- `readFlag` = env build-time hoặc localStorage override cho dogfood.
- Mặc định `false`; bật theo workspace/user trong giai đoạn thử.
- Mỗi flag có `<FeatureGate fallback={...}>` để quay về UI cũ mà không revert code.

---

## 9. Roadmap

### Phase 0 — Foundation (1,5–2 tuần)

**Mục tiêu:** có token, primitive, runtime, cờ.

- Token 3 lớp + import một lần.
- `UiProvider` (density, reading width, flags).
- 8 primitive.
- `PageSkeleton`, `DocInfoSkeleton`.
- Visual regression baseline 12 màn (light/dark/mobile).
- Không đổi hành vi người dùng.

**Exit:** build xanh; không tăng bundle core >10KB; axe 0 critical; không có diff core ngoài 2 dòng.

### Phase 1 — Quick wins & khung trải nghiệm (3–4 tuần)

**Mục tiêu:** giải quyết P0.

- `QuickCreate` (space + parent + template) ở rail/header.
- `AppRail` + `AppNavigation` (rail cố định; context sidebar giữ nguyên).
- `CommandPalette` (actions, pages, spaces, AI, recent).
- `PageToolbar` bọc page header menu; Share là primary; nhóm lại menu.
- `DocInfoPanel` hợp nhất; bỏ entry trùng.
- `HomeExperience` v1: Continue (local), Needs attention (verification API), Recent, Pinned spaces.
- Skeleton toàn trang.

**Exit:** 5 task usability ≥85%; create ≤2 click từ bất kỳ màn; đổi space ≤2 bước; P0 đóng; core diff ≤16 dòng.

### Phase 2 — Findability & Review (3–4 tuần)

**Mục tiêu:** tăng tìm thấy và hoàn thành vòng review.

- Trang `/search` với facets, sort, grouping, bulk chọn.
- Saved views (local trước, server sau).
- Trang `/reviews`: My reviews, Due soon, Overdue; hành động approve/reject dùng verification hiện có.
- Recent viewed đồng bộ local; nếu duyệt C thì server sync.
- Bulk actions: move, label, archive, export.
- Metadata UI read-only hiển thị trong DocInfo (chuẩn bị cho C).

**Exit:** search zero-result <15%; review task success ≥80%; bulk thao tác 20 tài liệu <30 giây.

### Phase 3 — Document lifecycle (4–6 tuần, cần duyệt C)

**Đã giao (slice 1):** Reading Appearance — chọn phông chữ, cỡ chữ, giãn dòng/chữ, màu nền đọc, độ rộng đọc và phân biệt `I / l / 1`. Chi tiết: `READING_APPEARANCE.md`.

**Mục tiêu:** biến tài liệu thành thực thể có vòng đời.

- Server `ee/docs` + migrations.
- Status/owner/reviewer/dates/classification/docType.
- State machine + transition + audit.
- Lifecycle badge trong page và list.
- Document health: stale, orphan, duplicate candidate, broken link.
- Governance dashboard (retention/audit/export) — có thể tách phase 4.

**Exit:** 100% tài liệu mới có metadata mặc định; review turnaround giảm ≥30%; không có migration core.

### Phase 4 — Polish & scale (2–3 tuần + liên tục)

- Motion, micro-interaction, empty state, onboarding, shortcut map.
- Template gallery + doc types.
- i18n `en-US` + `vi-VN` đầy đủ cho chuỗi mới.
- A11y audit cuối, performance budget, cleanup token cũ.
- Tài liệu hóa và training.

---

## 10. Đặc tả các màn hình trọng tâm

### 10.1 Shell v2

```text
┌──────┬─────────────────────┬──────────────────────────────┬────────────────┐
│ Rail │ Context sidebar     │ Content                      │ Aside          │
│ 56px │ 260–320px           │ reading 720 / app 900 / full │ 320–360px      │
│      │                     │                              │                │
│ Home │ Space name  [v]     │ Breadcrumb        Share  ... │ Comments / TOC │
│ Cmd  │ Overview            │ Title                        │ Doc info       │
│ Inbox│ Pages          +    │ Editor                       │                │
│ Space│  └ Page             │                              │                │
│ Fav  │  └ Page             │                              │                │
│      │ Favorites           │                              │                │
│ User │ Settings            │                              │                │
└──────┴─────────────────────┴──────────────────────────────┴────────────────┘
```

Hành vi:
- Rail luôn hiện; active state theo route.
- Context sidebar đổi theo route nhưng **không làm rail biến mất**.
- `+` cạnh "Pages" và nút New trên rail cùng mở QuickCreate.
- Aside chỉ mở khi có nhu cầu; nhớ tab gần nhất theo user.

### 10.2 Home v2

```text
Chào buổi sáng, An            [New document] [Ask AI]
Tìm tài liệu, người, không gian...                    ⌘K

TIẾP TỤC LÀM VIỆC
  • Chính sách nghỉ phép            Space Nhân sự   2 giờ trước
  • Biên bản họp Sprint 24          Space Product    hôm qua

CẦN BẠN XỬ LÝ (3)
  • Chờ duyệt: Quy trình mua sắm    hạn hôm nay     [Review]
  • Quá hạn review: SOP vận hành    quá 3 ngày      [Review]

GẦN ĐÂY TRONG KHÔNG GIAN CỦA BẠN
  [Recent changes list]

KHÔNG GIAN GHIM
  [Space cards]
```

Quy tắc:
- Khối "Cần xử lý" ẩn nếu không có việc.
- Nếu AI tắt, hero đổi thành ô tìm kiếm + New.
- Mỗi khối có empty state ngắn, không chiếm chỗ khi rỗng.

### 10.3 Command palette

```text
┌──────────────────────────────────────────────────────────┐
│  Tìm hoặc gõ lệnh...                              ESC    │
├──────────────────────────────────────────────────────────┤
│  HÀNH ĐỘNG                                               │
│  + Tạo tài liệu mới                                ⌘N    │
│  → Chuyển không gian                               ⌘J    │
│  ↗ Mở cài đặt                                      ⌘,    │
│  ✦ Hỏi AI                                          ⌘/    │
│  TRANG GẦN ĐÂY                                           │
│  ...                                                     │
│  KHÔNG GIAN                                              │
│  ...                                                     │
└──────────────────────────────────────────────────────────┘
```

- Một nguồn dữ liệu: command registry + unified search hiện có.
- Enter chạy; ⌘Enter mở tab mới với page; Escape đóng và trả focus.
- Screen reader: aria-live thông báo số kết quả.

### 10.4 Page toolbar

```text
Breadcrumb: Space / Cha / Trang            [View|Edit] [Share] [💬] [⋯]
                                                                  │
   ⋯ = Tài liệu: TOC, Doc info, History, Attachments
       Xuất: Export, Print, Copy link, Copy Markdown
       Bảo vệ: Lock, Verify, Permissions
       Nguy hiểm: Move, Archive, Trash
```

- Share là nút primary duy nhất trên hàng.
- Chế độ View/Edit rõ ràng; read-only ẩn Edit.
- Revision badge chuyển vào Doc info > Activity (giảm nhiễu header), vẫn truy cập 1 click.

### 10.5 Doc info panel (hợp nhất)

```text
┌────────────────────────────────────────────┐
│ Document info                          [x] │
│ [Info] [Links] [Activity] [Access]         │
├────────────────────────────────────────────┤
│ STATUS        Approved   (badge + icon)    │
│ Owner         An Nguyen                    │
│ Reviewer      Binh Tran                    │
│ Effective     01/11/2026                   │
│ Review due    01/05/2027  (còn 12 ngày)    │
│ Classification Internal                    │
│ Doc type      Quy trình                    │
│                                             │
│ PEOPLE                                      │
│ Created by / Last updated by                │
│                                             │
│ STATS                                       │
│ Views / Words / Created / Updated           │
└────────────────────────────────────────────┘
```

- Tab Links: incoming/outgoing backlinks, supersedes/superseded-by (phase 3).
- Tab Activity: history, verification, audit events (read-only).
- Tab Access: quyền hiện tại, lock, public link, share.
- Khi tắt cờ: giữ nguyên 2 panel cũ, không mất dữ liệu.

### 10.6 Mobile

- Rail thu thành bottom bar 5 mục: Home, Search, New, Inbox, More.
- Context sidebar thành drawer toàn màn; target ≥44px.
- Page toolbar: breadcrumb 1 dòng + Share + More; ẩn TOC/info vào More.
- Doc info thành bottom sheet.
- Không dùng tooltip làm nhãn duy nhất.

---

## 11. Kế hoạch kỹ thuật chi tiết

### 11.1 Thứ tự triển khai

1. Token + runtime + cờ (không đổi UI).
2. Primitive + skeleton.
3. QuickCreate + CommandPalette (độc lập, dễ rollback).
4. AppRail + AppNavigation (thay navbar).
5. PageToolbar + DocInfoPanel.
6. HomeExperience.
7. Search page + saved views.
8. Review queue.
9. Lifecycle (nếu duyệt C).

### 11.2 Quy ước code

- Không sửa file core ngoài bảng 8.2.
- Mỗi core touch phải có comment 1 dòng lý do? **Không** — repo không thêm comment mặc định; thay vào đó ghi trong PR description.
- Component EE nhận prop tối thiểu, không import state toàn cục nếu không cần.
- Dùng `lazyWithPrefetch` cho mọi màn mới.
- Dùng `useTranslation`; mọi chuỗi mới thêm vào `en-US` và `vi-VN` cùng PR.
- Mọi thao tác phá hủy phải có confirm + undo nếu API cho phép.
- Không đổi URL hiện có; route mới đặt dưới `/search`, `/reviews`.

### 11.3 Test

| Loại | Phạm vi | Công cụ |
|---|---|---|
| Unit | primitive, registry, flag, state machine | Vitest |
| Component | QuickCreate, CommandPalette, DocInfoPanel | Vitest + Testing Library |
| Integration | create flow, switch space, review flow | Vitest + MSW/nock nếu có |
| Visual | 12 màn × light/dark/mobile | Playwright screenshot |
| A11y | axe trên 8 màn chính | axe-core/Playwright |
| E2E smoke | login → create → search → review | Playwright (nếu có hạ tầng) |
| Manual | 5 task usability, 5–8 người | Moderated |

### 11.4 Hiệu năng

- Bundle EE UI tách chunk; không import vào `main.tsx`.
- Search debounce giữ 300ms; command palette mở <100ms (prefetch registry).
- Page LCP <2,5s trên mạng 4G; INP <200ms; CLS <0,1.
- Tree 1.000 node vẫn mượt (đã có memo comparator: `doc-tree-row.tsx:371-405`).

---

## 12. Đo lường thành công

### 12.1 North-star và chỉ số

| Chỉ số | Baseline | Mục tiêu Phase 1 | Mục tiêu Phase 3 |
|---|---|---|---|
| Time-to-first-document (từ login) | chưa đo | <20s | <10s |
| % phiên có tạo hoặc sửa tài liệu | chưa đo | +15% | +30% |
| Search zero-result rate | chưa đo | <20% | <15% |
| Search result click-through | chưa đo | >40% | >50% |
| Review turnaround | chưa đo | giảm 15% | giảm 30% |
| Tài liệu quá hạn review | chưa đo | — | giảm 25% |
| Số bước đổi space | 3+ | ≤2 | 1 |
| Task success (usability) | chưa đo | ≥85% | ≥90% |
| SUS | chưa đo | ≥70 | ≥75 |
| axe critical/serious | 0 hiện tại | 0 | 0 |
| LCP / INP / CLS | chưa đo | đạt ngưỡng | duy trì |

### 12.2 Cách thu thập

- Cloud: PostHog đã tích hợp (`main.tsx:18-47`); thêm event qua `ee/ui/telemetry.ts`.
- Self-host: tôn trọng privacy; chỉ log cục bộ/aggregate, không gửi ra ngoài nếu chưa được phép.
- Usability test: 5–8 người, 5 task, ghi video + think-aloud.
- Visual regression + a11y trong CI.

---

## 13. Rủi ro và biện pháp

| Rủi ro | Mức | Biện pháp |
|---|---|---|
| CSS override vỡ khi upstream đổi markup | Trung bình | Ưu tiên token + slot; giới hạn selector; visual regression |
| Conflict ở 8 file core | Thấp | Mỗi file ≤5 dòng; tách PR nhỏ; ghi core touch budget |
| Bundle core tăng | Trung bình | Lazy load; đo bundle trước/sau; budget 10KB |
| Hai UI song song gây lệch | Trung bình | FeatureGate + lộ trình bỏ UI cũ; không sửa cả hai |
| Metadata EE lệch với page core | Thấp | Khóa ngoại page_id; lazy upsert; cascade delete |
| Rò rỉ quyền trong dashboard mới | Trung bình | Dùng guard hiện có; test theo role; không cache chéo user |
| A11y regression | Trung bình | Axe CI; keyboard test; contrast check token |
| i18n thiếu chuỗi | Thấp | Checklist en-US + vi-VN trong PR |
| Người dùng phản đối thay đổi | Thấp | Rollout theo cờ; onboarding; giữ fallback ít nhất 1 release |
| Phình phạm vi (scope creep) | Cao | Phase gate + exit criteria; mọi yêu cầu mới vào backlog |

---

## 14. Quyết định cần duyệt

1. **Chọn phương án:** B (khuyến nghị) hay A/C?
2. **Ngân sách thời gian:** chấp nhận 10–12 tuần cho Phase 0–2?
3. **Lifecycle taxonomy:** danh sách status và metadata tối thiểu có đúng nghiệp vụ SC Doc không? Có cần trường bắt buộc theo doc type?
4. **Server EE:** có duyệt mở `apps/server/src/ee/docs/` ở Phase 3 không?
5. **Nhận diện:** giữ nguyên look Docmost hay bắt đầu tách nhận diện SC Doc (font, màu nhấn, logo)?
6. **Rollout:** dogfood bao lâu trước khi bật cho toàn bộ workspace?

---

## 15. Việc làm ngay sau khi duyệt

| # | Việc | Owner | Kết quả |
|---|---|---|---|
| 1 | Chốt token v2 + 3 màn wireframe (Shell, Home, Doc info) | UI Lead | Figma + token file |
| 2 | Tạo `ee/ui/` skeleton + `config.ts` + `UiRuntime` | FE | PR nhỏ, cờ tắt |
| 3 | Tạo `QuickCreate` + `CommandPalette` | FE | Dùng được độc lập |
| 4 | Viết 5 kịch bản usability + tuyển 5–8 người | Product | Baseline |
| 5 | Đo bundle/LCP/axe baseline | FE | Số liệu trước |
| 6 | Chốt taxonomy lifecycle với nghiệp vụ | Doc Mgmt | Bảng trạng thái |

---

## Phụ lục A — Checklist review PR cho thay đổi UI

- [ ] Không có file core ngoài bảng 8.2; mỗi file ≤5 dòng.
- [ ] Logic nằm trong `ee/ui/`; core chỉ import + render.
- [ ] Có feature flag và fallback.
- [ ] Có `aria-label`, focus visible, keyboard path.
- [ ] Contrast light/dark đạt AA; target mobile ≥44px.
- [ ] Chuỗi mới có `en-US` + `vi-VN`.
- [ ] Không import tĩnh component nặng vào core.
- [ ] Có test (unit/component) và screenshot visual.
- [ ] Đã đo bundle trước/sau.
- [ ] Đã cập nhật tài liệu này nếu thay đổi phạm vi.

## Phụ lục B — Bảng ánh xạ vấn đề → phase

| Vấn đề | Phase |
|---|---|
| Token/mật độ/container | 0–1 |
| Create toàn cục | 1 |
| Navigation rail | 1 |
| Command palette | 1 |
| Page toolbar gọn | 1 |
| Doc info hợp nhất | 1 |
| Skeleton | 0–1 |
| Home theo công việc | 1–2 |
| Search page + saved views | 2 |
| Review queue | 2 |
| Bulk actions | 2 |
| Metadata/lifecycle | 3 |
| Document health | 3 |
| Governance dashboard | 3–4 |
| Template/doc type | 4 |
| Onboarding/shortcut map | 4 |

## Phụ lục C — Tham chiếu code chính

| Chủ đề | File |
|---|---|
| Shell | `apps/client/src/components/layouts/global/global-app-shell.tsx` |
| Header | `apps/client/src/components/layouts/global/app-header.tsx` |
| Global sidebar | `apps/client/src/components/layouts/global/global-sidebar.tsx` |
| Space sidebar | `apps/client/src/features/space/components/sidebar/space-sidebar.tsx` |
| Aside | `apps/client/src/components/layouts/global/aside.tsx` |
| Page | `apps/client/src/pages/page/page.tsx` |
| Page header | `apps/client/src/features/page/components/header/page-header.tsx` |
| Page menu | `apps/client/src/features/page/components/header/page-header-menu.tsx` |
| Home | `apps/client/src/pages/dashboard/home.tsx` |
| Search | `apps/client/src/features/search/components/search-spotlight.tsx` |
| Tree | `apps/client/src/features/page/tree/components/doc-tree-row.tsx` |
| Tokens | `apps/client/src/ee/styles/sc-tokens.css` |
| Theme | `apps/client/src/theme.ts` |
| A11y | `apps/client/src/styles/a11y-overrides.css` |
| Detail info | `apps/client/src/ee/components/detail-info-panel/DetailInfoPanel.tsx` |
| Page details | `apps/client/src/features/page-details/components/page-details-aside.tsx` |
| Fork rule | `CLAUDE.md`, `FORK_SAFE_PLUGIN_ARCHITECTURE.md` |

---

**Kết luận của hội đồng:** SC Doc không thiếu tính năng; nó thiếu một lớp trải nghiệm gắn kết và một mô hình vòng đời tài liệu. Làm **Phương án B** với kỷ luật EE-first sẽ mang lại phần lớn giá trị với rủi ro thấp, đồng thời mở đường cho **Phương án C** mà không phải đập đi làm lại.
