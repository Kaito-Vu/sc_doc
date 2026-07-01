# Kế hoạch: Hiển thị Tên Workspace ở Header (thay chữ "Docmost")

**Ngày**: 2026-07-01
**Tuân thủ**: [FORK_SAFE_PLUGIN_ARCHITECTURE.md](../../FORK_SAFE_PLUGIN_ARCHITECTURE.md)

---

## 1. Phân loại theo Fork-Safe Checklist

| Khía cạnh | Kết luận |
|---|---|
| **Core vs EE** | **Core UI change** — thay text tĩnh bằng dữ liệu đã có sẵn trong component |
| **Cần hook mới?** | ❌ Không |
| **Cần API/DB/Migration?** | ❌ Không |
| **Checklist áp dụng** | Không áp dụng quy trình Bước 1/2 (hook). Đây là UI refinement tương tự `title-lock`, `text-align default`, `dynamic-favicon` — core feature đơn giản |
| **Conflict risk khi merge upstream** | **Thấp** — `app-header.tsx` là file fork đã sửa nhiều lần. Thay đổi là 3 dòng nhỏ dễ resolve thủ công nếu conflict |

---

## 2. Hiện trạng (đã research)

**File**: `apps/client/src/components/layouts/global/app-header.tsx`

### Điểm chứa chữ "Docmost" cứng (hardcoded):

| Dòng | Code hiện tại | Vị trí UI |
|---|---|---|
| 87 | `aria-label="Docmost"` | Attribute accessibility của link brand |
| 90 | `alt="Docmost"` | Alt text của icon brand (mobile) |
| 102 | `Docmost` | **Text hiển thị** trên header desktop |

### Đặc biệt thuận lợi:
- `workspaceAtom` **đã được import sẵn** (dòng 36) và `workspace` **đã được read sẵn** (dòng 52 — dùng cho `aiChatEnabled`). Không cần thêm bất kỳ import hoặc fetch mới nào — chỉ tái sử dụng `workspace.name` sẵn có.

```tsx
// Hiện tại (app-header.tsx:52)
const [workspace] = useAtom(workspaceAtom);
const aiChatEnabled = workspace?.settings?.ai?.chat === true;

// workspace.name đã available, chỉ cần dùng ở dòng 102
```

---

## 3. Phạm vi — Trong vs Ngoài Scope

### ✅ Trong scope (yêu cầu gốc)
- Thay text "Docmost" trên header desktop thành `workspace.name`
- Cập nhật `aria-label` và `alt` (accessibility) đồng nhất

### ❌ Ngoài scope (không làm nếu không được yêu cầu)
- **`getAppName()`** trong `config.ts` — hàm static này trả về `"Docmost"`, được dùng cho `<title>` của 20+ trang. Đổi thành workspace name yêu cầu cơ chế khác (không thể đọc Jotai atom ngoài React component). Scope của yêu cầu gốc chỉ là "chữ ở header" → **giữ nguyên**.
- Logo/icon brand (ảnh `favicon-32x32.png` trên mobile) — user không đề cập, giữ nguyên.
- `<title>` tab trình duyệt — đã xử lý riêng bằng `DynamicFavicon` + `Helmet`, không liên quan header text.

---

## 4. Thiết kế Giải pháp

### Thay đổi duy nhất — 1 file, 3 dòng

```diff
// apps/client/src/components/layouts/global/app-header.tsx

- <Link to="/home" className={classes.brand} aria-label="Docmost">
+ <Link to="/home" className={classes.brand} aria-label={workspace?.name || "Docmost"}>
    <Box hiddenFrom="sm" className={classes.brandIcon}>
      <img
        src="/icons/favicon-32x32.png"
-       alt="Docmost"
+       alt={workspace?.name || "Docmost"}
        width={22}
        height={22}
      />
    </Box>
    <Text
      size="lg"
      fw={600}
      style={{ userSelect: "none" }}
      visibleFrom="sm"
    >
-     Docmost
+     {workspace?.name || "Docmost"}
    </Text>
  </Link>
```

**Fallback `|| "Docmost"`**: đảm bảo không bị rỗng khi workspace chưa load (khoảnh khắc đầu khi app khởi động trước khi `workspaceAtom` được populate từ API).

---

## 5. Triển khai (thực hiện ngay)

1. Sửa `apps/client/src/components/layouts/global/app-header.tsx` — 3 thay đổi nhỏ theo diff mục 4.
2. Test:
   - Load app → header hiển thị tên workspace thay vì "Docmost"
   - Workspace chưa load (network slow) → hiển thị "Docmost" tạm (fallback)
   - Đổi tên workspace trong Settings → F5 → header cập nhật đúng tên mới
   - Mobile: icon vẫn hiển thị đúng (alt text thay đổi không ảnh hưởng visual)

---

## 6. Không cần cập nhật Live Hook Inventory

Không có hook nào thêm/sửa. `FORK_SAFE_PLUGIN_ARCHITECTURE.md` giữ nguyên.

---

## 7. Câu hỏi mở (nếu cần mở rộng sau)

- **`<title>` tab trình duyệt** có nên cũng đổi thành workspace name không? Nếu có, cần tách `getAppName()` thành hook `useAppName()` đọc từ `workspaceAtom`, cập nhật toàn bộ 20+ nơi dùng `getAppName()` (scope lớn hơn nhiều, cần confirm).
- **Workspace icon** (logo) có nên thay thế text tên không, hay hiển thị cả hai? (logo + tên)
