# Tích hợp Docmost (sc_doc) ⇄ OpenProject — Phương án của hội đồng chuyên gia

Trạng thái: **đề xuất, chờ duyệt** · Ngày: 2026-10-24
Phạm vi: (1) *inline task* kiểu Confluence nhưng thực chất là **Work Package (WP) của OpenProject**; (2) **mention hai chiều** — trong OP nhắc tới trang Docmost, trong Docmost nhắc tới WP.

> Mọi file đã đọc để rút ra kết luận dưới đây được ghi ở mục 9. Những chỗ chưa kiểm chứng được gắn nhãn **[SPIKE]**.

---

## 1. Hiện trạng hai bên (bằng chứng từ code)

### Docmost fork — đã có sẵn khung tích hợp, không phải làm từ đầu
| Thứ cần | Đã có | Vị trí |
|---|---|---|
| Registry provider + OAuth per-user/workspace + refresh token | Có (Figma, GitHub, Linear) | `apps/server/src/core/integration/` |
| Unfurl link → card (title, status, avatar), có kiểm quyền (`UnfurlForbiddenError`) | Có | `integration/unfurl/`, `registry/integration-provider.interface.ts` |
| Node editor nhúng link tích hợp (`integrationMention`, attr `url`+`provider`) | Có | `packages/editor-ext/src/lib/integration-link/` |
| Host tự cấu hình (GitHub Enterprise qua `INTEGRATION_GITHUB_URL`, `getUnfurlHosts`) | Có — mẫu cho OP self-hosted | `providers/github/github.provider.ts` |
| Docmost làm **OAuth server** (consent, authorized apps) + API key + MCP | Có | `ee/oauth` (client), `ee/api-key`, `ee/mcp` |
| Task list thường (không liên kết gì) | `@tiptap/extension-list` `TaskList/TaskItem` | `features/editor/extensions/extensions.ts:242` |
| Mention user/page | `mention.ts` (`entityType: "user" \| "page"`) | `packages/editor-ext/src/lib/mention.ts` |

### OpenProject — đã có sẵn mẫu module "tích hợp ngoài"
| Thứ cần | Đã có | Vị trí |
|---|---|---|
| OAuth2 provider (Doorkeeper 5.9) | Có, scope `api_v3` | `config/initializers/doorkeeper.rb`, `app/controllers/oauth/` |
| REST API v3 cho WP (search/filters, form, create, update) | Có | `lib/api/v3/work_packages/` |
| Webhook outbound (WP, comment, project, attachment…) | Có, module riêng | `modules/webhooks/` |
| Mẫu module gắn **tab vào WP** + admin settings + permission + API path riêng | `github_integration` (PR ↔ WP, tab "GitHub") | `modules/github_integration/` |
| Soạn thảo: CKEditor (`op-ckeditor`), `#123` `@user`, text-formatting matchers | Có | `frontend/src/app/shared/components/editor/`, `lib/open_project/text_formatting/matchers/` |
| Documents dùng BlockNote + collab server | Có (không liên quan trực tiếp, nhưng cho thấy OP đã quen OAuth ↔ server ngoài) | `modules/documents/` |

**Kết luận hiện trạng:** cả hai bên đều có điểm cắm chuẩn. Không cần sửa core hai bên, chỉ cần *một provider mới* ở Docmost và *một module mới* ở OP.

---

## 2. Thành viên hội đồng & lập trường

| Chuyên gia | Quan điểm chính |
|---|---|
| **Integration Architect** | Dùng lại khung `IntegrationProvider`. Không dựng bus/ESB. Mỗi hệ thống giữ *source of truth* của object của mình; bên kia chỉ lưu **tham chiếu + cache**. |
| **Docmost/TipTap Expert** | Né sửa schema node nếu được: server collab (Hocuspocus) loại bỏ node lạ. Giai đoạn đầu tái dùng `integrationMention`; chỉ thêm node mới khi cần checkbox thật. |
| **OpenProject/Rails Expert** | Làm module `modules/docmost_integration` theo mẫu `github_integration`. Không đụng CKEditor build của OP ở giai đoạn đầu (build riêng, chi phí cao). |
| **Security & Identity** | Token **theo từng người dùng** (OAuth2 + PKCE), không dùng service account — để quyền hai bên được thực thi tự nhiên. Dùng chung IdP (OIDC/Entra) để khớp email. Webhook phải ký HMAC. |
| **Data Consistency** | Một chiều ghi: trạng thái task chỉ sống ở OP. Docmost không lưu state; cache có TTL + invalidate bằng webhook. Tránh dual-write. |
| **Product/UX (Confluence parity)** | Inline task = checkbox + assignee + due date + backlink về trang + trang "My Tasks". My Tasks **đã có sẵn trong OP** (My page) → không làm lại. |

---

## 3. Các quyết định then chốt (hội đồng đã chốt)

| # | Quyết định | Lý do | Phương án bị loại |
|---|---|---|---|
| D1 | **OP là source of truth của task**; node Docmost chỉ lưu `{instance, wpId}` | Không đồng bộ hai chiều trạng thái → không conflict | Lưu status trong ProseMirror doc (xung đột Yjs/OT, lệch dữ liệu) |
| D2 | **OAuth2 per-user** cả hai chiều | OP/Docmost tự kiểm quyền; unfurl đúng `UnfurlForbiddenError` | Service account/API key chung (lộ dữ liệu vượt quyền) |
| D3 | Docmost gọi OP qua **BFF phía server** (`ee/openproject`), client không giữ token | An toàn; tái dùng refresh-lock/OAuth service có sẵn | Client gọi thẳng OP (CORS, lộ token) |
| D4 | Chiều OP→Docmost: **module OP mới** + tab "Docmost" trên WP + API path riêng | Đúng mẫu `github_integration`; ít rủi ro merge upstream OP | Sửa CKEditor build của OP ngay (để Phase 4) |
| D5 | Mention trong OP ở giai đoạn đầu = **dán URL trang Docmost → render thẻ** + liên kết tường minh ở tab | Không cần đụng CKEditor; vẫn "mention được" | `@@page` autocomplete (cần fork build) |
| D6 | Cập nhật tức thời qua **webhook OP → Docmost** (HMAC), fallback TTL 60s | OP có sẵn module webhooks | Polling liên tục |
| D8 | **Entra ID là nguồn danh tính chung** (đã xác nhận: cả hai đang SSO cùng tenant/credential). Khớp người dùng theo **`oid` + `tid`**, email chỉ là dự phòng. Phase 1–3 vẫn dùng token OAuth do OP cấp (Doorkeeper) cho API; SSO Entra khiến bước đồng ý gần như một chạm | `oid` bất biến giữa các app trong tenant, email/UPN có thể đổi; token OP cấp thì không phụ thuộc OP có chấp nhận JWT Entra hay không | Dùng thẳng access token Entra gọi API OP (chưa chứng minh OP chấp nhận — xem Phase 0) |
| D7 | Code Docmost nằm trong `ee/`; core chỉ nhận **import + 1 dòng wiring** | Golden Rule của repo | Logic trong `core/` |

---

## 4. Kiến trúc tổng thể

```
┌────────────────────────── Docmost (sc_doc) ──────────────────────────┐
│ Editor: /work-package picker ─┐        integrationMention (provider  │
│ (client/ee/openproject)       │        = openproject) + wpTask*      │
│                               ▼                                      │
│ Server ee/openproject  ── OpenProjectProvider (IntegrationProvider)  │
│   • OAuth2 per-user (OP là AS)      • unfurl WP → card               │
│   • BFF: search / create / transition WP                             │
│   • POST /integrations/openproject/webhook  (HMAC) → invalidate+ws   │
└──────────────▲───────────────────────────────────┬───────────────────┘
               │ OAuth2 (Docmost ee/oauth)         │ OAuth2 (Doorkeeper) + API v3
               │ REST /api/pages/*                 ▼
┌──────────────┴──────────────── OpenProject ──────────────────────────┐
│ modules/docmost_integration (theo mẫu github_integration)            │
│   • Tab "Docmost" trên WP: trang liên kết, link/unlink, tìm trang    │
│   • Text-formatting matcher: URL Docmost → thẻ có tiêu đề            │
│   • API v3: /work_packages/:id/docmost_pages                         │
│   • Admin: URL Docmost, OAuth client, bật/tắt module theo project    │
│ modules/webhooks (có sẵn) → bắn work_package:updated sang Docmost    │
└──────────────────────────────────────────────────────────────────────┘
* wpTask chỉ ở Phase 3.
```

### 4.1 Chiều Docmost → OpenProject (inline task)

Ba nấc, mỗi nấc dùng được độc lập:

1. **Link/unfurl (Phase 1).** Dán URL WP (`/work_packages/123`, `/projects/x/work_packages/123`) → `integrationMention` render card: `#123 Subject · [Status] · Assignee · Due`. Tái dùng nguyên khung `unfurl`. Cần: `OpenProjectProvider` + `openproject-patterns.ts` + đăng ký host của OP (mẫu `getUnfurlHosts`).
2. **Picker/Create (Phase 2).** Slash `/work-package`:
   - Tìm: `GET /api/v3/work_packages?filters=[{"subjectOrId":{"operator":"**","values":["<q>"]}}]&pageSize=10`.
   - Tạo: `POST /api/v3/work_packages/form` (validate) → `POST /api/v3/work_packages` (subject, project, type, assignee, dueDate, kèm link ngược về trang Docmost trong description).
   - Chèn `integrationMention` với URL WP vừa chọn/tạo. Không đổi schema editor.
3. **Inline task thật (Phase 3).** Node `wpTask` (atom inline-block): ô tick + subject + assignee + due. 
   - Tick → `PATCH` WP sang status *closed* (lấy từ transition hợp lệ của `form`); bỏ tick → về status mặc định của type.
   - Hiển thị đọc từ cache unfurl (D1). Cập nhật tức thời nhờ webhook (D6) đẩy qua websocket đang có (`features/websocket`).
   - Nút "Chuyển task thường thành Work Package" trên bubble menu cho `taskItem` hiện có (không sửa `TaskItem`).
   - Cần thêm node vào extension list của **cả client lẫn server collab** — đây là điểm chạm core duy nhất, mỗi nơi 1 dòng import/đăng ký **[SPIKE: xác nhận file đăng ký phía server, dự kiến `collaboration/collaboration.util.ts`]**.

### 4.2 Chiều OpenProject → Docmost (mention trang)

1. **Tab "Docmost" trên WP (Phase 2).** Module OP: model `DocmostPageLink(work_package_id, docmost_page_id, slug_id, title_cache, linked_by)`; tab liệt kê trang; nút "Liên kết trang" (tìm qua Docmost API bằng token của chính người dùng); permission `:show_docmost_content`, `:link_docmost_pages`.
2. **URL → thẻ (Phase 2).** Một matcher trong `text_formatting/matchers` nhận URL trang Docmost (`/s/:space/p/:slug`) trong mô tả/bình luận, render `<a class="docmost-page-link">📄 Tiêu đề</a>`; tiêu đề lấy từ cache `title_cache`/gọi API có kiểm quyền; lỗi quyền → hiện URL thô.
3. **Backlink tự động (Phase 2).** Khi Docmost chèn mention WP, server Docmost gọi `POST /api/v3/work_packages/:id/docmost_pages` bằng token người dùng → tab OP và tab "Related pages" khớp ngay, không cần quét nội dung.
4. **`@@` autocomplete trong CKEditor (Phase 4, tùy chọn).** **[SPIKE]** Phụ thuộc OP cho mở rộng nguồn mention hay phải fork build `op-ckeditor`; chỉ làm nếu 1–3 chưa đủ.

### 4.3 Mention người dùng
Khớp user theo **email đã xác minh** (cơ chế `resolveIdentity` + `IdentityEmailMismatchError` đã có). Dùng để: hiển thị assignee bằng avatar Docmost, và gợi ý đúng người trong picker. Không đồng bộ thông báo ở giai đoạn đầu.

---

## 5. Bảo mật

- **OAuth2 Authorization Code + PKCE**, scope `api_v3`. Docmost đăng ký 1 *OAuth application* trong OP (`/oauth/applications`, redirect URI = callback Docmost); OP đăng ký 1 client trong Docmost `ee/oauth`. Credential lấy theo quy ước env hiện có (`oauth/credential-env.ts`), không lưu trong repo.
- **Tình huống thực tế đã xác nhận:** chung 1 client id + tenant id, chỉ khác callback URL; tài khoản về cơ bản là một người, nhưng *có người chỉ có tài khoản ở một bên*. Hệ quả:
  - Cùng client id ⇒ `sub` và `oid` của một người **giống hệt** ở hai bên, nên khóa danh tính chuẩn là `tid`+`oid` (không cần tin email).
  - **Phase 1–3 không phải sửa gì trên Entra**: token API do OP/Docmost tự cấp (Doorkeeper / `ee/oauth`), nên app registration Entra giữ nguyên, tránh luôn rủi ro đụng secret chung.
  - **Ma trận trạng thái tài khoản** (mọi trạng thái đều phải *suy giảm êm*, không lỗi, không tự tạo tài khoản):

| Người dùng | Docmost | OP | Hành vi |
|---|---|---|---|
| Có cả hai | ✔ | ✔ | Kết nối OAuth một lần; mọi tính năng chạy |
| Chỉ có Docmost | ✔ | ✘ | Card/picker hiện "Bạn chưa có tài khoản OpenProject" (trạng thái `UnfurlNeedsConnection`), không có nút tạo; link vẫn mở được. Nội dung WP không hiển thị cho người này |
| Chỉ có OP | ✘ | ✔ | Tab "Docmost" trên WP hiện "Bạn chưa có tài khoản Docmost" + link đăng nhập; tuân theo `allowSignup` của Docmost (không ép tự đăng ký). Backlink do người này tạo bị bỏ qua (best-effort) |
| Có nhưng bị vô hiệu ở một bên | — | — | Coi như không có tài khoản; không dùng token cũ (`TokenInvalidError`) |

  - **Chống nhầm tài khoản khi kết nối OAuth:** OAuth sẽ gắn với *bất kỳ ai đang đăng nhập OP trong trình duyệt* (vd. admin đang giữ phiên OP). Sau khi lấy token, Docmost gọi `GET /api/v3/users/me` rồi so với người dùng Docmost; lệch thì **từ chối và xóa token** (`IdentityEmailMismatchError`). So khớp ưu tiên: định danh Entra nếu OP API lộ ra (**[SPIKE]** `user_auth_provider_links`/`identity_url`), nếu không thì email/login không phân biệt hoa thường. Ngoại lệ alias email: bảng ánh xạ do admin quản (chỉ làm khi thực sự gặp).
  - Mọi tham chiếu chéo (WP/trang) mà người xem không có quyền hoặc không có tài khoản: hiện URL thô + nhãn "cần kết nối", không lộ tiêu đề.
- **Entra ID dùng chung credential (app registration):**
  - Đăng nhập SSO thì dùng chung được. Nhưng **đừng dùng lại chính app registration đó làm OAuth client của tích hợp**: gộp chung làm lộ rộng một secret duy nhất và dễ nhầm audience/redirect URI. Tích hợp dùng OAuth application riêng của OP (Doorkeeper) và client riêng của Docmost.
  - Nếu sau này muốn token Entra gọi API: dùng **app registration riêng** + luồng On-Behalf-Of. Lưu ý Entra không phải RFC 8693 như `ExchangeService` của OP giả định cho Keycloak (`modules/openid_connect/.../exchange_service.rb`, hỏi `token_exchange_capable?`) → phải có spike trước.
  - Khớp danh tính: Docmost đã có `SsoIdentityResolver` (tra `authAccount` theo `providerUserId`, rồi mới theo email, chặn tài khoản gắn provider khác). Khi dùng chung app registration thì `sub` hai bên trùng; vẫn nên so `oid` + `tid` để chống nhầm giữa tenant. `IdentityTenantMismatchError` có sẵn trong interface provider để dùng cho đúng việc này.
  - Quyền (scope) Graph `User.Read` của Docmost chỉ để lấy avatar; tích hợp không cần thêm scope Graph.
- **Không đưa token xuống trình duyệt**; token mã hóa trong `integration_connections` (cơ chế có sẵn).
- **Chống SSRF:** URL OP lấy từ cấu hình admin/env, không từ nội dung trang; pattern unfurl chỉ khớp host đã cấu hình (như comment ở `github.provider.ts`: token không bao giờ rời host cấu hình).
- **Webhook:** chỉ chấp nhận chữ ký HMAC hợp lệ, so sánh constant-time, secret riêng mỗi workspace; body giới hạn kích thước; chỉ *invalidate cache* chứ không tin payload để ghi dữ liệu.
- **Rò quyền:** `title_cache` ở OP chỉ hiển thị khi người xem có quyền xem WP đó (module permission), còn tiêu đề thật luôn gọi lại bằng token người xem khi có thể.
- **Single tenant:** 1 workspace Docmost ⇄ 1 instance OP (mẫu `IntegrationTenantInUseError`).

---

## 6. Lộ trình & tiêu chí nghiệm thu

| Phase | Nội dung | Nghiệm thu |
|---|---|---|
| **0 – Spike (1–2 ngày)** | Xác nhận: (a) Docmost `ee/oauth` có cho OP đăng ký client không hay chỉ MCP dynamic; (b) file đăng ký node phía server collab; (c) CKEditor mention extensible?; (d) header/thuật toán chữ ký webhook của OP; (e) OP có chấp nhận JWT Entra làm Bearer cho API v3 không (module `openid_connect` có `user_tokens`/`jwt_parser`, chưa thấy nơi xác thực API dùng) | Bản ghi kết quả + chốt lại D4/D5 nếu (c) thuận lợi |
| **1 – Unfurl WP** | `ee/openproject` provider, connect OAuth, card trong editor | Dán URL WP → card đúng status/assignee; người không có quyền không thấy dữ liệu |
| **2 – Picker + hai chiều mention** | `/work-package` search/create; module OP `docmost_integration` (tab, link, matcher); backlink tự động | Tạo WP từ Docmost, WP hiện trang liên kết bên OP và ngược lại |
| **3 – Inline task thật** | Node `wpTask`, tick ⇄ status, webhook live, convert từ taskItem | Tick trong Docmost → WP đóng; đổi status ở OP → trang Docmost cập nhật ≤ vài giây |
| **4 – Tuỳ chọn** | `@@` trong CKEditor, đồng bộ thông báo, tổng hợp task của một trang | Chỉ khi có nhu cầu thực |

Kiểm thử tối thiểu: unit cho regex pattern & mapping status (theo `*-patterns.spec.ts`, `linear.service.spec.ts`), một e2e đi đường vàng (connect → pick → tick → webhook).

---

## 7. Chiến lược fork (rất quan trọng)

- **Docmost:** toàn bộ nằm `apps/server/src/ee/openproject/` và `apps/client/src/ee/openproject/`. Điểm chạm core dự kiến, mỗi cái ≤ 1 import + 1 dòng: đăng ký module provider; mục slash-menu; (Phase 3) đăng ký node `wpTask` ở client + server collab. Cần xác định chỗ đăng ký `GithubModule` hiện tại để bám đúng mẫu **[SPIKE]**.
- **OpenProject:** repo cũng là fork (có remote `upstream`). Toàn bộ trong `modules/docmost_integration/` (OP vốn được thiết kế để mở rộng bằng `modules/`); chỉ chạm `Gemfile.modules` (1 dòng) và file locale.
- Không đổi schema DB core của hai bên; migration chỉ nằm trong module mới.

---

## 8. Rủi ro & giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Server collab loại bỏ node lạ → mất `wpTask` | Cao | Phase 1–2 chỉ dùng node có sẵn; Phase 3 đăng ký ở cả 2 nơi + test round-trip |
| OP đổi API/permission khi merge upstream | Trung bình | Module độc lập, chỉ dùng API v3 công khai + mẫu `github_integration` |
| Lệch quyền (xem được tiêu đề trang đã mất quyền) | Trung bình | Luôn gọi lại bằng token người xem; cache chỉ làm fallback hiển thị |
| Token hết hạn giữa chừng | Thấp | Dùng `refresh-lock` + `TokenExpiredError` đã có |
| Mapping status "xong" khác nhau giữa workflow OP | Trung bình | Dùng `status.isClosed` và transition hợp lệ từ `form`, báo lỗi rõ khi không có transition |

---

## 9. Nguồn đã đối chiếu

- Docmost: `core/integration/registry/integration-provider.interface.ts`, `providers/{linear,github}/*.provider.ts`, `integration.module.ts`, `integration-registry.ts`, `packages/editor-ext/src/lib/integration-link/*`, `mention.ts`, `features/editor/extensions/extensions.ts`, `common/features.ts`, `ee/` (oauth, api-key, mcp, plugins).
- OpenProject: `AGENTS.md`, `modules/` (webhooks, github_integration, documents, storages…), `config/initializers/doorkeeper.rb`, `lib/api/v3/work_packages/`, `lib/open_project/text_formatting/`, `frontend/src/app/shared/components/editor/`.

## 10. Câu hỏi cần bạn chốt
1. Một workspace Docmost ⇄ **một** instance OP có đúng không?
2. ~~Dùng chung IdP?~~ **Đã chốt: cùng Entra ID, 1 client id, 1 tenant, chỉ khác callback URL; tài khoản có thể chỉ tồn tại ở một bên** (xem D8 và ma trận ở mục 5). Còn lại: có cần ánh xạ alias email thủ công không, hay email giống nhau hết?
3. "Xong" = status closed nào của OP; bỏ tick quay về status nào?
4. Có chấp nhận Phase 4 (`@@` trong CKEditor) để sau, vì phải fork build editor của OP?
