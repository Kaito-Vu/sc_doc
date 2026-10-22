# Spec: Single-session IP guard plugin (EE)

**Plugin ID:** `session-guard`
**Khu vực bật/tắt:** Workspace Settings → Security
**Trạng thái:** Draft for implementation
**Phạm vi:** Enterprise Edition fork (`apps/server/src/ee`, `apps/client/src/ee`)

---

## 1. Mục tiêu

Khi plugin được bật trong **Security**, mỗi user chỉ được duy trì phiên đăng nhập
tại **một IP** tại một thời điểm.

Khi user đăng nhập thành công từ IP khác:

1. Cả phiên cũ (máy 1) và phiên mới (máy 2) đều nhận thông báo realtime.
2. Máy 1 có 10 giây (cấu hình được) để phản hồi:
   - **Cho phép:** máy 1 bị đăng xuất ngay, máy 2 tiếp tục.
   - **Từ chối:** máy 2 bị đăng xuất, máy 1 tiếp tục.
3. Nếu máy 1 không phản hồi trong 10 giây: mặc định **máy 1 bị đăng xuất**,
   máy 2 tiếp tục (new login wins).

## 2. Định nghĩa

| Thuật ngữ | Ý nghĩa |
|---|---|
| Session | Một dòng `user_sessions` đang active (`revoked_at IS NULL`, `expires_at > now()`), gắn với `authToken` |
| IP | IP client đã resolve bởi `overrideRequestIp` (trust proxy + Cloudflare) và lưu ở `user_sessions.ip_address` |
| Máy 1 | Session cũ hơn / đang active trước khi có login mới |
| Máy 2 | Session vừa được tạo bởi login mới |
| Xung đột | Session mới có IP khác với ít nhất một session cũ đang active |

## 3. Quy tắc nghiệp vụ

### 3.1 Khi nào coi là xung đột

- Plugin `session-guard` phải `enabled = true` cho workspace.
- Có ít nhất một session active khác của cùng user/workspace.
- `normalizeIp(newIp) !== normalizeIp(oldIp)` với ít nhất một session cũ.
- Nếu IP bị thiếu (`null`/không parse được) ở một trong hai bên, coi là xung đột
  (fail-closed, tránh bypass bằng cách giả lập IP rỗng).
- Nếu tất cả session cũ có cùng IP với session mới: **không xung đột**.
  Đây là hệ quả của yêu cầu "1 IP", không phải "1 thiết bị".

### 3.2 Trường hợp nhiều session cũ

- Tất cả session cũ khác IP đều bị đưa vào `oldSessionIds`.
- Session cũ có `lastActiveAt` mới nhất là `primarySessionId` (máy 1 chính).
- Tất cả session cũ nhận thông báo; chỉ `primarySessionId` được bấm
  Cho phép / Từ chối.
- Hết 10 giây: revoke **toàn bộ** `oldSessionIds`, đảm bảo đúng nghĩa 1 IP.

### 3.3 Login đồng thời

- Dùng Redis lock ngắn hạn theo `(workspaceId, userId)` để tuần tự hoá.
- Nếu đã có xung đột đang chờ và có login thứ ba:
  - Session "máy 2" cũ bị revoke với lý do `superseded`.
  - Login mới nhất trở thành "máy 2" mới.
- Không để hai job hẹn giờ cùng tồn tại cho một user.

### 3.4 Các trường hợp huỷ ngang

- Máy 2 tự logout/revoke trước khi hết hạn: job hết hạn kiểm tra lại session mới;
  nếu không còn active thì huỷ xung đột, không logout máy 1.
- Máy 1 đã logout trước khi hết hạn: bỏ qua revoke, đánh dấu `resolved`
  (reason `new_session_gone`).
- Plugin bị tắt giữa chừng: các xung đột đang chờ vẫn hoàn tất (grace ngắn),
  các login mới không bị kiểm tra nữa.

## 4. Luồng xử lý

```text
POST /auth/login (hoặc MFA/SSO/invite/password-reset auto-login)
  -> SessionService.createSessionAndToken()
       -> insert user_sessions
       -> runHook('auth:afterSessionCreated', { user, workspaceId, session, ipAddress, userAgent })
            -> SessionGuardService.onSessionCreated()
                 -> đọc plugin config (1 query index)
                 -> query session active khác (1 query index)
                 -> nếu không xung đột: return
                 -> Redis lock + conflict state (TTL)
                 -> BullMQ delayed job (grace seconds)
                 -> WS emit tới các session room
  -> trả authToken cho client
```

```text
10s hết hạn (BullMQ worker)
  -> GETDEL conflict state
  -> nếu state không còn: no-op
  -> nếu máy 2 không còn active: cancel, thông báo máy 1
  -> revoke oldSessionIds
  -> emit 'security:session-revoked' tới máy 1
  -> emit 'security:session-conflict-resolved' (kept) tới máy 2
  -> disconnect socket máy 1 sau ~1s
```

```text
Máy 1 bấm Từ chối
  -> POST /plugins/session-guard/conflicts/:id/deny
  -> validate session hiện tại nằm trong oldSessionIds
  -> GETDEL conflict state (atomic; timeout và deny chỉ một bên thắng)
  -> remove delayed job
  -> revoke máy 2
  -> emit revoked tới máy 2, resolved (denied) tới máy 1
```

```text
Máy 1 bấm Cho phép
  -> POST /plugins/session-guard/conflicts/:id/allow
  -> validate + GETDEL như trên
  -> remove delayed job
  -> revoke oldSessionIds
  -> emit revoked tới máy 1, resolved (allowed) tới máy 2
```

## 5. Hợp đồng API

Tất cả route dưới `/api/plugins/session-guard`, yêu cầu JWT + session thật
(`@RequireSessionAuth`, không cho API key/OAuth).

### `GET /status`

Trả về trạng thái xung đột gần nhất của **session hiện tại** (dùng để bù event
WS bị miss khi socket máy 2 chưa kịp kết nối).

```json
{
  "status": "pending" | "revoked" | "kept" | "resolved" | "none",
  "conflictId": "uuid",
  "role": "existing" | "new",
  "deadline": 1730000000000,
  "reason": "denied_by_existing" | "new_login_timeout" | "allowed_by_existing" | "superseded",
  "canRespond": true,
  "peerIp": "203.0.113.10",
  "peerDevice": "Chrome on Windows"
}
```

### `POST /conflicts/:conflictId/deny`

- Chỉ `primarySessionId` (máy 1 chính) được phép phản hồi; các session cũ khác
  chỉ nhận thông báo.
- Trả `{ "ok": true, "outcome": "denied" }`.
- Lỗi `400` nếu conflict hết hạn/đã xử lý; `403` nếu không đúng session.

### `POST /conflicts/:conflictId/allow`

- Như trên, kết quả `{ "ok": true, "outcome": "allowed" }`.

## 6. Hợp đồng WebSocket

Dùng room sẵn có `session-{sessionId}` (`getSessionRoomName`).

| Event | Gửi tới | Payload |
|---|---|---|
| `security:session-conflict` | Máy 1 + máy 2 | `{ conflictId, role, deadline, peerIp, peerDevice, canRespond }` |
| `security:session-revoked` | Session bị revoke | `{ conflictId, reason }` |
| `security:session-conflict-resolved` | Session còn lại | `{ conflictId, outcome, reason }` |

Client **không** được chỉ dựa vào event:
- Gọi `GET /status` khi socket connect/reconnect.
- Poll `GET /status` mỗi 2 giây trong khi modal xung đột còn mở (tối đa
  `deadline + 30s` để chịu được job bị trễ).

## 7. UI

### 7.1 Security settings

- Block mới trong `apps/client/src/ee/security/pages/security.tsx`.
- Switch bật/tắt plugin (`enabled`).
- NumberInput "Grace period (seconds)" 5–60, mặc định 10.
- Nút Save gọi `PUT /plugins/session-guard/config`.
- Chỉ hiển thị cho admin (Security page đã guard admin).

### 7.2 Overlay toàn cục

- Mount trong `AppNotifications` (EE, đã mount toàn app).
- Máy 1: modal "New login detected", hiển thị IP/thiết bị mới, đếm ngược,
  nút **Cho phép** và **Từ chối**.
- Máy 2: modal thông báo "Đang chờ xác nhận từ thiết bị cũ", đếm ngược,
  không có nút (hoặc chỉ nút đóng không tác dụng).
- Khi nhận `revoked`: thông báo ngắn rồi `window.location.replace('/login?...')`.
- Khi nhận `resolved`: đóng modal và thông báo kết quả.
- i18n: thêm key vào `apps/client/public/locales/en-US/translation.json` và
  `vi-VN/translation.json`.

## 8. Hiệu năng

- Login path chỉ thêm:
  - 1 query đọc `plugin_configurations` (unique index `workspace_id, plugin_id`).
  - 1 query đọc session active khác (index `idx_user_sessions_active`).
  - Redis `SET NX` + `SET` state + 1 BullMQ `add` (chỉ khi có xung đột).
- Không thêm migration, không thêm cột, không quét bảng.
- Query session giới hạn `LIMIT 20`.
- Nếu plugin tắt: chỉ 1 query config rồi return.
- Có thể cache `enabled` 10–30s nếu profiling cho thấy cần; mặc định không cache
  để tắt/bật có hiệu lực ngay.
- Job hết hạn chỉ chạy khi có xung đột thật.

## 9. Bảo mật

- IP lấy từ `req.ip` đã qua `overrideRequestIp` (trust proxy, Cloudflare).
- Không tin IP do client gửi trong body/header tùy ý.
- Route allow/deny yêu cầu session thật; không cho API key/OAuth.
- `GETDEL` đảm bảo timeout và deny/allow không cùng thắng.
- Không log IP đầy đủ ở mức info nếu workspace cấu hình audit nhạy cảm;
  audit metadata chỉ ghi `ipHash` hoặc IP rút gọn nếu cần.
- Không đưa `conflictId` hay session id vào URL public; route đã auth.
- Nếu Redis/BullMQ lỗi, plugin **fail-open**: login vẫn thành công, log warning,
  enforcement tạm thời không áp dụng. Đây là lựa chọn đánh đổi availability;
  muốn fail-closed thì cần cấu hình riêng.

## 10. Giả định & ngoài phạm vi

- Áp dụng cho mọi cách tạo session: local login, MFA, SSO/LDAP, invite signup,
  password-reset auto-login (vì hook nằm ở `SessionService`).
- Không áp dụng cho API key/OAuth access token (không tạo `user_sessions`).
- Không chặn login mới; chỉ logout một trong hai sau khi đã thông báo.
- Không xử lý "cùng IP nhưng khác thiết bị" (theo đúng yêu cầu 1 IP).
- Không thay đổi bảng `user_sessions`; trạng thái xung đột nằm ở Redis.
- Bật plugin **không** mass-revoke các session đang tồn tại; enforcement bắt đầu
  từ login kế tiếp. Admin có thể revoke session thủ công nếu muốn dọn ngay.

## 11. Tiêu chí nghiệm thu

1. Bật plugin trong Security → login máy 2 từ IP khác:
   - Cả hai máy hiện thông báo trong ≤ 2s.
   - Sau 10s máy 1 bị đưa về trang login; máy 2 vẫn dùng được.
2. Máy 1 bấm Từ chối trong 10s → máy 2 bị đưa về login, máy 1 tiếp tục.
3. Máy 1 bấm Cho phép → máy 1 bị logout ngay, máy 2 tiếp tục.
4. Login từ cùng IP → không có thông báo, không logout.
5. Tắt plugin → hành vi cũ, không có query session thừa.
6. Refresh máy 2 sau khi vừa login (socket chưa kịp nối) vẫn thấy đúng trạng thái
   nhờ `GET /status`.
7. Không làm chậm login đáng kể (< 20ms median khi plugin bật, không xung đột).

## 12. Ngoại lệ (admin/owner cấu hình)

Lưu trong `plugin_configurations.config` (chỉ admin/owner ghi được qua `PUT /plugins/session-guard/config`):

| Trường | Ý nghĩa | Giới hạn |
|---|---|---|
| `exemptUserIds` | User không bị guard | ≤ 200 |
| `exemptGroupIds` | User thuộc nhóm này không bị guard | ≤ 50 |
| `exemptRoles` | `owner` / `admin` / `member` | ≤ 3 |
| `trustedIps` | IP hoặc CIDR tin cậy | ≤ 100, validate khi lưu |

- Đánh giá trong `handleSessionCreated` ngay sau khi kiểm tra `enabled`, trước khi truy vấn session/lock.
- Session cũ có IP thuộc `trustedIps` không được tính là xung đột. Entry sai định dạng bị bỏ qua (không bao giờ thành "miễn tất cả").
- `expireConflict` kiểm tra lại user/IP/nhóm khi hết hạn; nếu vừa được thêm ngoại lệ thì huỷ xung đột. Riêng `exemptRoles` chỉ áp dụng ở lúc đăng nhập.
- `trustedIps` chỉ an toàn khi trust-proxy được cấu hình đúng (IP lấy từ `req.ip`).
- Sửa lock: chờ tối đa ~2s; supersede bỏ qua nếu allow/deny đã consume conflict.

## 13. Hết giờ: máy 1 online hay offline

Khi hết grace period mà máy 1 không phản hồi:

- Máy 1 **online** (client còn gọi `GET /status`, heartbeat Redis TTL 15s; client poll mỗi 2s khi modal mở) → **máy 2 bị logout** (`existing_online`), máy 1 tiếp tục.
- Máy 1 **idle/offline** (không có heartbeat) → máy 1 bị logout, máy 2 tiếp tục.
- Ghi đè mục 1.3: không còn "new login wins" vô điều kiện. Chống kẻ biết mật khẩu đẩy chủ tài khoản ra ngoài khi họ đang mở máy.

## 14. Audit log

- `session.conflict` — phát hiện đăng nhập từ IP thứ hai. Metadata: `newIp`, `newDevice`, `oldIps`, `primaryIp`, `primaryDevice`, `oldSessionIds`, `newSessionId`, `graceSeconds`, `conflictId`.
- `session.conflict_resolved` — kết quả, cùng metadata trên cộng `outcome` và `decidedBy`:
  - `allowed` / `denied`: user ở máy 1 chọn (`decidedBy: user`).
  - `timeout_old_revoked`: hết giờ, máy 1 offline nên bị logout.
  - `timeout_new_revoked`: hết giờ, máy 1 còn online nên máy 2 bị logout (`reason: existing_online`).
  - `superseded`: có đăng nhập mới hơn thay thế.
  - `cancelled`: máy 2 đã mất hoặc vừa được thêm ngoại lệ.
