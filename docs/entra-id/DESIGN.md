# Thiết kế: SSO OIDC / Azure AD (Entra ID) cho EE — theo logic upstream Docmost

> Tài liệu này đối chiếu cách upstream (`/Users/vunguyen/workspaces/02.ETC/docmost`) triển khai đăng nhập SSO qua OIDC/Entra ID, và định nghĩa thiết kế tương ứng cho fork này, giữ nguyên vị trí code trong `ee/` theo Golden Rule của repo. Tham khảo thêm [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md) đã có trong thư mục này cho phần chi tiết đã triển khai trước đó; tài liệu này tập trung vào phần **đối chiếu & còn thiếu** so với upstream.

## 1. Kết luận từ phân tích upstream

Upstream **không có module Azure AD riêng**. Toàn bộ SSO OIDC (bao gồm Entra ID) nằm trong một cặp service dùng chung cho mọi IdP tuân thủ chuẩn OIDC:

- `apps/server/src/core/sso/services/sso.service.ts` — CRUD provider, mã hoá secret, validate issuer.
- `apps/server/src/core/sso/services/oidc.service.ts` — discovery, build authorization URL, exchange code, resolve claims.
- `apps/server/src/core/sso/sso.controller.ts` — route `/api/sso/...`.

"Azure AD" chỉ là một **cờ hành vi** (`provider.settings.oidc.provider === 'azuread'` hoặc phát hiện qua issuer host `login.microsoftonline.com`), bật thêm 3 hành vi:
1. Thêm scope `https://graph.microsoft.com/User.Read`.
2. Sau khi có access token, gọi Microsoft Graph `GET /me/photo/$value` để đồng bộ avatar.
3. Chuẩn hoá issuer dạng "federation metadata" của Azure về `https://login.microsoftonline.com/<tenant>/v2.0`.

→ **Thiết kế cho fork nên giữ đúng mô hình này**: một OIDC engine dùng chung, Azure/Entra chỉ là nhánh hành vi có điều kiện — không tách thành module/controller riêng. Đây cũng đúng với hướng đi hiện tại của repo (xem `apps/server/src/ee/sso-auth/`).

## 2. Đối chiếu hiện trạng EE (fork) với upstream

| Khía cạnh | Upstream (`core/sso`) | EE hiện tại (`ee/sso`, `ee/sso-auth`) | Đánh giá |
|---|---|---|---|
| Vị trí module | `core/sso` (module lõi, load tĩnh) | `ee/sso` (data/repo) + `ee/sso-auth` (OIDC/LDAP flow), load qua `ee.module.ts` | Đúng Golden Rule của fork — SSO nằm trong `ee/` thay vì core |
| Bảng dữ liệu | `auth_providers`, `auth_accounts`, cột `enforce_sso` trên `workspaces` | Tương đương ([auth-provider.repo.ts](../../apps/server/src/ee/sso/auth-provider.repo.ts), `auth-account.repo.ts`) | Khớp |
| Discovery | `openid-client` `discovery()` | `client.discovery()` trong [oidc-auth.service.ts:82](../../apps/server/src/ee/sso-auth/oidc-auth.service.ts) | Khớp |
| Chuẩn hoá issuer | Bỏ hậu tố `.well-known/...`, rewrite Azure federation metadata URL → issuer chuẩn, trích `tenantId` | Chỉ bỏ hậu tố `.well-known/...` ([normalizeIssuerUrl](../../apps/server/src/ee/sso-auth/oidc-auth.service.ts:59)) | **Thiếu**: chưa xử lý URL kiểu `federationmetadata/...` |
| PKCE + state + nonce | Có, đóng gói trong signed state (HMAC) qua cookie | Có, qua `encodeOidcState`/`decodeOidcState` (HMAC, [oidc-state.util.ts](../../apps/server/src/ee/sso-auth/oidc-state.util.ts)) | Khớp |
| Callback URL | Một path chung `/api/sso/oidc/callback` cho toàn workspace | Path theo từng provider `/api/sso/oidc/:providerId/callback` | Khác biệt có chủ đích, không phải thiếu sót — chấp nhận được vì cho phép nhiều provider OIDC/workspace |
| Claim → email | `email` → fallback `preferred_username` | Giống hệt ([oidc-auth.service.ts:201-203](../../apps/server/src/ee/sso-auth/oidc-auth.service.ts:201)) | Khớp |
| Claim → display name | `name` → `given_name+family_name` → từng phần | Chỉ `name` → fallback email | **Thiếu**: chưa ghép `given_name`/`family_name` |
| Scope mở rộng cho Azure | Thêm `https://graph.microsoft.com/User.Read` khi phát hiện Azure | Luôn cố định `openid profile email`, không có nhánh Azure | **Thiếu** |
| Avatar sync từ Graph | `GET /me/photo/$value` bằng access token, upload qua `attachmentService` | Chưa có (nhưng `AttachmentService.uploadUserAvatarFromBuffer` đã được export ở commit `c263790f` — hạ tầng đã sẵn sàng) | **Thiếu phần gọi Graph + wiring vào `resolveUser`** |
| Mã hoá client secret | AES-256-GCM, key = `sha256(APP_SECRET)`, prefix `enc:` | Cần xác nhận trong `sso.service.ts` (ee) | Kiểm tra lại, xem mục 4 |
| JIT provisioning | Link theo `auth_accounts(sub)` → fallback email → tạo mới nếu `allowSignup` | Giống hệt ([resolveUser](../../apps/server/src/ee/sso-auth/oidc-auth.service.ts:240)) | Khớp |
| Redirect sau login | Redirect cố định `/` | Hỗ trợ `?redirect=` với validate an toàn (`isSafeRedirectPath`) | **Tốt hơn upstream**, giữ nguyên |
| Group sync | Cột `group_sync`, nhưng logic đồng bộ nhóm thực tế nằm ở SCIM, không phải trong OIDC callback | Chưa xác nhận | Không cần làm trong phạm vi OIDC — để dành cho SCIM nếu áp dụng |

## 3. Thiết kế đề xuất bổ sung (giữ trong `ee/sso-auth`, không đụng core)

Tất cả thay đổi dưới đây chỉ sửa file trong `apps/server/src/ee/sso-auth/oidc-auth.service.ts` — không cần đổi controller hay core.

### 3.1 Phát hiện Azure/Entra provider

```ts
private isAzureProvider(provider: { oidcIssuer: string }): boolean {
  try {
    const host = new URL(provider.oidcIssuer).hostname.toLowerCase();
    return (
      host === 'login.microsoftonline.com' ||
      host === 'login.windows.net' ||
      host === 'sts.windows.net'
    );
  } catch {
    return false;
  }
}
```

### 3.2 Chuẩn hoá issuer cho URL "federation metadata" của Azure

Mở rộng `normalizeIssuerUrl` để nhận dạng dạng
`https://login.microsoftonline.com/<tenant>/federationmetadata/2007-06/federationmetadata.xml`
và viết lại thành `https://login.microsoftonline.com/<tenant>/v2.0` trước khi gọi `.well-known` — tránh admin dán nhầm URL lấy từ Azure Portal.

### 3.3 Scope mở rộng khi là Azure

Trong `buildAuthorizationUrl`, thay `scope: 'openid profile email'` cố định bằng:

```ts
const scope = this.isAzureProvider(provider)
  ? 'openid profile email https://graph.microsoft.com/User.Read'
  : 'openid profile email';
```

### 3.4 Đồng bộ avatar từ Microsoft Graph

Sau khi có `tokens` (trong `handleCallback`), nếu `isAzureProvider(provider)`:
1. Lấy `tokens.access_token`.
2. `GET https://graph.microsoft.com/v1.0/me/photo/$value` kèm `Authorization: Bearer <access_token>`.
3. Nếu 200 và `content-type` bắt đầu bằng `image/`, lấy buffer.
4. Nếu 404 → không có ảnh, bỏ qua (log debug, không throw).
5. Lỗi khác → log warning, bỏ qua — **không được chặn đăng nhập** vì đây là best-effort.
6. Trong `resolveUser`, nếu có buffer ảnh, gọi `AttachmentService.uploadUserAvatarFromBuffer` (đã có sẵn từ commit `c263790f`) để gán avatar cho user — chỉ khi user mới tạo hoặc chưa có avatar tuỳ chính sách.

Cần inject `AttachmentService` vào `OidcAuthService` và bọc lỗi bằng try/catch riêng, không cho lỗi Graph API làm fail toàn bộ transaction `resolveUser`.

### 3.5 Ghép display name đầy đủ

```ts
const name =
  (claims?.name as string | undefined) ??
  [claims?.given_name, claims?.family_name].filter(Boolean).join(' ') ||
  email;
```

## 4. Việc cần xác minh trước khi code (không giả định)

- Kiểm tra `apps/server/src/ee/sso/sso.service.ts` xem đã mã hoá `oidcClientSecret` bằng AES-256-GCM (key `sha256(APP_SECRET)`, prefix `enc:`) và có mask secret khi trả về client (`********`) chưa — nếu secret đang lưu plaintext, đây là ưu tiên bảo mật cao hơn cả phần avatar/scope ở trên.
- Xác nhận chữ ký của `AttachmentService.uploadUserAvatarFromBuffer` (tham số buffer, mimeType, userId) khớp với những gì Graph trả về.
- Chạy `impact`/kiểm tra call site của `OidcAuthService.handleCallback` trước khi sửa, vì đây là symbol đã có test (`oidc-auth.service.spec.ts`) — cập nhật test cùng lúc khi thêm nhánh Azure.

## 5. Sơ đồ luồng (áp dụng cho cả OIDC chung và Entra ID)

```
Browser                 SsoAuthController            OidcAuthService              Entra ID / Graph
   |  click "Login SSO"        |                            |                            |
   |--- GET /sso/oidc/:id/login|                            |                            |
   |                           |--- buildAuthorizationUrl -->|                            |
   |                           |                            |-- discovery (.well-known) ->|
   |                           |<-- url + signed state ------|                            |
   |<-- 302 + Set-Cookie oidc_state (httpOnly, 10min) -------|                            |
   |-------------------------- 302 to Entra authorize endpoint -------------------------->|
   |                           |                            |         (user login)        |
   |<------------------------- 302 back to /sso/oidc/:id/callback?code&state -------------|
   |--- GET callback (cookie oidc_state) ------------------->|                            |
   |                           |--- handleCallback --------->|                            |
   |                           |                            |-- verify signed state ----->|
   |                           |                            |-- authorizationCodeGrant -->|
   |                           |                            |<- id_token + access_token --|
   |                           |                            |-- [Azure] GET /me/photo --->|
   |                           |                            |<- avatar bytes (best-effort)-|
   |                           |                            |-- resolveUser (JIT/tx) ------|
   |                           |<-- authToken + redirect ----|                            |
   |<-- 302 + Set-Cookie authToken; clear oidc_state --------|                            |
```

## 6. Phạm vi không đổi (theo Golden Rule)

- Không sửa `apps/server/src/core/**`.
- Không tạo controller/module Azure riêng — mọi hành vi Azure là nhánh `if` có điều kiện bên trong `OidcAuthService` hiện có.
- Phía client (`apps/client/src/ee/security/`) không cần thay đổi cấu trúc — chỉ cập nhật copy/placeholder nếu muốn làm rõ đây là cấu hình cho Entra ID (đã Azure-flavored theo đúng cách upstream làm ở `sso-oidc-form.tsx`).
