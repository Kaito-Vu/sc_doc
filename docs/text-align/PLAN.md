# Kế hoạch Triển khai: Default Text Align = Justify

**Ngày lập kế hoạch**: 2026-06-30
**Tuân thủ**: [FORK_SAFE_PLUGIN_ARCHITECTURE.md](../../FORK_SAFE_PLUGIN_ARCHITECTURE.md)

---

## 1. Phân loại theo Fork-Safe Architecture

| Khía cạnh | Kết luận |
|---|---|
| **Core vs EE** | **Core config change** — 1 tham số trên 1 extension Tiptap có sẵn |
| **Cần hook mới?** | ❌ Không — không phải event/business-logic interception, chỉ là default value của 1 schema attribute |
| **DB/Migration?** | ❌ Không — xem mục 3, đây là thay đổi render-time, không phải data migration |
| **API thay đổi?** | ❌ Không |
| **Áp dụng checklist nào?** | **Không áp dụng quy trình Bước 1/2 (hook)** — đây không phải "plugin/EE feature" theo định nghĩa của tài liệu gốc (không có khái niệm bật/tắt, không phải tích hợp bên thứ 3 như reCAPTCHA/Azure AD/Minio) |

### Vì sao không cần EE/hook ở đây

`FORK_SAFE_PLUGIN_ARCHITECTURE.md` áp dụng cho **plugin system** — tính năng có thể isolate, bật/tắt độc lập, dễ phát sinh conflict khi merge upstream vì đụng nhiều file core (auth, attachment, workspace...).

Thay đổi này:
- Chỉ sửa **1 dòng, 1 file duy nhất** (`extensions.ts:214`) — đã là cấu hình **core thuần** (không phải hook interception point)
- Không có khái niệm "tắt được" hay "cấu hình per-workspace" trong scope hiện tại (xem REQUIREMENTS.md mục 5 — out of scope)
- Bản thân file `extensions.ts` **đã được cả core và EE (`ee/template/`) import dùng chung** — không có lớp tách biệt EE cho editor extensions trong codebase hiện tại, nên không có "EE-isolation pattern" nào để tuân theo ở đây

→ Vẫn tôn trọng **tinh thần** của tài liệu gốc ("Changes are minimal and isolated" — Code Review Checklist mục cuối): diff tối thiểu 1 dòng, không thêm logic nghiệp vụ, không side-effect ngoài dự kiến.

---

## 2. Hiện trạng Code (đã research, xác nhận 2 lần độc lập)

**File cấu hình duy nhất**:
```ts
// apps/client/src/features/editor/extensions/extensions.ts:214
TextAlign.configure({ types: ["heading", "paragraph"] })
```

- Không set `defaultAlignment` tường minh → dùng default của package `@tiptap/extension-text-align` là `"left"`.
- `types`: chỉ áp dụng cho `heading` và `paragraph` (không có `blockquote`, `listItem`...).

**Phạm vi lan toả** (vì `mainExtensions`/`templateExtensions` dùng chung):

| File | Vai trò |
|---|---|
| `features/editor/page-editor.tsx` | Editor chính |
| `features/editor/readonly-page-editor.tsx` | Share/readonly view |
| `features/page-history/components/history-editor.tsx` | Lịch sử (single view) |
| `features/page-history/components/history-editor-side-by-side.tsx` | Lịch sử (compare 2 bên) |
| `features/editor/components/transclusion/transclusion-content.tsx` | Nội dung nhúng |
| `ee/template/pages/template-editor.tsx` | EE Template editor |
| `ee/template/components/readonly-template-editor.tsx` | EE Template readonly |

→ **1 điểm sửa = áp dụng toàn bộ**, không cần sửa từng file.

**Title editor**: dùng bộ extension riêng, tối giản (Document/Heading/Text/Placeholder/History/EmojiCommand), **không có TextAlign** → không bị ảnh hưởng, không cần đụng tới `title-editor.tsx`.

**Bubble menu / Toolbar**: `text-alignment-selector.tsx`, `alignment-group.tsx` gọi `editor.chain().focus().setTextAlign(value).run()` → ghi **attr tường minh** vào node. Đổi default **không xung đột** vì Tiptap luôn ưu tiên attr tường minh hơn default.

**Table cell alignment**: `table-text-alignment.tsx`, `alignment-submenu.tsx`, `table-cell-menu.tsx` — đây là cơ chế alignment **riêng cho ô bảng** (CSS/attr khác), không dùng chung schema attr với `TextAlign` extension của paragraph/heading → không bị ảnh hưởng, không cần test riêng nhưng nên smoke-test qua loa.

---

## 3. Phân tích Tác động Dữ liệu (Risk Analysis)

### Cơ chế lưu trữ
- `pages.content` (Postgres `jsonb`, migration `20240324T086300-pages.ts:14`) lưu trực tiếp Tiptap/ProseMirror JSON.
- `pages.ydoc` (`bytea`) lưu Yjs binary cho collaborative editing.
- `TextAlign` extension **chỉ ghi `attrs.textAlign` vào JSON khi user set tường minh** qua `setTextAlign()`. Node chưa từng set align → **không có field `textAlign` trong JSON đã lưu**.
- `defaultAlignment` là tham số **render-time** (option của extension), không phải migration — khi load JSON thiếu attr, Tiptap áp default tại thời điểm render.

### Kết luận tác động
| Loại page | Tác động khi đổi default → justify |
|---|---|
| Page **mới tạo**, chưa từng align | ✅ Hiển thị `justify` ngay |
| Page **cũ**, user **chưa từng** chỉnh align (không có `attrs.textAlign`) | ⚠️ **Tự động đổi sang `justify`** ở lần render tiếp theo — không cần migration, xảy ra tự nhiên qua schema default |
| Page **cũ**, user **đã từng** chỉnh align tường minh (kể cả từng chọn lại "left") | ✅ Giữ nguyên giá trị đã lưu, không đổi |

**Đây là hành vi mong đợi của thay đổi default**, không phải bug — nhưng cần user xác nhận chấp nhận (xem mục 6 Câu hỏi mở).

---

## 4. Thiết kế Giải pháp

### Thay đổi duy nhất

```diff
// apps/client/src/features/editor/extensions/extensions.ts:214
- TextAlign.configure({ types: ["heading", "paragraph"] }),
+ TextAlign.configure({ types: ["heading", "paragraph"], defaultAlignment: "justify" }),
```

**1 dòng, 1 file.**

### Không cần thay đổi gì khác
- ❌ Không sửa `title-editor.tsx` (không dùng TextAlign)
- ❌ Không sửa bubble menu / toolbar (logic set align không đổi)
- ❌ Không sửa table alignment files (cơ chế riêng)
- ❌ Không cần migration DB
- ❌ Không cần API/DTO thay đổi
- ❌ Không cần EE module mới

---

## 5. Trình tự Triển khai

1. **Sửa 1 dòng** trong `extensions.ts:214` — thêm `defaultAlignment: "justify"`.
2. **Test thủ công**:
   - Tạo page mới → gõ text → xác nhận hiển thị `justify`
   - Mở page cũ chưa từng set align → xác nhận tự đổi sang `justify`
   - Mở page cũ đã từng set align (left/center/right) → xác nhận **giữ nguyên**
   - Dùng bubble menu/toolbar đổi align trên page mới → xác nhận hoạt động bình thường (left/center/right/justify đều chọn được)
   - Test trên: page editor, share/readonly page, page history (cả single + side-by-side compare), transclusion, EE template editor
   - Smoke-test table cell alignment không bị ảnh hưởng
3. **Không cần cập nhật Live Hook Inventory** trong `FORK_SAFE_PLUGIN_ARCHITECTURE.md` (không có hook nào liên quan).
4. **`git diff --stat`**: xác nhận đúng 1 file, 1 dòng thay đổi.

---

## 6. Quyết định (đã xác nhận với user — 2026-06-30)

1. ✅ **Chấp nhận tác động ngược (retroactive)**: user yêu cầu rõ ràng "các page cũ tự chuyển sang justify". Không cần migration data — hành vi này xảy ra tự nhiên qua schema default (đúng phương án mục 4), không cần Phương án A/B ở mục 7.
2. **Phạm vi node types**: giữ nguyên `["heading", "paragraph"]` như hiện tại — không mở rộng thêm trừ khi có yêu cầu mới.

---

## 7. Phương án thay thế (nếu câu hỏi #1 ở trên có câu trả lời "Không")

Nếu **không** chấp nhận page cũ tự đổi default, cần thêm 1 trong 2 phương án (không nằm trong yêu cầu ban đầu, ghi nhận để tham khảo):

- **Phương án A — Migration data**: viết script chạy 1 lần, quét toàn bộ `pages.content`, với node `paragraph`/`heading` chưa có `attrs.textAlign` → set tường minh `"left"` trước khi đổi default. Phức tạp hơn, cần xử lý cả `ydoc` (Yjs binary) nếu page đang có collaborative session.
- **Phương án B — Giữ nguyên global default "left", chỉ áp `justify` cho node MỚI tạo**: về bản chất Tiptap không hỗ trợ "default theo thời điểm tạo node" sẵn có — cần custom logic ở tầng editor (ví dụ: input rule hoặc `onCreate` set align cho node rỗng đầu tiên), phức tạp hơn nhiều so với 1 dòng config.

→ **Khuyến nghị**: giữ phương án ở mục 4 (đổi default đơn giản), chấp nhận tác động tự nhiên lên page cũ, trừ khi user yêu cầu rõ ràng cần giữ nguyên page cũ.
