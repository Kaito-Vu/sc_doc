# Detail Info Panel - API Requirements

## Overview

Detail Info Panel cần các endpoint API để:
1. Lấy thông tin chi tiết trang (stats, metadata)
2. Cập nhật cài đặt trang
3. Thực hiện các hành động trang (archive, delete, move, export)
4. Theo dõi lịch sử chỉnh sửa và người dùng

## API Endpoints

### 1. Get Page Stats

**Endpoint**: `GET /api/pages/:pageId/stats`

**Purpose**: Lấy thống kê trang bao gồm số lượt xem, chỉnh sửa, và thông tin người tạo/cập nhật

**Request**:
```
GET /api/pages/abc123/stats
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "pageId": "abc123",
  "viewCount": 42,
  "editCount": 15,
  "createdAt": "2026-06-09T09:18:00Z",
  "updatedAt": "2026-06-29T12:12:00Z",
  "creator": {
    "id": "user-1",
    "name": "admin",
    "email": "admin@example.com",
    "avatar": "https://api.example.com/avatars/user-1"
  },
  "lastUpdatedBy": {
    "id": "user-1",
    "name": "admin",
    "email": "admin@example.com",
    "avatar": "https://api.example.com/avatars/user-1"
  },
  "contributors": [
    {
      "id": "user-1",
      "name": "admin",
      "email": "admin@example.com",
      "role": "editor",
      "joinedAt": "2026-06-09T09:18:00Z"
    }
  ]
}
```

**Error Responses**:
- `401 Unauthorized` - User not authenticated
- `403 Forbidden` - User doesn't have access to page
- `404 Not Found` - Page doesn't exist

### 2. Get Page Settings

**Endpoint**: `GET /api/pages/:pageId/settings`

**Purpose**: Lấy cài đặt trang hiện tại

**Request**:
```
GET /api/pages/abc123/settings
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "pageId": "abc123",
  "isFullWidth": false,
  "isProtected": false,
  "isArchived": false,
  "allowComments": true,
  "allowVersionHistory": true,
  "publicLink": null
}
```

### 3. Update Page Settings

**Endpoint**: `PUT /api/pages/:pageId/settings`

**Purpose**: Cập nhật cài đặt trang (full-width, protection, v.v.)

**Request**:
```
PUT /api/pages/abc123/settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "isFullWidth": true,
  "isProtected": false,
  "allowComments": false
}
```

**Response** (200 OK):
```json
{
  "pageId": "abc123",
  "isFullWidth": true,
  "isProtected": false,
  "isArchived": false,
  "allowComments": false,
  "allowVersionHistory": true,
  "publicLink": null,
  "updatedAt": "2026-06-29T12:15:00Z"
}
```

**Validation Rules**:
- Chỉ cho phép cập nhật các field được khai báo
- Kiểm tra quyền trước khi cập nhật
- Log tất cả thay đổi vào audit trail

### 4. Move Page

**Endpoint**: `PATCH /api/pages/:pageId/move`

**Purpose**: Di chuyển trang sang không gian khác

**Request**:
```
PATCH /api/pages/abc123/move
Authorization: Bearer {token}
Content-Type: application/json

{
  "targetSpaceId": "space-456",
  "targetParentPageId": null
}
```

**Response** (200 OK):
```json
{
  "id": "abc123",
  "title": "Đăng ký người sử dụng",
  "spaceId": "space-456",
  "parentPageId": null,
  "slugId": "123abc",
  "movedAt": "2026-06-29T12:15:00Z"
}
```

**Validation Rules**:
- Kiểm tra quyền trên cả trang nguồn và đích
- Kiểm tra target space có tồn tại không
- Kiểm tra không tạo vòng lặp (parent không phải là con của page)

### 5. Archive Page

**Endpoint**: `PATCH /api/pages/:pageId/archive`

**Purpose**: Lưu trữ trang (ẩn khỏi view chính)

**Request**:
```
PATCH /api/pages/abc123/archive
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "id": "abc123",
  "title": "Đăng ký người sử dụng",
  "isArchived": true,
  "archivedAt": "2026-06-29T12:15:00Z",
  "archivedBy": "user-1"
}
```

### 6. Restore Page

**Endpoint**: `PATCH /api/pages/:pageId/restore`

**Purpose**: Khôi phục trang từ archive

**Request**:
```
PATCH /api/pages/abc123/restore
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "id": "abc123",
  "title": "Đăng ký người sử dụng",
  "isArchived": false,
  "restoredAt": "2026-06-29T12:15:00Z"
}
```

### 7. Delete Page (Move to Trash)

**Endpoint**: `PATCH /api/pages/:pageId/trash`

**Purpose**: Di chuyển trang vào trash (có thể khôi phục trong 30 ngày)

**Request**:
```
PATCH /api/pages/abc123/trash
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "id": "abc123",
  "title": "Đăng ký người sử dụng",
  "deletedAt": "2026-06-29T12:15:00Z",
  "deletedBy": "user-1",
  "canRestore": true,
  "restoreDeadline": "2026-07-29T12:15:00Z"
}
```

### 8. Export Page

**Endpoint**: `POST /api/pages/:pageId/export`

**Purpose**: Export trang theo định dạng khác nhau

**Request**:
```
POST /api/pages/abc123/export
Authorization: Bearer {token}
Content-Type: application/json

{
  "format": "pdf|html|markdown|docx"
}
```

**Response** (200 OK):
```json
{
  "downloadUrl": "https://api.example.com/downloads/export-abc123-xxx",
  "fileName": "Đăng ký người sử dụng.pdf",
  "expiresAt": "2026-06-30T12:15:00Z"
}
```

### 9. Get Page History

**Endpoint**: `GET /api/pages/:pageId/history`

**Purpose**: Lấy lịch sử chỉnh sửa trang

**Request**:
```
GET /api/pages/abc123/history?limit=20&offset=0
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "pageId": "abc123",
  "total": 42,
  "limit": 20,
  "offset": 0,
  "revisions": [
    {
      "id": "revision-1",
      "version": 42,
      "createdAt": "2026-06-29T12:12:00Z",
      "author": {
        "id": "user-1",
        "name": "admin",
        "email": "admin@example.com"
      },
      "changeType": "content_update",
      "summary": "Updated section 3"
    }
  ]
}
```

## Rate Limiting

Tất cả endpoints phải tuân theo rate limiting:

| Endpoint | Limit | Window |
|----------|-------|--------|
| GET /pages/:id/stats | 100 req | 1 min |
| GET /pages/:id/settings | 100 req | 1 min |
| PUT /pages/:id/settings | 30 req | 1 min |
| PATCH /pages/:id/* | 30 req | 1 min |
| POST /pages/:id/export | 10 req | 1 hour |

## Caching Strategy

### Server-Side Cache

| Resource | TTL | Key |
|----------|-----|-----|
| Page Stats | 30s | `page:stats:{pageId}` |
| Page Settings | 5m | `page:settings:{pageId}` |
| Page History | 1m | `page:history:{pageId}:{offset}` |

### Client-Side Cache

Sử dụng React Query với cấu hình:
- `staleTime`: 30s
- `cacheTime`: 5m
- `refetchInterval`: manual
- `refetchOnWindowFocus`: true

## Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "You don't have permission to perform this action",
    "statusCode": 403,
    "timestamp": "2026-06-29T12:15:00Z",
    "traceId": "trace-123-abc"
  }
}
```

### Common Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| UNAUTHORIZED | 401 | Authentication token missing/invalid |
| INSUFFICIENT_PERMISSIONS | 403 | User lacks required permissions |
| PAGE_NOT_FOUND | 404 | Page doesn't exist |
| SPACE_NOT_FOUND | 404 | Target space doesn't exist |
| INVALID_REQUEST | 400 | Invalid request payload |
| PAGE_ARCHIVED | 409 | Page is archived |
| PAGE_DELETED | 409 | Page is in trash |
| CIRCULAR_REFERENCE | 409 | Would create circular page hierarchy |
| CONCURRENT_MODIFICATION | 409 | Page was modified by another user |
| QUOTA_EXCEEDED | 429 | User has exceeded quota |

## Audit Trail

Tất cả hành động phải được ghi log:

```typescript
interface AuditLog {
  id: string;
  pageId: string;
  userId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ARCHIVE' | 'MOVE' | 'EXPORT';
  changes: Record<string, { old: any; new: any }>;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
}
```

## Real-time Updates

Sử dụng WebSocket hoặc Server-Sent Events (SSE) để:
- Thông báo khi trang được chỉnh sửa bởi user khác
- Cập nhật view count real-time
- Thông báo khi settings thay đổi
- Thông báo khi trang bị lưu trữ/xóa

### WebSocket Events

```typescript
// Client subscription
ws.subscribe(`page:${pageId}`, (event) => {
  // {
  //   type: 'stats_updated' | 'settings_changed' | 'page_archived' | 'page_restored',
  //   data: {...}
  // }
});
```

## Security Considerations

1. **Input Validation**: Tất cả input phải được validate trước xử lý
2. **Authorization**: Kiểm tra quyền cho mỗi operation
3. **Rate Limiting**: Chống abuse bằng rate limiting
4. **Audit**: Ghi log tất cả thay đổi
5. **Encryption**: Encrypt sensitive data in transit
6. **CSRF Protection**: CSRF token cho state-changing requests

## Backwards Compatibility

- Các endpoint phải maintain backwards compatibility
- Deprecation notice phải được gửi 3 tháng trước khi remove endpoint
- Version param có thể được thêm nếu cần: `/api/v2/pages/:id/stats`

## Documentation

Tất cả endpoints phải được document trong Swagger/OpenAPI schema:
- Tất cả parameters
- Tất cả response fields
- Tất cả error cases
- Rate limiting info
- Example requests/responses

## Testing

Cần có test coverage cho:
- Happy path cho tất cả endpoints
- Error cases
- Permission checks
- Rate limiting
- Concurrent modifications
- Edge cases (empty results, large data, v.v.)
