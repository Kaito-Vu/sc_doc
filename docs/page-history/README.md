# Page History — Git-like Tags, Compare, Restore

## Overview

Mở rộng tính năng Page History (đã có sẵn snapshot + diff cơ bản) thành một trải nghiệm giống Git:

- **Hash tag** tự sinh cho mỗi revision, hiển thị giống Git short-SHA (8 ký tự, SHA-256 của content).
- **So sánh 2 phiên bản bất kỳ** (không còn giới hạn chỉ so với bản liền trước).
- **View this revision** — xem nội dung một bản cũ ở chế độ đọc, không hiển thị diff.
- **Current marker** — mục "Current version" ảo ở đầu danh sách, đại diện nội dung đang sống trên editor (không phải 1 row trong DB).
- **Restore an toàn** — phục hồi về bản cũ qua API server-side, tự động snapshot bản hiện tại trước khi ghi đè để không mất dữ liệu.

## Trạng thái

✅ Đã implement (server + client), type-check sạch, `detect_changes` báo risk **low**.
⏳ Chưa test thủ công trên UI thật (cần chạy app + thao tác tay).

## Tài liệu liên quan

| File | Nội dung |
|------|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Kiến trúc tổng thể, data flow, state model |
| [API_REQUIREMENTS.md](API_REQUIREMENTS.md) | Endpoint, DTO, quyền truy cập |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Chi tiết từng file đã sửa/thêm, kèm code |
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | Việc đã xong / còn lại |
| [CHECKLIST.md](CHECKLIST.md) | Checklist kiểm thử thủ công trước khi merge |

## Vấn đề gốc (trước khi sửa)

1. `page_history` không có cột định danh ngắn — chỉ có UUID dài.
2. `history-list.tsx` hardcode diff so với `historyItems[index + 1]` — không so được 2 bản bất kỳ.
3. Không có hành động "View" tách biệt khỏi "Compare"/"Restore".
4. Live editor content không xuất hiện trong danh sách lịch sử.
5. **Restore không an toàn**: `useHistoryRestore` chỉ `setContent()` thẳng vào editor TipTap, không gọi API nào. Nếu bản hiện tại chưa kịp được auto-save vào `page_history` (qua queue debounce), nó sẽ **mất vĩnh viễn** khi revert.

## Quyết định thiết kế (đã chốt với người dùng)

- Hash tag là **SHA-256(content) cắt 8 ký tự**, tự sinh khi insert, không ai sửa được, không cần permission riêng.
- Restore **bắt buộc** tự động tạo snapshot của bản hiện tại trước khi ghi đè.
- Quyền restore: giữ nguyên permission hiện có (`SpaceCaslAction.Edit` trên `Page`, theo đúng pattern đang dùng trong `page.controller.ts`).
- Phạm vi triển khai: làm full một lần (tag + compare + view + current marker + restore an toàn), không chia nhỏ phase.
