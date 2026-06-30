# Kế hoạch: (1) Danh sách Space có quyền trong Sidebar & (2) Upload Favicon trong Workspace Settings

> Phạm vi: `apps/client` (React) + `apps/server` (NestJS), repo fork `sc_doc`.
> Ngày lập kế hoạch: 2026-06-30.
> **Tài liệu này bắt buộc tuân thủ [`FORK_SAFE_PLUGIN_ARCHITECTURE.md`](../../FORK_SAFE_PLUGIN_ARCHITECTURE.md)**: mọi thay đổi vào `core` phải tối thiểu (hook enum 1 dòng + `runHook()` 1-3 dòng tại đúng 1 điểm), toàn bộ business logic thật nằm trong `ee/`. Trước khi đọc tiếp, xem qua [Checklist gốc](../../FORK_SAFE_PLUGIN_ARCHITECTURE.md#checklist-adding-a-new-plugin-or-ee-feature) và [Live Hook Inventory](../../FORK_SAFE_PLUGIN_ARCHITECTURE.md#live-hook-inventory-source-of-truth) — kế hoạch này áp dụng đúng quy trình đó cho 2 tính năng dưới đây.

---

## 0. Phân loại theo Checklist (Bước 1 vs Bước 2)

| Tính năng | Cần hook mới? | Lý do | Áp dụng |
|---|---|---|---|
| A. Sidebar "All spaces" | **Không** | Chỉ đọc dữ liệu qua API core đã tồn tại (`POST /spaces` → đã tự lọc theo membership của user), không có "before/after" event nào cần chặn/mở rộng. | **Bước 1**: implement trong component riêng, đụng core tối thiểu (1 import + 1 dòng render). |
| B. Upload Favicon | **Có** | Cần xử lý 1 `type` attachment mới (`workspace-favicon`) và 1 cột DB mới (`workspaces.favicon`) — đây là hành vi mới cần chèn vào flow `uploadImage()`/`remove-icon` hiện có của core. | **Bước 2**: thêm đúng 1 hook enum + 1-3 dòng `runHook()` tại nhánh "unhandled type" sẵn có, toàn bộ logic lưu/đọc/migrate nằm trong `ee/plugins/workspace-favicon/`. |

---

## 1. Tính năng A — "All spaces" trong Sidebar (Bước 1, không cần hook)

### 1.1 Vì sao không cần đụng hook system

`apps/server/src/core/space/space.controller.ts` (`POST /spaces` → `getWorkspaceSpaces`) gọi `spaceMemberService.getUserSpaces(user.id, pagination)` — **đã tự động chỉ trả về space mà user hiện tại là member**. Không có business logic mới ở backend, không có event cần plugin chặn. Theo đúng Bước 1 của checklist: "Plugin chỉ cần hook đã có sẵn / dữ liệu đã có sẵn → không chạm core logic, chỉ viết code hiển thị."

### 1.2 Thiết kế tối thiểu hoá diff vào core

`global-sidebar.tsx` là core client component đã tồn tại (không phải file EE), nên không thể tránh sửa nó hoàn toàn — nhưng áp dụng đúng tinh thần "Changes are minimal and isolated" (Code Review Checklist của tài liệu gốc): tách toàn bộ JSX/logic mới ra **1 component riêng**, core file chỉ thêm **import + 1 dòng gọi component**.

- **Mới**: `apps/client/src/features/space/components/sidebar/all-spaces-sidebar-section.tsx`
  - Tự fetch `useGetSpacesQuery({ limit: 50 })`.
  - Render section "All spaces" (Mantine `Collapse`, chevron mở/đóng, `CustomAvatar` + tên, giới hạn 10-15 item + link "View all" → `/spaces`), theo đúng pattern UI đã có ở khối "Favorite spaces" (dòng 107-148 file gốc).
- **Sửa** `apps/client/src/components/layouts/global/global-sidebar.tsx`:
  ```diff
  + import AllSpacesSidebarSection from "@/features/space/components/sidebar/all-spaces-sidebar-section";
  ...
        </div>{/* end Favorite spaces section */}
  +     <AllSpacesSidebarSection onNavigate={handleNavClick} />
      </ScrollArea>
  ```
  → đúng **2 dòng thay đổi** trong core file.
- **Sửa** `apps/client/src/components/layouts/global/global-sidebar.module.css`: thêm class cho chevron/collapsible nếu component mới cần style dùng chung (có thể tự đem CSS riêng trong component mới thay vì sửa file module dùng chung core, để giảm diff core xuống còn đúng 1 file).

### 1.3 File cần tạo/sửa

- Mới: `apps/client/src/features/space/components/sidebar/all-spaces-sidebar-section.tsx`
- Mới (tuỳ chọn, để không đụng CSS module core): `apps/client/src/features/space/components/sidebar/all-spaces-sidebar-section.module.css`
- Sửa (core, tối thiểu): `apps/client/src/components/layouts/global/global-sidebar.tsx` (+2 dòng)

### 1.4 Không cần cập nhật Live Hook Inventory

Vì không có hook nào được thêm/emit/listen, bảng này giữ nguyên — không cần thay đổi `FORK_SAFE_PLUGIN_ARCHITECTURE.md`.

---

## 2. Tính năng B — Upload Favicon (Bước 2, cần 1 hook mới)

### 2.1 Vì sao cần hook

`attachment.service.ts` (`uploadImage()`) hiện switch theo `type` cố định (`Avatar | WorkspaceIcon | SpaceIcon`), nhánh `else` đang `throw new BadRequestException('Image upload aborted.')`. Để thêm loại `workspace-favicon` **mà không viết business logic favicon trong core**, ta biến nhánh `else` này thành một **hook mở** cho EE xử lý loại attachment tuỳ ý — đúng tinh thần "core chỉ định nghĩa contract, EE implement".

Tương tự cho `remove-icon` (`attachment.controller.ts` dòng 419) — nhánh không khớp `Avatar/WorkspaceIcon/SpaceIcon` cần 1 hook `customRemove`.

### 2.2 Core changes (đúng theo Bước 2 của checklist — chỉ 2 điểm + enum)

**(1) Thêm 2 dòng enum** vào `apps/server/src/core/plugins/plugin-hooks.ts`:
```ts
export enum CoreHooks {
  // ... existing
  CUSTOM_ATTACHMENT_UPLOAD = 'attachment:customUpload',
  CUSTOM_ATTACHMENT_REMOVE = 'attachment:customRemove',
}
```

**(2) Thêm `runHook()` tại đúng nhánh `else` sẵn có** trong `apps/server/src/core/attachment/services/attachment.service.ts` (`uploadImage()`, quanh dòng 214-216):
```diff
- } else {
-   throw new BadRequestException(`Image upload aborted.`);
- }
+ } else {
+   const result = await runHook(CoreHooks.CUSTOM_ATTACHMENT_UPLOAD, {
+     type, workspaceId, spaceId, fileName: preparedFile.fileName, trx,
+   });
+   if (!result?.handled) {
+     throw new BadRequestException(`Image upload aborted.`);
+   }
+ }
```
(3-4 dòng thay đổi, không thêm logic nghiệp vụ — chỉ chuyển quyền xử lý cho EE.)

**(3) Tương tự tại `attachment.controller.ts` `removeIcon()`** (dòng 419 trở đi) — nhánh không khớp 3 type hiện có sẽ `runHook(CoreHooks.CUSTOM_ATTACHMENT_REMOVE, { type, workspaceId })`.

**(4) `getAttachmentFolderPath()` (`attachment.utils.ts`)**: type lạ (`workspace-favicon`) cần map ra 1 folder lưu trữ. Để không phải sửa switch-case trong core util này, EE migration/service tự tính `filePath` riêng (`workspace-favicons/{workspaceId}/...`) và truyền thẳng `filePath` qua context của hook thay vì để core tự suy ra — tránh thêm case mới vào hàm core.

> Tổng core diff cho Bước 2: **2 file** (`plugin-hooks.ts` +2 dòng, `attachment.service.ts` ~4 dòng) + **1 file controller** (~4 dòng) = đúng trong giới hạn "≤ 5 file, ≤ 5 dòng/file" của checklist gốc.

### 2.3 EE changes — toàn bộ logic thật

Module mới `apps/server/src/ee/plugins/workspace-favicon/` (theo đúng pattern `azure-ad`/`recaptcha` đã có trong `ee/plugins/`):

```
apps/server/src/ee/plugins/workspace-favicon/
├── workspace-favicon.module.ts        # OnModuleInit: hookRegistry.on(CUSTOM_ATTACHMENT_UPLOAD/REMOVE, ...)
├── handlers/
│   ├── favicon-upload.handler.ts      # lưu file vào storage, update workspaces.favicon, set handled:true
│   └── favicon-remove.handler.ts      # xoá file, set workspaces.favicon = null, set handled:true
├── repositories/
│   └── workspace-favicon.repo.ts      # raw query update/select cột favicon (KHÔNG sửa core WorkspaceRepository/db.d.ts)
└── migrations/
    └── 20260701T000000-workspace-favicon.sql   # ALTER TABLE workspaces ADD COLUMN favicon varchar
```

- **Migration nằm trong `ee/plugins/workspace-favicon/migrations/`**, chạy qua cơ chế migration runner riêng của EE mô tả ở mục "Database Migration Strategy" — **không** thêm file vào `apps/server/src/database/migrations/`.
- **Repository riêng dùng raw SQL** (`db.raw('UPDATE workspaces SET favicon = ? WHERE id = ?', ...)` hoặc Kysely `db.updateTable('workspaces' as any)`) để không phải sửa kiểu `Workspaces` trong `apps/server/src/database/types/db.d.ts` — giữ core hoàn toàn không đổi về phía typed schema.
- Đọc favicon khi trả workspace info cho client: thêm 1 listener mới trên hook đã có sẵn liên quan tới response workspace (nếu chưa có hook "decorate workspace response", đây là 1 hook bổ sung khác — xem mục 2.5 bên dưới) thay vì sửa trực tiếp `workspace.service.ts` `select([...])`.

Client EE: `apps/client/src/ee/plugins/workspace-favicon/` (pattern đã tồn tại sẵn, xem "Current Approach" cũ liệt kê `apps/client/src/ee/plugins`):
```
apps/client/src/ee/plugins/workspace-favicon/
├── components/
│   ├── workspace-favicon-uploader.tsx   # UI upload, tương tự workspace-icon.tsx nhưng độc lập trong EE
│   └── dynamic-favicon.tsx              # <Helmet> set <link rel="icon"> động
├── services/
│   └── workspace-favicon-service.ts     # gọi API upload/remove riêng (xem 2.4)
└── index.ts                              # export để core mount có điều kiện
```

### 2.4 API riêng cho favicon (thay vì tái dùng `/attachments/upload-image`)

Vì hook `CUSTOM_ATTACHMENT_UPLOAD` đặt trong core attachment flow nhưng route HTTP vẫn đi qua controller core (`POST /attachments/upload-image`, `POST /attachments/remove-icon`) — đây là **route đã tồn tại sẵn**, không cần thêm route mới. Client chỉ cần gọi đúng `type: "workspace-favicon"` qua `uploadIcon()` hiện có (`attachment-service.ts`), KHÔNG cần sửa file này (đã nhận `type` dạng string tự do).
- Cần thêm value `WORKSPACE_FAVICON = "workspace-favicon"` vào `AvatarIconType` (client) — đây là **enum thuần dữ liệu** dùng chung giữa core component (`AvatarUploader`) và EE, không phải business logic, nên có thể đặt trong `ee/plugins/workspace-favicon/` dưới dạng hằng số riêng (`export const WORKSPACE_FAVICON_TYPE = "workspace-favicon"`) thay vì sửa enum core `attachment.types.ts`, để giữ core file này nguyên vẹn.

### 2.5 Vấn đề còn lại cần 1 hook bổ sung: hiển thị favicon ở client

`IWorkspace` (client) và response `GET /workspace` hiện không có field `favicon` vì cột này chỉ tồn tại trong EE migration, core `workspace.service.ts` không biết tới nó. Hai lựa chọn:

- **Lựa chọn A (khuyến nghị, đúng kiến trúc)**: EE tự gọi 1 API riêng nhẹ để lấy favicon (`GET` qua `workspace-favicon.repo.ts` + 1 controller nhỏ trong `ee/plugins/workspace-favicon/`, độc lập hoàn toàn với `workspace.controller.ts` core). `DynamicFavicon` component (EE, mục 2.3) tự fetch endpoint này và set `<link rel="icon">` qua `Helmet`. **0 dòng core bị sửa.**
- **Lựa chọn B (diff core lớn hơn 1 dòng, KHÔNG khuyến nghị)**: thêm `'favicon'` vào `select([...])` của `workspace.service.ts` — vi phạm nguyên tắc "core không biết gì về field EE quản lý", chỉ dùng nếu lựa chọn A không khả thi về hiệu năng (gọi thêm 1 API).

→ Plan này chọn **Lựa chọn A**.

### 2.6 Validate & UX (toàn bộ trong EE, không ảnh hưởng core)

- Định dạng: `.png`, `.ico` (khuyến nghị vuông, ≤ 256×256, ≤ 1MB) — validate trong `favicon-upload.handler.ts`.
- Chỉ admin được upload/xoá (check `isAdmin` trong UI EE + guard CASL trong handler EE, gọi lại `WorkspaceAbilityFactory` đã export từ core — đây là **dùng** core, không phải **sửa** core).
- Tên file `uuid + ext` (theo đúng cách `attachment.service.ts` đặt tên hiện có) → tránh cache favicon cũ trên trình duyệt khi đổi.

### 2.7 Cập nhật Live Hook Inventory (bắt buộc theo checklist, cùng commit)

Thêm vào bảng trong `FORK_SAFE_PLUGIN_ARCHITECTURE.md`:

| Hook | Emit ở đâu (core) | Listen ở đâu (ee) | Trạng thái |
|---|---|---|---|
| `CUSTOM_ATTACHMENT_UPLOAD` | `attachment.service.ts uploadImage()` (nhánh else) | `ee/plugins/workspace-favicon/workspace-favicon.module.ts` | ✅ Hoạt động (sau khi implement) |
| `CUSTOM_ATTACHMENT_REMOVE` | `attachment.controller.ts removeIcon()` (nhánh else) | `ee/plugins/workspace-favicon/workspace-favicon.module.ts` | ✅ Hoạt động (sau khi implement) |

---

## 3. Danh sách file — tổng hợp theo Core / EE

### Core (giới hạn nghiêm ngặt, đúng checklist)
- `apps/client/src/components/layouts/global/global-sidebar.tsx` — **+2 dòng** (import + render component A)
- `apps/server/src/core/plugins/plugin-hooks.ts` — **+2 dòng** (2 enum mới)
- `apps/server/src/core/attachment/services/attachment.service.ts` — **~4 dòng** (runHook tại nhánh else)
- `apps/server/src/core/attachment/attachment.controller.ts` — **~4 dòng** (runHook tại nhánh else của remove-icon)

### EE — Tính năng A
- Mới: `apps/client/src/features/space/components/sidebar/all-spaces-sidebar-section.tsx`
  > Lưu ý: đây là tính năng dùng API core sẵn có, không phải logic "plugin chặn sự kiện", nên đặt trong `features/space/components/sidebar/` (cùng cây thư mục core feature) thay vì `ee/plugins/` là hợp lý — không có hook nào liên quan để tách ra EE.

### EE — Tính năng B
- Mới: `apps/server/src/ee/plugins/workspace-favicon/workspace-favicon.module.ts`
- Mới: `apps/server/src/ee/plugins/workspace-favicon/handlers/favicon-upload.handler.ts`
- Mới: `apps/server/src/ee/plugins/workspace-favicon/handlers/favicon-remove.handler.ts`
- Mới: `apps/server/src/ee/plugins/workspace-favicon/repositories/workspace-favicon.repo.ts`
- Mới: `apps/server/src/ee/plugins/workspace-favicon/controllers/workspace-favicon.controller.ts` (GET favicon riêng, mục 2.5)
- Mới: `apps/server/src/ee/plugins/workspace-favicon/migrations/20260701T000000-workspace-favicon.sql`
- Mới: `apps/client/src/ee/plugins/workspace-favicon/components/workspace-favicon-uploader.tsx`
- Mới: `apps/client/src/ee/plugins/workspace-favicon/components/dynamic-favicon.tsx`
- Mới: `apps/client/src/ee/plugins/workspace-favicon/services/workspace-favicon-service.ts`
- Sửa (mount UI, đăng ký module — theo pattern `EeModule`/`ee.module.ts` sẵn có, **không sửa `app.module.ts`**): `apps/server/src/ee/ee.module.ts`, và điểm mount UI điều kiện trong trang settings (`apps/client/src/pages/settings/workspace/workspace-settings.tsx`) — cần xác nhận file này có cơ chế "render EE component nếu tồn tại" sẵn có hay phải thêm 1 conditional import nhỏ (xem mục 4, câu hỏi mở #1).

---

## 4. Trình tự triển khai

1. **Tính năng A trước** (đơn giản, không hook): tạo `all-spaces-sidebar-section.tsx`, sửa `global-sidebar.tsx` (+2 dòng), test với user nhiều/ít space.
2. **Tính năng B — Core hook trước**: thêm 2 enum, thêm `runHook()` tại 2 điểm core, test bằng cách tạm thời log context (chưa có listener nên flow vẫn fail với `BadRequestException` — đúng như cũ, xác nhận core không vỡ).
3. **Tính năng B — EE migration + repo**: tạo migration `favicon` column, repo raw SQL, test migration chạy độc lập.
4. **Tính năng B — EE handlers + module**: implement `favicon-upload.handler.ts`/`favicon-remove.handler.ts`, đăng ký `.on()` trong `workspace-favicon.module.ts`, **chạy thử thật** (xác nhận hook fire, không tạo thêm "listener mồ côi" — xem Known Gaps trong tài liệu gốc).
5. **Tính năng B — EE client**: uploader UI + `dynamic-favicon.tsx` (Helmet), mount vào trang settings + layout gốc.
6. **Cập nhật Live Hook Inventory** trong `FORK_SAFE_PLUGIN_ARCHITECTURE.md` (mục 2.7) — cùng commit với bước 2-4.
7. **`git diff --stat` so với base**: xác nhận core ≤ 5 file thay đổi, mỗi file ≤ 5 dòng (theo đúng checklist Bước 3) trước khi tạo PR.

---

## 5. Câu hỏi mở cần xác nhận với user

1. `ee/ee.module.ts` / trang settings hiện đã có cơ chế "mount EE component nếu có" (giống cách `EeModule` được load có điều kiện trong `app.module.ts`) chưa, hay cần thêm 1 conditional render nhỏ trong `workspace-settings.tsx`? Cần xác nhận trước khi sửa file core này để diff không vượt quá 1-3 dòng.
2. Lựa chọn A ở mục 2.5 (gọi API riêng để lấy favicon) có chấp nhận được về mặt hiệu năng (1 request bổ sung khi load app) không, hay ưu tiên Lựa chọn B (sửa `workspace.service.ts`, đơn giản hơn nhưng vi phạm tách bạch core/EE)?
3. Sidebar "All spaces" trong ảnh mẫu còn có "Pending Reviews & Requests / Personal Space / Shared with me" — các mục này (đặc biệt "Personal Space" đã có module `ee/personal-space/` sẵn trong code) có nằm trong phạm vi đợt này không? Nếu có, cần kế hoạch riêng theo đúng checklist (rất có thể đã có hook/API sẵn từ module `personal-space` cần khảo sát thêm).
4. ✅ **IMPLEMENTED**: Định dạng file favicon hỗ trợ: `.png`, `.jpg`, `.jpeg`, `.ico` — tối đa 1MB, tự động compress xuống 64×64px (ICO bỏ qua compression). Validate ở cả client (trước upload) + server (header định dạng).
