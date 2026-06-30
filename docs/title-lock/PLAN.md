# Kế hoạch Triển khai: Title Lock (Click Icon Edit để Edit Tên Page)

**Ngày lập kế hoạch**: 2026-06-30  
**Tuân thủ**: [FORK_SAFE_PLUGIN_ARCHITECTURE.md](../../FORK_SAFE_PLUGIN_ARCHITECTURE.md) ❓ (xem mục "Quyết định Kiến trúc")

---

## 1. Phân Loại Theo Checklist

| Khía cạnh | Kết luận |
|---|---|
| **Core vs EE** | **Core Feature** — UI improvement đơn giản, không liên quan plugin system |
| **Hook cần thiết** | ❌ Không — không cần intercept event, chỉ thêm state/UI |
| **DB/Migration** | ❌ Không — không thay đổi dữ liệu |
| **API thay đổi** | ❌ Không — tái sử dụng `updateTitlePageMutation` sẵn có |
| **Checklist áp dụng** | **Không áp dụng Fork-Safe** — đây là core enhancement bình thường |

### Quyết định Kiến trúc

Theo [FORK_SAFE_PLUGIN_ARCHITECTURE.md](../../FORK_SAFE_PLUGIN_ARCHITECTURE.md), plugin system chỉ apply cho:
- Hook points (BEFORE_LOGIN, CUSTOM_ATTACHMENT_UPLOAD, etc.)
- Tính năng có thể tắt/bật
- Business logic phức tạp cần isolated

**Title Lock không rơi vào category này** — nó là UX refinement đơn giản, không có:
- ❌ Conditional features
- ❌ Admin toggles
- ❌ Complexity isolation needs
- ❌ Multi-tenant concerns

✅ **Kết luận**: Sửa core file `title-editor.tsx` là chấp nhận được.

---

## 2. Hiện Trạng Code

### Vị trí File
- **File**: `apps/client/src/features/editor/title-editor.tsx`
- **Thành phần**: `TitleEditor` component (export from `title-editor.tsx`)
- **Được sử dụng**: `pages/page/page.tsx` (dòng 4, 22, 91)

### Cấu trúc Hiện Tại
```tsx
export function TitleEditor({ pageId, slugId, title, spaceSlug, editable, isBase }) {
  // useEditor(Tiptap) → titleEditor
  // useUpdateTitlePageMutation() → save logic
  // debounceUpdate() → auto-save 500ms
  
  return (
    <div className="page-title">
      <EditorContent editor={titleEditor} onKeyDown={handleTitleKeyDown} />
    </div>
  );
}
```

**Hiện tại**: Title luôn render dưới dạng editor (EditorContent).

---

## 3. Thiết Kế Giải Pháp

### 3.1 State & Logic

**Thêm state mới**:
```tsx
const [isEditingTitle, setIsEditingTitle] = useState(false);
```

**Điều chỉnh editable logic**:
```tsx
// Hiện tại:
titleEditor.setEditable(editable && currentPageEditMode === PageEditMode.Edit);

// Sau:
titleEditor.setEditable(
  editable && currentPageEditMode === PageEditMode.Edit && isEditingTitle
);
```

**Close edit mode khi save**:
```tsx
// Thêm vào saveTitle() callback:
.then((page) => {
  // ... existing logic
  setIsEditingTitle(false);  // ← NEW
});
```

### 3.2 UI Render

**Mode 1 — Saved (mặc định)**:
```tsx
<Group gap="xs" wrap="nowrap">
  <EditorContent editor={titleEditor} style={{ flex: 1 }} />
  {editable && currentPageEditMode === PageEditMode.Edit && (
    <ActionIcon 
      onClick={() => setIsEditingTitle(true)}
      aria-label={t("Edit title")}
    >
      <IconPencil size={16} />
    </ActionIcon>
  )}
</Group>
```

**Mode 2 — Editing**:
```tsx
<EditorContent 
  editor={titleEditor}
  onBlur={() => setIsEditingTitle(false)}
/>
```

### 3.3 Dependencies

**Mantine components** (đã có sẵn):
- `ActionIcon` — button small cho icon edit
- `Group` — layout horizontal title + icon
- `Tooltip` — hint "Click to edit title"

**Tabler Icons** (đã có sẵn):
- `IconPencil` — icon edit

**Không cần thêm dependency mới** ✅

---

## 4. Implementation Checklist

### Step 1: Prepare (5 phút)
- [ ] Read [title-editor.tsx](../../apps/client/src/features/editor/title-editor.tsx) hiện tại
- [ ] Verify Mantine + Tabler icons imports sẵn có
- [ ] Understand debounce save logic

### Step 2: Add Imports (5 phút)
```tsx
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
```

### Step 3: Add State (3 phút)
```tsx
const [isEditingTitle, setIsEditingTitle] = useState(false);
```

### Step 4: Update Editable Logic (5 phút)
```tsx
useEffect(() => {
  if (!titleEditor) return;
  titleEditor.setEditable(
    editable && currentPageEditMode === PageEditMode.Edit && isEditingTitle
  );
}, [currentPageEditMode, titleEditor, editable, isEditingTitle]);
```

### Step 5: Update Save Logic (3 phút)
```tsx
const saveTitle = useCallback(() => {
  // ... existing
  updateTitlePageMutationAsync(...).then((page) => {
    // ... existing
    setIsEditingTitle(false);  // ← ADD THIS
  });
}, [...]);
```

### Step 6: Update Render (10 phút)
```tsx
return (
  <div className="page-title">
    {isEditingTitle ? (
      <EditorContent 
        editor={titleEditor}
        onKeyDown={handleTitleKeyDown}
        onBlur={() => setIsEditingTitle(false)}
      />
    ) : (
      <Group gap="xs" wrap="nowrap">
        <EditorContent editor={titleEditor} style={{ flex: 1 }} />
        {editable && currentPageEditMode === PageEditMode.Edit && (
          <Tooltip label={t("Click to edit title")}>
            <ActionIcon 
              size="sm" 
              variant="subtle" 
              color="gray"
              onClick={() => setIsEditingTitle(true)}
              aria-label={t("Edit title")}
            >
              <IconPencil size={16} stroke={2} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    )}
  </div>
);
```

### Step 7: Test (20 phút)
- [ ] Load page → title + icon edit visible
- [ ] Click icon → focus input
- [ ] Edit title → auto-save 500ms
- [ ] Blur → close edit mode
- [ ] Edit another page title → works
- [ ] ReadOnly page → no icon
- [ ] Mobile → icon doesn't overflow

---

## 5. Testing Plan

### Manual Test Cases

| Case | Steps | Expected | Status |
|---|---|---|---|
| **Open page** | 1. Load page | Title visible + icon edit | ❓ |
| **Enter edit** | 1. Click icon edit | Input active, cursor in title | ❓ |
| **Edit + save** | 1. Change text → 2. Wait 500ms | Auto-save, close edit mode | ❓ |
| **Blur exit** | 1. Click outside input | Close edit mode, show text | ❓ |
| **Mobile** | 1. Open on mobile | Icon visible, no overflow | ❓ |
| **ReadOnly** | 1. Open shared/readonly page | No icon edit | ❓ |
| **ViewMode** | 1. Toggle to View mode | Icon edit disappears | ❓ |

### Edge Cases

| Case | Behavior | Expected |
|---|---|---|
| Edit → navigate away | Force-save fires | Title saved, no data loss |
| Blur immediately | No save needed | No extra API call |
| Rapid edits | Debounce merges | Single save call |

---

## 6. Rollback Plan

Nếu feature có vấn đề, revert là đơn giản:
```bash
git revert <commit-hash>
# Hoặc
git checkout HEAD -- apps/client/src/features/editor/title-editor.tsx
```

---

## 7. File Changes Summary

### Modified Files
- `apps/client/src/features/editor/title-editor.tsx` — +imports, +state, +logic, +UI

### New Files
- Không có

### DB/API Changes
- Không có

### Diff Stats (ước tính)
- **Lines added**: ~40
- **Lines removed**: ~5
- **Net**: +35 lines

---

## 8. Deployment Notes

- ✅ **No migration** — không cần run migration
- ✅ **No feature flag** — tính năng luôn bật (không có toggle)
- ✅ **Backward compatible** — existing pages work unchanged
- ✅ **No performance impact** — state change chỉ ảnh hưởng render, không API

---

## 9. Follow-up Features (Future)

Có thể mở rộng sau này:
- Undo title edit (đã có qua Tiptap History)
- Title templates / quick rename
- Title validation rules
- Title change notifications

---

## 10. Sign-off

| Role | Status | Notes |
|---|---|---|
| **Designer** | ❓ | Chưa review UI/UX |
| **Architect** | ✅ | Kiểm trúc đơn giản, không vi phạm fork-safe |
| **QA** | ❓ | Chờ test plan |
| **Dev** | 🔄 | Đang implement |
