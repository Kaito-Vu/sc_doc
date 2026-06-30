# Yêu cầu: Title Lock — Click Icon Edit để Chỉnh Sửa Tên Page

**Ngày yêu cầu**: 2026-06-30  
**Mô tả ngắn**: Khi user lưu tên page, title phải chuyển thành read-only. User phải click icon edit mới bật chế độ edit, tránh sửa nhầm tên.

---

## 1. Vấn đề Hiện Tại

- **Hành vi hiện tại**: Title page hiểu thị làm `<input>` trực tiếp, user có thể edit bất kỳ lúc nào bằng cách click vào tên.
- **Rủi ro**: User có thể sửa nhầm tên page (misclick).
- **Mong muốn**: Title cần được "khóa" (read-only), chỉ edit được khi click icon edit.

---

## 2. Yêu Cầu Chi Tiết

### 2.1 UI/UX
| Trạng thái | Hiển thị | Hành động |
|---|---|---|
| **Saved** (mặc định) | Text title + icon edit nhỏ bên cạnh | Click icon edit → chuyển sang mode Edit |
| **Editing** | Input editable full focus | Auto-save khi blur/lose focus |
| **Blur** | Tự động về mode Saved | Lưu title nếu có thay đổi |

### 2.2 Phức tạp
- ✅ Simple: chỉ thêm state `isEditingTitle` + icon edit
- ✅ 1 file thay đổi: `title-editor.tsx` (core file)
- ✅ Không cần API/migration/DB

### 2.3 Ràng buộc
- Chỉ hiện icon edit khi:
  - `editable === true` (user có quyền edit)
  - `currentPageEditMode === PageEditMode.Edit` (ở chế độ Edit, không View)
- Không ảnh hưởng đến readonly pages
- Không break existing save logic (auto-save debounce 500ms vẫn hoạt động)

### 2.4 Edge Cases
- User edit title → blur → page auto-save → close edit mode ✅
- User click edit → type → ấn Escape → chưa handle, có thể cần .on("blur") ✅
- User edit title → navigate sang page khác → force-save vẫn chạy ✅
- Mobile: icon edit cần small, không che nội dung ✅

---

## 3. Acceptance Criteria

- [ ] Mở page → thấy title text + icon edit nhỏ
- [ ] Click icon edit → input active, focus cursor
- [ ] Edit title → auto-save sau 500ms
- [ ] Blur/click ngoài → close edit mode
- [ ] Icon không hiện khi `editable=false` hoặc `readOnly=true`
- [ ] Mobile responsive: icon không che text
- [ ] Existing page save logic không bị break
- [ ] Page navigation không mất data (force-save vẫn chạy)

---

## 4. Scope & Priority

| Phần | Priority | Thời gian ước tính |
|---|---|---|
| UI state + render | P0 | 30 phút |
| Icon edit + click handler | P0 | 15 phút |
| Blur handler | P0 | 10 phút |
| Test (manual) | P1 | 20 phút |
| **Total** | | **~1.5 giờ** |

---

## 5. Không Nằm Trong Scope

- ❌ Rename title với drag-drop
- ❌ Title templates/suggestions
- ❌ Title length validation (đã có)
- ❌ History tracking for title changes (đã có)
- ❌ Undo/redo title (đã có qua Tiptap History)
