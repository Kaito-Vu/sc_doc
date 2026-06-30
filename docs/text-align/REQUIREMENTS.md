# Yêu cầu: Default Text Align = Justify trong Page Editor

**Ngày yêu cầu**: 2026-06-30

---

## 1. Mô tả

Hiện tại, text trong page editor mặc định căn trái (`left` — giá trị mặc định ngầm định của Tiptap `TextAlign` extension khi không cấu hình `defaultAlignment`). Yêu cầu: đổi **default alignment** thành **`justify`** cho `paragraph` và `heading`.

## 2. Phạm vi ảnh hưởng (đã research)

`TextAlign` được cấu hình **1 chỗ duy nhất**:

```ts
// apps/client/src/features/editor/extensions/extensions.ts:214
TextAlign.configure({ types: ["heading", "paragraph"] })
```

Mảng `mainExtensions` (chứa cấu hình trên) được tái sử dụng bởi mọi nơi render Tiptap editor trong toàn app:

| File dùng `mainExtensions` / `templateExtensions` | Vai trò |
|---|---|
| `features/editor/page-editor.tsx` | Editor chính của page |
| `features/editor/readonly-page-editor.tsx` | Xem page read-only / shared page |
| `features/page-history/components/history-editor.tsx` | Xem version lịch sử |
| `features/page-history/components/history-editor-side-by-side.tsx` | So sánh lịch sử |
| `features/editor/components/transclusion/transclusion-content.tsx` | Nội dung nhúng (transclusion) |
| `ee/template/pages/template-editor.tsx` | Editor template |
| `ee/template/components/readonly-template-editor.tsx` | Xem template read-only |
| `features/editor/components/fixed-toolbar/use-toolbar-state.ts` | Toolbar state (đọc lại config) |

→ **Title editor không dùng** `TextAlign` (không có trong cấu hình riêng của `title-editor.tsx`) — chỉ áp dụng cho nội dung thân page, không ảnh hưởng tiêu đề.

## 3. Tác động dữ liệu hiện hữu (quan trọng)

Tiptap lưu `textAlign` như một **node attribute** trong JSON content (ProseMirror schema). Cơ chế:

- `TextAlign.configure({ defaultAlignment: 'justify' })` đặt **schema default** cho attribute `textAlign` trên node `paragraph`/`heading`.
- **Page/node đã có `attrs.textAlign` lưu sẵn trong DB** (user đã từng set align thủ công, hoặc do default cũ "left" được serialize) → **không bị ảnh hưởng**, giữ nguyên giá trị đã lưu.
- **Page/node chưa từng có `attrs.textAlign`** (tạo trước khi cấu hình, hoặc default hiện tại không serialize khi bằng giá trị mặc định) → khi schema default đổi, các node này sẽ **tự động hiển thị justify** thay vì left ở lần render tiếp theo.

→ Cần xác nhận với user: **đổi default có chấp nhận việc các trang cũ (chưa từng chỉnh align) tự động đổi sang justify không?** Đây là rủi ro UX cần lưu ý, không phải bug.

## 4. Acceptance Criteria

- [ ] Tạo page mới → paragraph/heading mặc định canh `justify`
- [ ] User vẫn chọn được left/center/right/justify qua toolbar/bubble menu như cũ (không bị khoá)
- [ ] Page cũ đã set align thủ công → giữ nguyên, không bị ghi đè
- [ ] Áp dụng đồng nhất cho: page editor, readonly viewer, share page, history viewer (cả single & side-by-side), template editor, transclusion
- [ ] Title editor không bị ảnh hưởng (không có text-align)
- [ ] Table cell alignment (`table-text-alignment.tsx`) — kiểm tra không bị xung đột vì đây là extension/logic riêng cho ô bảng

## 5. Không nằm trong scope

- ❌ Đổi default align theo từng workspace/user preference (chỉ 1 default toàn app)
- ❌ Migration retroactive ép tất cả page cũ về justify (chỉ áp dụng tự nhiên qua schema default, không chạy migration data)
- ❌ Thêm setting UI cho phép admin chọn default align
