# Revision: Favicon Upload chuyển sang Base64 (thay thế thiết kế multipart+hook ban đầu)

**Ngày**: 2026-06-30
**Lý do**: Thiết kế ban đầu trong `IMPLEMENTATION_SUMMARY.md` (multipart upload qua core `/attachments/upload-image` + `CUSTOM_ATTACHMENT_UPLOAD` hook) gặp lỗi production:

```
{"success":false,"status":400,"message":"Invalid image attachment type"}
```

**Nguyên nhân gốc**: `attachment.controller.ts` có 1 whitelist validation (`validAttachmentTypes.includes(attachmentType)`) chạy **trước** khi tới được `attachmentService.uploadImage()` — whitelist này chỉ chứa `Object.values(AttachmentType)` (Avatar/WorkspaceIcon/SpaceIcon/File/Chat), nên `type: "workspace-favicon"` bị core controller chặn ngay từ đầu, **không bao giờ chạy tới hook** mà tôi đã thêm trong service layer. Đây là một core gate tôi đã bỏ sót khi thiết kế ban đầu.

User cũng phản hồi không thích flow 2-request (blob + multipart upload) — khó debug/copy. → Quyết định: **bỏ hoàn toàn multipart + hook**, chuyển sang **base64 data URL**, độc lập hoàn toàn trong EE.

---

## Thiết kế Mới

### Core: revert về 0 diff

Toàn bộ thay đổi core trước đó (`plugin-hooks.ts` +2 enum, `attachment.service.ts` +runHook) đã được **revert hoàn toàn**. Favicon không còn đi qua core attachment flow nữa — vì vậy **không cần hook**, **không cần core thay đổi gì cả**.

| File | Trạng thái |
|---|---|
| `core/plugins/plugin-hooks.ts` | ✅ Reverted — không còn `CUSTOM_ATTACHMENT_UPLOAD`/`CUSTOM_ATTACHMENT_REMOVE` |
| `core/attachment/services/attachment.service.ts` | ✅ Reverted — `uploadImage()` về nguyên trạng ban đầu |
| `core/attachment/attachment.controller.ts` | ✅ Không đổi (chưa từng sửa) |

### EE: Self-contained base64 flow

```
apps/server/src/ee/plugins/workspace-favicon/
├── workspace-favicon.module.ts        # providers: FaviconService, WorkspaceFaviconRepository
├── dto/
│   └── update-favicon.dto.ts          # { image: string } — base64 data URL
├── services/
│   └── favicon.service.ts             # validate (MIME + size) + lưu/xoá qua repo
├── repositories/
│   └── workspace-favicon.repo.ts      # raw SQL (sql tag từ kysely) — không đụng db.d.ts
├── controllers/
│   └── workspace-favicon.controller.ts # GET / POST / DELETE /api/v1/workspaces/favicon
└── migrations/
    └── 20260701T000000-workspace-favicon.sql   # ALTER TABLE workspaces ADD COLUMN favicon TEXT
```

**API mới** (độc lập với `/attachments/*` của core):

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/workspaces/favicon` | — | `{ favicon: string \| null }` |
| POST | `/api/v1/workspaces/favicon` | `{ image: "data:image/png;base64,..." }` | `{ favicon: string }` |
| DELETE | `/api/v1/workspaces/favicon` | — | — |

**Validation** (`favicon.service.ts`):
- Regex match `data:<mime>;base64,<data>`
- MIME whitelist: `image/png`, `image/jpeg`, `image/x-icon`, `image/vnd.microsoft.icon`
- Size: decode base64 length → byte size, giới hạn 1MB (decoded)
- Admin-only: `WorkspaceAbilityFactory` (tái sử dụng từ core qua `@Global()` `CaslModule`, không sửa core)

**Lưu trữ**: `workspaces.favicon` (cột `TEXT`, không phải `varchar(255)` như thiết kế ban đầu — base64 data URL cho ảnh ~1MB có thể dài tới ~1.4MB ký tự).

---

## Client: Base64 thay vì multipart

### `workspace-favicon-service.ts`
- `compressFavicon()`: resize 64×64 qua canvas (giữ nguyên logic cũ, trừ `.ico` bỏ qua compression)
- `fileToBase64DataUrl()`: `FileReader.readAsDataURL()` — **mới**, thay thế `FormData`
- `uploadWorkspaceFavicon()`: `POST /workspaces/favicon` với JSON `{ image: base64 }` — **1 request duy nhất**, không còn blob URL riêng
- `removeWorkspaceFavicon()`: `DELETE /workspaces/favicon` — **mới** (trước đây bị chặn cứng, throw lỗi "not supported")

### `workspace-favicon-uploader.tsx`
**Không còn dùng `AvatarUploader`/`CustomAvatar` (core component)** — lý do: `CustomAvatar` build URL qua `getAvatarUrl()` (core util), hàm này chỉ đặc cách prefix `http`, sẽ phá hỏng `data:` URL khi cố nối thêm base path vào. Viết uploader riêng trong EE dùng Mantine `Avatar` trực tiếp với `src={dataUrl}` — tự chứa, không phụ thuộc core URL-building convention.

### `dynamic-favicon.tsx`
- Trước: `getAvatarUrl(favicon, AvatarIconType.WORKSPACE_ICON)` rồi set `<link href={url}>`
- Sau: dùng thẳng `workspace.favicon` (đã là data URL hoàn chỉnh) làm `href` — bỏ luôn import core util

---

## So sánh Trước/Sau

| | Trước (multipart + hook) | Sau (base64, EE-only) |
|---|---|---|
| Core diff | 2 file, ~6 dòng | **0 dòng** |
| Số request upload | 2 (đa phần do FormData + blob preview) | **1** |
| Endpoint | Core `/attachments/upload-image` (gate chặn nhầm) | EE riêng `/workspaces/favicon` |
| Lưu trữ | Filename, file vật lý qua StorageService | Base64 trực tiếp trong cột DB |
| GET ảnh | Cần serve qua `/attachments/img/:type/:fileName` (core, chưa hỗ trợ type lạ) | Trả thẳng trong response JSON, không cần static serving |
| Remove | Bug — throw lỗi cứng | Hoạt động đầy đủ (`DELETE`) |

---

## ⚠️ Lưu ý vận hành

**Migration EE chưa có runner tự động thật sự.** File `.sql` trong `ee/plugins/workspace-favicon/migrations/` mô tả đúng intent theo `FORK_SAFE_PLUGIN_ARCHITECTURE.md`, nhưng codebase hiện tại **chưa có cơ chế tự-discover & chạy** các migration này (phần "How migrations are discovered" trong tài liệu gốc là minh hoạ ý tưởng, chưa phải code thật). Cần **chạy SQL này thủ công** trên DB trước khi tính năng hoạt động:

```sql
ALTER TABLE workspaces ADD COLUMN favicon text;
```

Nếu đã từng chạy migration cũ (`varchar(255)`), cần đổi kiểu cột:

```sql
ALTER TABLE workspaces ALTER COLUMN favicon TYPE text;
```
