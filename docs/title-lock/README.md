# Title Lock — Click Icon Edit để Edit Tên Page

📁 **Thư mục tài liệu**: `docs/title-lock/`

---

## 📖 Hướng Dẫn Sử Dụng Tài Liệu

### 1️⃣ Bắt Đầu Nhanh
👉 **Đọc trước**: [SUMMARY.md](./SUMMARY.md) (5 phút)
- Quick overview + facts table
- Mục tiêu & flow
- FAQ

### 2️⃣ Hiểu Yêu Cầu
👉 **Đọc tiếp**: [REQUIREMENTS.md](./REQUIREMENTS.md) (10 phút)
- Chi tiết yêu cầu (vấn đề hiện tại, mong muốn)
- Acceptance criteria
- Edge cases

### 3️⃣ Học Kế Hoạch
👉 **Đọc tiếp**: [PLAN.md](./PLAN.md) (15 phút)
- Kiến trúc quyết định (Core vs EE)
- Thiết kế giải pháp chi tiết
- Implementation checklist

### 4️⃣ Implement
👉 **Thực hiện**: [IMPLEMENTATION.md](./IMPLEMENTATION.md) (follow step-by-step)
- Code diffs chính xác
- Vị trí cần sửa
- Verification checklist
- Troubleshooting

---

## 📋 Danh Sách Tài Liệu

| File | Tối thiểu | Đọc nếu |
|---|---|---|
| **SUMMARY.md** | ✅ Bắt buộc | Lần đầu tiên, quick reference |
| **REQUIREMENTS.md** | ✅ Bắt buộc | Hiểu rõ yêu cầu, acceptance criteria |
| **PLAN.md** | ⚠️ Khuyên | Muốn hiểu kiến trúc quyết định |
| **IMPLEMENTATION.md** | ✅ Bắt buộc | Khi implement (follow step-by-step) |

---

## 🎯 Feature Overview

### Vấn đề
- User có thể edit title trực tiếp (misclick risk)
- Tên page quan trọng nhưng dễ thay đổi nhầm

### Giải pháp
- Title mặc định hiển thị text (read-only) + icon edit nhỏ
- User phải click icon edit để bật chế độ edit
- Auto-save 500ms, sau đó tự close edit mode

### Ví dụ
```
🔒 BEFORE (Current):
  Page Title Here    ← click vào là edit ngay

🔓 AFTER (Target):
  Page Title Here    [✎]   ← click icon mới edit
                      ↑
                    icon edit
```

---

## 📊 Project Stats

| Metric | Giá trị |
|---|---|
| **Complexity** | ⭐ Simple |
| **Time estimate** | ~1.5 giờ |
| **Files thay đổi** | 1 |
| **Lines added** | ~40 |
| **Dependencies mới** | 0 (dùng Mantine + Tabler sẵn) |
| **DB migration** | ❌ Không cần |
| **API changes** | ❌ Không cần |

---

## ✅ Checklist Trước Implement

- [ ] Đã đọc SUMMARY.md
- [ ] Đã đọc REQUIREMENTS.md & hiểu acceptance criteria
- [ ] Đã đọc PLAN.md & hiểu kiến trúc
- [ ] Có VS Code / IDE sẵn sàng
- [ ] Dev server có thể chạy (`npm run dev` hoặc tương đương)

---

## 🚀 Implement Flow

```
1. Open IMPLEMENTATION.md side-by-side
2. Follow step 1-5 (code changes)
3. Run dev server
4. Test flows (step 6)
5. Commit changes
6. Done!
```

---

## 🤔 Kiến Trúc Quyết Định

### Tại Sao Core (Không EE Plugin)?

Theo [FORK_SAFE_PLUGIN_ARCHITECTURE.md](../../FORK_SAFE_PLUGIN_ARCHITECTURE.md), feature này là **core enhancement** vì:

✅ **Không có**:
- Hook system cần thiết
- Conditional features
- Admin toggles
- Complexity isolation needs

✅ **Lợi ích**:
- Simple UI change
- Không ảnh hưởng plugin system
- Không cần EE module

❌ **Nếu dùng EE plugin**:
- Phức tạp hơn (hook + registry + module)
- Không cần thiết cho tính năng này
- Overhead không đáng

**Kết luận**: Sửa core file `title-editor.tsx` là **chấp nhận được** cho feature này.

---

## 📞 Support

Nếu có câu hỏi:
1. Kiểm tra FAQ trong SUMMARY.md
2. Kiểm tra Troubleshooting trong IMPLEMENTATION.md
3. Xem PLAN.md / REQUIREMENTS.md để context

---

## 📝 Document Version

- **Version**: 1.0
- **Last Updated**: 2026-06-30
- **Status**: ✅ Complete (ready for implementation)

---

## 🔗 Related Docs

- [Favicon + Sidebar Plan](../menu-fav/) — Similar feature documentation
- [Fork-Safe Architecture](../../FORK_SAFE_PLUGIN_ARCHITECTURE.md) — Core architectural guidelines
- [Implementation Summary](../menu-fav/IMPLEMENTATION_SUMMARY.md) — Reference for doc structure
