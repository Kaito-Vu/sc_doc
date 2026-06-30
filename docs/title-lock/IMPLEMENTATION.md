# Chi Tiết Triển khai: Title Lock

**Mục tiêu**: Implement chế độ "lock title" — user phải click icon edit mới được sửa tên page.

**File chính**: `apps/client/src/features/editor/title-editor.tsx`

---

## 1. Import Statements

**Thêm vào đầu file**:

```typescript
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
```

✅ Cả `@mantine/core` và `@tabler/icons-react` đã có sẵn trong project.

---

## 2. State Declaration

**Thêm vào hàm `TitleEditor`**, sau khi khai báo các state khác:

```typescript
const [isEditingTitle, setIsEditingTitle] = useState(false);
```

**Vị trí**: Dòng ~57 (sau `const currentPageEditMode = useAtomValue(currentPageEditModeAtom);`)

---

## 3. Update EditorContent Editable

**Tìm useEffect** đặt `titleEditor.setEditable`:

```typescript
// TRƯỚC:
useEffect(() => {
  if (!titleEditor) return;
  titleEditor.setEditable(editable && currentPageEditMode === PageEditMode.Edit);
}, [currentPageEditMode, titleEditor, editable]);
```

**SAU**:

```typescript
useEffect(() => {
  if (!titleEditor) return;
  titleEditor.setEditable(
    editable && currentPageEditMode === PageEditMode.Edit && isEditingTitle
  );
}, [currentPageEditMode, titleEditor, editable, isEditingTitle]);
```

**Thay đổi**: 
- Thêm `&& isEditingTitle` vào điều kiện
- Thêm `isEditingTitle` vào dependency array

---

## 4. Close Edit Mode After Save

**Tìm `saveTitle` callback**, thêm `setIsEditingTitle(false)` khi save thành công:

```typescript
const saveTitle = useCallback(() => {
  if (!titleEditor || activePageId !== pageId) return;

  if (
    titleEditor.getText() === title ||
    (titleEditor.getText() === "" && title === null)
  ) {
    return;
  }

  updateTitlePageMutationAsync({
    pageId: pageId,
    title: titleEditor.getText(),
  }).then((page) => {
    const event: UpdateEvent = {
      operation: "updateOne",
      spaceId: page.spaceId,
      entity: ["pages"],
      id: page.id,
      payload: {
        title: page.title,
        slugId: page.slugId,
        parentPageId: page.parentPageId,
        icon: page.icon,
      },
    };

    if (page.title !== titleEditor.getText()) return;

    updatePageData(page);

    localEmitter.emit("message", event);
    emit(event);
    
    // ← THÊM DÒNG NÀY:
    setIsEditingTitle(false);
  });
}, [pageId, title, titleEditor]);
```

**Thay đổi**: Thêm `setIsEditingTitle(false);` trước closing `});` của `.then()` block.

---

## 5. Update Return Statement (Render UI)

**Thay thế toàn bộ return block**:

### TRƯỚC:
```typescript
return (
  <div className="page-title">
    <EditorContent
      editor={titleEditor}
      onKeyDown={(event) => {
        getHotkeyHandler([["mod+F", openSearchDialog]])(event);
        handleTitleKeyDown(event);
      }}
    />
  </div>
);
```

### SAU:
```typescript
return (
  <div className="page-title">
    {isEditingTitle ? (
      // Mode: Editing
      <EditorContent
        editor={titleEditor}
        onKeyDown={(event) => {
          getHotkeyHandler([["mod+F", openSearchDialog]])(event);
          handleTitleKeyDown(event);
        }}
        onBlur={() => setIsEditingTitle(false)}
      />
    ) : (
      // Mode: Saved (default)
      <Group gap="xs" wrap="nowrap">
        <EditorContent
          editor={titleEditor}
          onKeyDown={(event) => {
            getHotkeyHandler([["mod+F", openSearchDialog]])(event);
            handleTitleKeyDown(event);
          }}
          style={{ flex: 1 }}
        />
        {editable && currentPageEditMode === PageEditMode.Edit && (
          <Tooltip label={t("Click to edit title")} position="right">
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

**Giải thích**:
- Khi `isEditingTitle === true`: hiển thị editor đầy đủ, gắn `onBlur` để exit edit mode
- Khi `isEditingTitle === false`: hiển thị text + icon edit (bên phải, Group layout)
- Icon chỉ hiện khi `editable && currentPageEditMode === PageEditMode.Edit`
- Click icon → `setIsEditingTitle(true)` → focus input

---

## 6. Dependency Array Updates

**Kiểm tra tất cả `useEffect` sử dụng `isEditingTitle`** → thêm `isEditingTitle` vào dependency nếu chưa có:

```typescript
// Đã cập nhật ở bước 3
useEffect(() => {
  // ...
}, [currentPageEditMode, titleEditor, editable, isEditingTitle]); // ← isEditingTitle added
```

---

## 7. Code Diff Summary

```diff
+ import { ActionIcon, Group, Tooltip } from "@mantine/core";
+ import { IconPencil } from "@tabler/icons-react";

export function TitleEditor({...}) {
  // ...
  const [activePageId, setActivePageId] = useState(pageId);
  const currentPageEditMode = useAtomValue(currentPageEditModeAtom);
+ const [isEditingTitle, setIsEditingTitle] = useState(false);

  // ... (editor setup unchanged)

  useEffect(() => {
    if (!titleEditor) return;
-   titleEditor.setEditable(editable && currentPageEditMode === PageEditMode.Edit);
-   }, [currentPageEditMode, titleEditor, editable]);
+   titleEditor.setEditable(
+     editable && currentPageEditMode === PageEditMode.Edit && isEditingTitle
+   );
+   }, [currentPageEditMode, titleEditor, editable, isEditingTitle]);

  const saveTitle = useCallback(() => {
    // ...
    updateTitlePageMutationAsync({...}).then((page) => {
      // ...
+     setIsEditingTitle(false);
    });
  }, [...]);

  return (
    <div className="page-title">
+     {isEditingTitle ? (
+       <EditorContent
+         editor={titleEditor}
+         onKeyDown={(event) => {...}}
+         onBlur={() => setIsEditingTitle(false)}
+       />
+     ) : (
+       <Group gap="xs" wrap="nowrap">
          <EditorContent
            editor={titleEditor}
            onKeyDown={(event) => {...}}
+           style={{ flex: 1 }}
          />
+         {editable && currentPageEditMode === PageEditMode.Edit && (
+           <Tooltip label={t("Click to edit title")} position="right">
+             <ActionIcon
+               size="sm"
+               variant="subtle"
+               color="gray"
+               onClick={() => setIsEditingTitle(true)}
+               aria-label={t("Edit title")}
+             >
+               <IconPencil size={16} stroke={2} />
+             </ActionIcon>
+           </Tooltip>
+         )}
+       </Group>
+     )}
    </div>
  );
}
```

---

## 8. Verification Checklist

Sau khi implement, kiểm tra:

- [ ] TypeScript compile clean (không error)
- [ ] Imports được thêm vào đúng
- [ ] State `isEditingTitle` initialized
- [ ] Edit logic update: `isEditingTitle` check
- [ ] Save logic: `setIsEditingTitle(false)` called
- [ ] Render: 2 modes render đúng
- [ ] Icon visibility check: chỉ show khi `editable && EditMode.Edit`
- [ ] Blur handler: `onBlur={() => setIsEditingTitle(false)}`

---

## 9. Manual Testing

**Test flow**:

```
1. Open page
   ✓ See title text + edit icon on right
   
2. Click edit icon
   ✓ Input becomes active (focused)
   ✓ Cursor visible in title
   
3. Type new title
   ✓ Text updates in real-time
   ✓ After 500ms debounce → auto-save
   
4. Wait for save to complete
   ✓ Edit mode closes automatically
   ✓ Back to text + icon display
   
5. Click somewhere else (blur)
   ✓ If no changes → just close edit mode
   ✓ If changes → save + close edit mode
```

---

## 10. Potential Issues & Fixes

| Issue | Symptom | Fix |
|---|---|---|
| Icon không hiện | Click vào title vẫn edit trực tiếp | Kiểm tra điều kiện render `{editable && currentPageEditMode === PageEditMode.Edit}` |
| Blur không close mode | Click ngoài không thoát edit | Kiểm tra `onBlur={() => setIsEditingTitle(false)}` trên EditorContent |
| Save không close mode | After save, vẫn ở edit mode | Kiểm tra `setIsEditingTitle(false)` trong `.then()` |
| Mobile icon overflow | Icon che phần title | Kiểm tra `Group gap="xs" wrap="nowrap"` + `style={{ flex: 1 }}` |
| TypeScript error | Compile fail | Kiểm tra imports, type annotations |

---

## 11. After Implementation

1. **Run dev server**: `npm run dev` (hoặc tương đương)
2. **Test flows** ở mục 9
3. **Check mobile** responsiveness
4. **Commit changes**: 
   ```bash
   git add apps/client/src/features/editor/title-editor.tsx
   git commit -m "feat: add title lock - require edit icon click to edit page name"
   ```

---

## 12. Rollback (If Needed)

```bash
git revert <commit-hash>
# hoặc
git checkout HEAD -- apps/client/src/features/editor/title-editor.tsx
```
