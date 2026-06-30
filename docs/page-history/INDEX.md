# Page History Extension — Documentation Index

| Doc | Đọc khi |
|-----|---------|
| [README.md](README.md) | Cần hiểu nhanh feature làm gì, vấn đề gốc, quyết định thiết kế |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Cần hiểu data flow, state model, vì sao thiết kế như vậy |
| [API_REQUIREMENTS.md](API_REQUIREMENTS.md) | Backend engineer — endpoint, DTO, quyền |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Cần biết chính xác file nào đã sửa, sửa gì |
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | Việc đã xong / còn lại / vấn đề đã gặp |
| [CHECKLIST.md](CHECKLIST.md) | QA thủ công trước khi merge |

## Tóm tắt 30 giây

Page History giờ hỗ trợ: hash tag kiểu Git cho mỗi revision, so sánh 2 bản bất kỳ, xem riêng một bản (không diff), mục "Current" đại diện bản đang sống trên editor, và restore an toàn (tự snapshot trước khi ghi đè, qua API server-side thay vì mutate editor trực tiếp như trước).

Code đã viết xong, type-check sạch (server + client), `detect_changes` báo risk **low**. Còn thiếu: kiểm thử thủ công trên UI thật (xem [CHECKLIST.md](CHECKLIST.md)).
