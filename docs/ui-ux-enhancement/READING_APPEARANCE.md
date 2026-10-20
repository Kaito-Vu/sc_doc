# Reading Appearance — triển khai Phase C (lát cắt đầu tiên)

**Trạng thái:** Đã triển khai  
**Phạm vi:** người đọc và người viết tài liệu  
**Mục tiêu:** giảm mỏi mắt, tăng khả năng phân biệt ký tự, cho phép cá nhân hóa phông chữ và nền tài liệu  
**Ràng buộc:** EE-first, core chỉ nhận điểm nối cơ học

---

## 1. Vấn đề người dùng

Người dùng đọc/viết tài liệu dài trong thời gian dài gặp ba vấn đề:

1. **Mỏi mắt do nền và độ tương phản chưa phù hợp** — nền trắng tuyệt đối hoặc nền tối mặc định không phù hợp với mọi người, mọi thời điểm trong ngày.
2. **Khó phân biệt ký tự** — `I` (chữ i hoa) và `l` (chữ L thường) gần như giống nhau ở nhiều phông sans-serif; `O` và `0` cũng dễ nhầm.
3. **Một phông chữ cho mọi người** — người thích serif, người thích sans, người cần phông có độ rõ cao.

Tính năng này giải quyết cả ba bằng một lớp tùy chỉnh cục bộ cho vùng tài liệu, không thay đổi nội dung.

---

## 2. Những gì đã giao

- Chọn **phông chữ**: Inter, System sans-serif, Serif, Monospace.
- Chọn **cỡ chữ** 14–24px.
- Chọn **giãn dòng** 1.4–2.0.
- Chọn **giãn chữ** -0.01em đến 0.06em.
- Chọn **màu nền**: Theo giao diện, Giấy ấm, Sepia, Sage, Xám sương, Tương phản cao.
- Chọn **độ rộng đọc**: Vừa phải (820px), Chuẩn (1200px), Rộng (1440px).
- Bật/tắt **phân biệt I / l / 1** bằng OpenType features của Inter.
- **Xem trước trực tiếp** với chuỗi mẫu `Il1 O0 0123456789`.
- **Truy cập nhanh** từ hàng byline của trang (biểu tượng `Aa`) và từ **Cài đặt → Tùy chọn**.
- Lưu theo **trình duyệt** (localStorage), áp dụng ngay, không cần tải lại.

---

## 3. Quyết định thiết kế

### 3.1 Phông chữ và phân biệt I / l

| Lựa chọn | Font stack | Ghi chú |
|---|---|---|
| Inter (khuyến nghị) | `Inter Variable`, `Inter`, system-ui | Có đủ trục biến thiên; hỗ trợ `cv05`, `cv08` |
| System sans-serif | system-ui, Segoe UI, Roboto | Quen thuộc, không tải thêm |
| Serif | Georgia, Iowan Old Style, Palatino | Phù hợp đọc dài |
| Monospace | Cascadia Code, SFMono, Consolas | Phù hợp tài liệu kỹ thuật |

Khi bật **Phân biệt I / l / 1**, lớp CSS đặt:

```css
font-feature-settings: "cv05" 1, "cv08" 1, "zero" 1;
```

- `cv05`: chữ `l` có đuôi — phân biệt với `I`.
- `cv08`: chữ `I` có chân — phân biệt với `l`.
- `zero`: số `0` có gạch chéo — phân biệt với `O`.

Các feature này do Inter hỗ trợ; phông khác có thể bỏ qua. UI có ghi chú rõ.

### 3.2 Bảng màu nền và tương phản

| Chế độ | Light (nền / chữ) | Dark (nền / chữ) | Tương phản |
|---|---|---|---:|
| Theo giao diện | token Mantine | token Mantine | theo theme |
| Giấy ấm | `#fbf7ef` / `#2b2620` | `#1e1b17` / `#ede6da` | 14.03 / 13.83 |
| Sepia | `#f4e8d0` / `#3b2f1e` | `#2a2318` / `#f0e2c8` | 10.74 / 12.14 |
| Sage | `#edf4ec` / `#233326` | `#172018` / `#ddebdd` | 11.92 / 13.53 |
| Xám sương | `#f1f4f8` / `#222b36` | `#14181d` / `#dde6f0` | 12.98 / 14.13 |
| Tương phản cao | `#ffffff` / `#111111` | `#000000` / `#ffffff` | 18.88 / 21.00 |

Tất cả đều vượt WCAG AA 4.5:1; phần lớn vượt AAA.

### 3.3 Phạm vi áp dụng

Chỉ **vùng tài liệu**:

- `#main-content` (canvas đọc/viết)
- `.editor-container` và `.page-title` (vùng soạn thảo)
- `.ProseMirror` bên trong hai vùng trên

Không áp dụng cho sidebar, header, aside, menu, modal, comment editor — giữ nguyên ngôn ngữ thị giác của app.

Áp dụng cho cả trang nội bộ và trang chia sẻ/public (`/p/`, `/share/`, `/docs/`, `/base/`).

---

## 4. Kiến trúc và file

```text
apps/client/src/ee/ui/reading/
├── reading-preferences.ts          # kiểu dữ liệu, danh mục, atom lưu localStorage
├── use-reading-appearance.ts       # hook đọc/ghi + áp CSS variables
├── reading-appearance-runtime.tsx  # mount 1 lần ở App, nạp font Inter
├── reading-appearance.css          # biến + rule scoped vào vùng tài liệu
├── reading-appearance.module.css   # style cho form/swatch/preview
├── reading-appearance-form.tsx     # form tùy chỉnh dùng chung
├── reading-appearance-settings.tsx # section trong Cài đặt → Tùy chọn
├── reading-appearance-trigger.tsx  # nút Aa + Drawer
├── reading-preferences.test.ts     # unit test
└── index.ts
```

### 4.1 Luồng dữ liệu

```text
ReadingAppearanceForm
        │ update(partial)
        ▼
readingPreferencesAtom (localStorage)
        │
        ├──► ReadingAppearanceForm (preview trực tiếp)
        │
        └──► ReadingAppearanceRuntime (App)
                  │ set CSS variables trên <html>
                  │ set data-sc-reading-surface trên <body>
                  ▼
             reading-appearance.css
```

### 4.2 Điểm nối core (tối thiểu)

| File core | Thay đổi | Số dòng |
|---|---|---:|
| `apps/client/src/App.tsx` | import + `<ReadingAppearanceRuntime />` | 2 |
| `apps/client/src/features/editor/full-editor.tsx` | import + `<ReadingAppearanceTrigger />` | 2 |
| `apps/client/src/pages/settings/account/account-preferences.tsx` | import + section + divider | 3 |
| `apps/client/src/features/editor/styles/editor.module.css` | dùng `var(--sc-reading-width, ...)` | 1 |
| **Tổng** | | **8** |

Không sửa server, không migration, không thêm phụ thuộc (Inter đã có trong `apps/client/package.json`).

---

## 5. Hành vi và lưu trữ

- Khóa lưu: `sc.reading-appearance.v1`.
- Dữ liệu được chuẩn hóa khi đọc: giá trị lạ/rỗng quay về mặc định, số được kẹp trong khoảng an toàn.
- Thay đổi áp dụng ngay, không cần reload.
- Khi đổi theme sáng/tối của app, bảng màu đọc tự cập nhật theo cặp light/dark.
- Khi in, nền và letter-spacing được trung hòa để bản in sạch.
- Tùy chọn **Full page width** hiện có vẫn được ưu tiên: nếu bật, độ rộng đọc bị bỏ qua.

---

## 6. Accessibility

- Toàn bộ swatch là `button` thật với `aria-pressed`; nhãn có text, không chỉ màu.
- Slider/Select/Switch có `aria-label` hoặc label hiển thị.
- Drawer giữ focus trap mặc định của Mantine; đóng bằng Escape.
- Tương phản: xem bảng 3.2; không dùng màu làm tín hiệu duy nhất.
- Tôn trọng `prefers-reduced-motion` thông qua token chuyển động hiện có.
- Không thay đổi kích thước touch target của chrome; form dùng control chuẩn Mantine.

---

## 7. Kiểm thử

Đã chạy:

```bash
pnpm --filter ./apps/client exec tsc --noEmit
pnpm --filter ./apps/client exec vitest run src/ee/ui/reading/reading-preferences.test.ts
pnpm --filter ./apps/client exec stylelint "src/ee/ui/reading/*.css"
pnpm --filter ./apps/client run build
```

Kết quả: typecheck pass; 6 unit test pass; stylelint cho file mới pass; build pass.

Lint toàn app hiện không chạy được do lỗi môi trường có sẵn (`@tanstack/eslint-plugin-query` thiếu thư mục `build/`), không liên quan thay đổi này.

---

## 8. Hạn chế và bước tiếp theo

1. **Đồng bộ đa thiết bị:** hiện lưu theo trình duyệt. Khi làm Phase C server, thêm `ee_user_preferences` hoặc mở rộng `ee/docs` để sync.
2. **Atkinson Hyperlegible:** chưa đóng gói. Có thể thêm `@fontsource/atkinson-hyperlegible` khi duyệt thêm phụ thuộc; trong lúc chờ, Inter + `cv05/cv08/zero` đã giải quyết yêu cầu I/l.
3. **Reading mode:** ẩn bớt chrome (header/aside) để đọc tập trung; nên làm cùng Phase 1 shell.
4. **Default theo workspace/space:** admin có thể đặt bảng màu/cỡ chữ mặc định cho tổ chức.
5. **Đo lường:** thêm event `reading_appearance_changed` (font/theme/width) khi có telemetry.

---

## 9. Cách dùng

- Mở một trang bất kỳ → nhấn biểu tượng **Aa** ở hàng byline dưới tiêu đề.
- Hoặc vào **Settings → Preferences → Reading appearance**.
- Chọn phông, cỡ chữ, nền; xem preview; đóng drawer — thiết lập được giữ cho lần sau.
