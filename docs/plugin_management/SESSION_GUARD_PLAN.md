# Implementation plan: Single-session IP guard plugin

Tài liệu tham chiếu: [SESSION_GUARD_SPEC.md](./SESSION_GUARD_SPEC.md)

## Phân rã công việc

### Phase 1 — Core hook (nhỏ, fork-safe)

| File | Thay đổi |
|---|---|
| `apps/server/src/core/plugins/plugin-hooks.ts` | Thêm `AFTER_SESSION_CREATED = 'auth:afterSessionCreated'` |
| `apps/server/src/core/session/session.service.ts` | Sau khi insert session + tạo token, gọi hook với `{ user, workspaceId, session, ipAddress, userAgent }`; bọc try/catch để lỗi plugin không chặn login |
| `apps/server/src/ws/ws.service.ts` | Thêm `emitToSession(sessionId, event, payload)` dùng `getSessionRoomName` |

Không sửa `auth.controller.ts`, không thêm migration.

### Phase 2 — EE backend plugin

Thư mục mới: `apps/server/src/ee/plugins/session-guard/`

| File | Nội dung |
|---|---|
| `plugin.config.json` | id `session-guard`, hook `auth:afterSessionCreated`, `configLocation: "security"` |
| `plugin-config.schema.json` | `graceSeconds` number 5–60, default 10 |
| `session-guard.module.ts` | `BullModule.registerQueue({ name: SESSION_GUARD_QUEUE })`, providers, controller, đăng ký hook trong `onModuleInit` |
| `session-guard.constants.ts` | Queue name, plugin id, Redis key prefixes, default grace |
| `session-guard.service.ts` | Logic phát hiện xung đột, tạo state, enqueue job, emit WS, allow/deny |
| `session-guard.store.ts` | Redis lock/state/session-status helpers (dùng `RedisService`) |
| `session-guard.processor.ts` | Worker xử lý job `expire` |
| `session-guard.controller.ts` | `GET /plugins/session-guard/status`, `POST .../conflicts/:id/allow|deny` |
| `hooks/after-session-created.handler.ts` | Adapter gọi service |
| `session-guard.service.spec.ts` | Unit test các nhánh chính |

Đăng ký module trong `apps/server/src/ee/ee.module.ts` (imports).
Không sửa `queue.module.ts` (dùng queue riêng của plugin).

### Phase 3 — Client

| File | Nội dung |
|---|---|
| `apps/client/src/ee/session-guard/services/session-guard-service.ts` | Gọi status/allow/deny |
| `apps/client/src/ee/session-guard/session-guard-overlay.tsx` | Lắng nghe socket + poll status, modal đếm ngược, redirect khi revoked |
| `apps/client/src/ee/security/components/session-guard-settings.tsx` | Switch + grace seconds + Save |
| `apps/client/src/ee/security/pages/security.tsx` | Mount settings block |
| `apps/client/src/ee/toast/app-notifications.tsx` | Mount overlay toàn cục |
| `apps/client/public/locales/en-US/translation.json` | Thêm key i18n |
| `apps/client/public/locales/vi-VN/translation.json` | Thêm key i18n |

### Phase 4 — Review, test, tối ưu

- Unit test backend cho: disabled, same IP, different IP, timeout, deny, allow,
  new session đã logout trước timeout, nhiều session cũ.
- Chạy build server + client.
- Review performance: đảm bảo không có query N+1, không block login quá lâu.
- Review security: route session-only, validate conflict ownership, GETDEL atomic.
- Review UX: đếm ngược chính xác theo `deadline` server, không hiện modal trùng.

## Thứ tự thực thi

1. Core hook + WsService method.
2. EE plugin backend + unit test.
3. Client settings + overlay + i18n.
4. Build/test/review/revise.

## Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| WS event máy 2 bị miss vì socket chưa nối | `GET /status` khi connect + poll 2s khi modal mở |
| Timeout và deny chạy đồng thời | `GETDEL` state; bên nào lấy được state thì xử lý |
| Login thứ ba làm rối state | Redis lock + supersede session "máy 2" cũ |
| Plugin lỗi làm hỏng login | Hook bọc try/catch, log warning, login vẫn thành công |
| Nhiều session cũ | Revoke toàn bộ oldSessionIds sau grace; notify từng session |
| IP sau proxy | Dùng `req.ip` đã resolve qua `overrideRequestIp` |
| Tắt plugin giữa chừng | In-flight conflict vẫn hoàn tất; login mới bỏ qua |
