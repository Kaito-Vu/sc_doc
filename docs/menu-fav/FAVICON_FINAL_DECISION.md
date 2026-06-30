# Quyết định Cuối: Favicon = Workspace Icon (đã có sẵn)

**Ngày**: 2026-06-30

---

## Quyết định

Sau khi gặp lỗi với thiết kế multipart+hook ban đầu, rồi chuyển sang base64 upload riêng, **user quyết định đơn giản hoá triệt để**: dùng thẳng **workspace icon/logo đã có sẵn** (`workspace.logo`, tính năng `WorkspaceIcon` core đã tồn tại từ trước) làm favicon hiển thị trên tab trình duyệt — **không cần upload favicon riêng nữa**.

→ Toàn bộ EE plugin `workspace-favicon` (cả server + client) đã bị **xoá hoàn toàn**.

---

## Lý do hợp lý

- Workspace đã có icon/logo upload sẵn (`WorkspaceIcon` component, `AttachmentType.WorkspaceIcon`, field `workspace.logo`) — không cần thêm 1 bộ upload/validate/storage riêng cho favicon.
- Giảm thiểu phức tạp: không cần migration mới, không cần API riêng, không cần base64 storage, không cần EE module riêng.
- Đúng tinh thần `FORK_SAFE_PLUGIN_ARCHITECTURE.md`: **core diff = 0**, vì chỉ đọc 1 field core đã có sẵn (`workspace.logo`), không thêm field/migration/API mới.

---

## Implementation Cuối Cùng

### Đã xoá hoàn toàn
- `apps/server/src/ee/plugins/workspace-favicon/` (toàn bộ thư mục)
- `apps/client/src/ee/plugins/workspace-favicon/` (toàn bộ thư mục)
- Import `WorkspaceFaviconModule` trong `plugins.module.ts`
- Import `WorkspaceFaviconUploader` trong `workspace-settings.tsx`
- Field `favicon` trong `IWorkspace` type (client)

### Mới — duy nhất 1 component nhỏ (core, không phải EE)
```
apps/client/src/features/workspace/components/dynamic-favicon.tsx
```

```tsx
import { useAtom } from "jotai";
import { Helmet } from "react-helmet-async";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { getAvatarUrl } from "@/lib/config";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";

export default function DynamicFavicon() {
  const [workspace] = useAtom(workspaceAtom);
  const logo = workspace?.logo;

  if (!logo) return null;

  const faviconUrl = getAvatarUrl(logo, AvatarIconType.WORKSPACE_ICON);

  return (
    <Helmet>
      <link rel="icon" href={faviconUrl} />
    </Helmet>
  );
}
```

Mount trong `App.tsx` (trước `<Routes>`), dùng đúng `getAvatarUrl()` core util (đã tồn tại sẵn, xử lý đúng filename → URL qua `/attachments/img/workspace-icon/:fileName`), không cần base64, không cần endpoint mới.

### Vì sao đặt ở core thay vì EE?
- Chỉ đọc field `workspace.logo` đã tồn tại, không thêm dữ liệu/API mới
- Không có khái niệm bật/tắt, không phải tích hợp bên thứ 3
- Tương tự lý do "Title Lock" trước đó được xếp là core feature — UI/UX nhỏ, không cần plugin isolation

---

## Kết quả

| | Trạng thái |
|---|---|
| Core diff | `App.tsx` +1 import +1 dòng render, 1 file mới (`dynamic-favicon.tsx`, ~20 dòng) |
| EE diff | **0** — đã xoá sạch |
| Migration | **Không cần** — dùng field `logo` có sẵn |
| API mới | **Không cần** — dùng `/attachments/img/workspace-icon/:fileName` có sẵn |
| Upload riêng cho favicon | **Không còn** — admin chỉ cần đổi Workspace Icon, favicon tự cập nhật theo |

---

## Tài liệu liên quan (lịch sử quyết định, để tham khảo)

1. [PLAN.md](./PLAN.md) — kế hoạch ban đầu (multipart + hook), đã lỗi thời
2. [FAVICON_REVISION_BASE64.md](./FAVICON_REVISION_BASE64.md) — revision sang base64, đã lỗi thời
3. **File này** — quyết định cuối cùng, đang áp dụng
