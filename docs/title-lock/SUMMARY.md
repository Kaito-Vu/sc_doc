# Tóm Tắt: Title Lock Feature

**Feature Name**: Title Lock — Click Icon Edit để Edit Tên Page  
**Status**: 📋 **Documented** (chưa implement)  
**Complexity**: ⭐ **Simple** (~1.5 giờ)  
**Category**: **Core UI/UX Enhancement**

---

## 🎯 Mục Tiêu

Thêm chế độ "lock title" để tránh user sửa nhầm tên page:
- ✏️ Default: title hiển thị text + icon edit nhỏ bên cạnh
- 🔓 Click icon edit: bật input editable
- ✅ Save: auto-close edit mode

---

## 📊 Quick Facts

| Khía cạnh | Chi tiết |
|---|---|
| **File thay đổi** | `apps/client/src/features/editor/title-editor.tsx` |
| **Lines thêm** | ~40 |
| **Dependencies** | Mantine, Tabler Icons (đã có) |
| **DB changes** | ❌ Không |
| **API changes** | ❌ Không |
| **Migration** | ❌ Không |
| **Fork-Safe** | ✅ Core feature (không vi phạm) |
| **Time estimate** | 1.5 giờ |

---

## 📝 Tài Liệu Đã Viết

| File | Mục đích |
|---|---|
| **REQUIREMENTS.md** | Chi tiết yêu cầu + acceptance criteria |
| **PLAN.md** | Kế hoạch tổng thể + kiến trúc quyết định |
| **IMPLEMENTATION.md** | Step-by-step code changes + diffs |
| **SUMMARY.md** | This file — quick reference |

---

## 🏗️ Thiết Kế

### State Management
```tsx
const [isEditingTitle, setIsEditingTitle] = useState(false);
```

### Two Render Modes
```
MODE 1 (isEditingTitle = false)
┌─────────────────────────────────┐
│ Page Title Here    [✎ Edit Icon]│
└─────────────────────────────────┘
  (read-only text)    (click → edit)

MODE 2 (isEditingTitle = true)
┌─────────────────────────────────┐
│ [Page Title Here ________________]
│  (editable input, focused)       │
└─────────────────────────────────┘
```

### Flow
```
1. Load page
   ↓
2. isEditingTitle = false
   ↓
3. Show text + icon
   ↓
4. User clicks icon
   ↓
5. setIsEditingTitle(true)
   ↓
6. Show editor, focus input
   ↓
7. User types → auto-save (500ms debounce)
   ↓
8. After save: setIsEditingTitle(false)
   ↓
9. Back to text + icon
```

---

## ✅ Implementation Steps

1. **Add imports** (5 min)
   - ActionIcon, Group, Tooltip từ Mantine
   - IconPencil từ Tabler

2. **Add state** (3 min)
   - `const [isEditingTitle, setIsEditingTitle] = useState(false);`

3. **Update editable logic** (5 min)
   - Thêm `&& isEditingTitle` vào condition

4. **Update save logic** (3 min)
   - Call `setIsEditingTitle(false)` sau save

5. **Update render** (10 min)
   - Mode 1 (default): text + icon
   - Mode 2 (editing): full editor

6. **Test** (20 min)
   - Manual test các flows

---

## 🧪 Test Checklist

- [ ] Open page → icon visible
- [ ] Click icon → input active
- [ ] Edit → auto-save 500ms
- [ ] Blur → close mode
- [ ] ReadOnly → no icon
- [ ] Mobile → no overflow
- [ ] Rapid edits → single save

---

## 📊 Before & After

### BEFORE
```tsx
<div className="page-title">
  <EditorContent editor={titleEditor} onKeyDown={handleTitleKeyDown} />
</div>
```
✅ Simple, but user can edit anytime (risky)

### AFTER
```tsx
<div className="page-title">
  {isEditingTitle ? (
    <EditorContent editor={titleEditor} ... onBlur={closeEdit} />
  ) : (
    <Group gap="xs">
      <EditorContent editor={titleEditor} style={{ flex: 1 }} />
      <ActionIcon onClick={openEdit}>
        <IconPencil />
      </ActionIcon>
    </Group>
  )}
</div>
```
✅ Safer: require explicit edit action

---

## 🎯 Acceptance Criteria

**All from REQUIREMENTS.md**:
- [ ] Title displays as text + icon edit (default)
- [ ] Click icon edit → input active
- [ ] Edit auto-saves after 500ms
- [ ] Blur/click outside → close edit mode
- [ ] Icon hidden when readOnly or ViewMode
- [ ] Mobile responsive (icon doesn't overflow)
- [ ] Existing save logic preserved
- [ ] No data loss on navigation

---

## 🚀 Ready to Implement?

👉 See **IMPLEMENTATION.md** for step-by-step code changes.

---

## 📚 Related Docs

- [REQUIREMENTS.md](./REQUIREMENTS.md) — Full requirements
- [PLAN.md](./PLAN.md) — Architecture & planning
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) — Code walkthrough
- [../../FORK_SAFE_PLUGIN_ARCHITECTURE.md](../../FORK_SAFE_PLUGIN_ARCHITECTURE.md) — Fork-safe guidelines

---

## ❓ FAQs

**Q: Tại sao không dùng EE plugin?**  
A: Feature này là core UX improvement đơn giản, không cần plugin system. Nó không có conditional logic, toggles, hoặc complexity mà cần isolated.

**Q: Sẽ ảnh hưởng performance không?**  
A: Không. Chỉ thêm 1 boolean state + conditional render. Không có API/DB changes.

**Q: Có break existing functionality không?**  
A: Không. Tái sử dụng existing save logic, chỉ thay đổi UI/state.

**Q: Mobile support?**  
A: Có. Icon nhỏ bên cạnh, không che title. Group layout wrap="nowrap".

---

## 📅 Timeline

| Phase | Duration | Status |
|---|---|---|
| **Requirement Review** | — | ✅ Done |
| **Planning** | — | ✅ Done |
| **Documentation** | — | ✅ Done |
| **Implementation** | ~1.5h | ⏳ TODO |
| **Testing** | ~30m | ⏳ TODO |
| **Review & Merge** | ~30m | ⏳ TODO |

---

**Prepared**: 2026-06-30  
**Author**: Claude Code  
**Version**: 1.0
