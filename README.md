# sc_doc — Docmost (unlock-ee fork)

Fork tự host của [Docmost](https://docmost.com) — nền tảng wiki và tài liệu cộng tác realtime. Branch `unlock-ee` mở khóa Enterprise Edition (EE) cho môi trường self-hosted và bổ sung hệ thống plugin fork-safe.

Dự án gốc: AGPL-3.0. Mã EE nằm trong `apps/server/src/ee` và `apps/client/src/ee` (track trực tiếp trong repo, không dùng git submodule).

---

## Tính năng

### Nền tảng Docmost (OSS)

- Cộng tác realtime trên trang
- Spaces, nhóm, phân quyền
- Editor rich-text (TipTap), diagram (Draw.io, Excalidraw, Mermaid)
- Tìm kiếm, lịch sử trang, bình luận, đính kèm
- Đa ngôn ngữ (i18n)

### Enterprise Edition (unlock-ee)

Backend EE triển khai trong `apps/server/src/ee/` với licence unlock (`UNLOCK_EE=true`). Các module chính:

| Nhóm | Module |
|------|--------|
| Bảo mật | MFA, API Keys, Audit, SSO (cấu hình), LDAP login, SCIM |
| Nội dung | Page permissions, Templates, Page verification, Comment resolve |
| Import / Export | DOCX/PDF import, Confluence import, DOCX/PDF export |
| Khác | Personal spaces, Bases, AI (stub), Billing (stub), MCP (stub) |

Một số luồng SSO đầy đủ (OIDC/SAML/Google callback) và tích hợp AI thực vẫn đang hoàn thiện — xem `docs/unlock-ee/`.

### Plugin system (đang phát triển)

Kiến trúc plugin tách khỏi core, hook qua `apps/server/src/core/plugins/`. Tài liệu: `docs/plugin_management/`.

---

## Yêu cầu

- **Node.js** 22+
- **pnpm** 10+
- **PostgreSQL** 16+
- **Redis** 7+

Hoặc chạy bằng Docker (khuyến nghị cho production / thử nhanh).

---

## Chạy nhanh với Docker

```bash
docker compose up -d --build
```

Ứng dụng: [http://localhost:3000](http://localhost:3000)

Cập nhật `APP_SECRET` và mật khẩu database trong `docker-compose.yml` trước khi deploy thật.

---

## Phát triển local

```bash
pnpm install
cp .env.example .env
# Chỉnh DATABASE_URL, REDIS_URL, APP_SECRET, APP_URL

pnpm dev
```

| Lệnh | Mô tả |
|------|--------|
| `pnpm dev` | Client + server (dev) |
| `pnpm build` | Build toàn monorepo |
| `pnpm server:build` | Build server |
| `pnpm client:build` | Build client |
| `pnpm start` | Chạy server production |

Biến môi trường quan trọng:

```env
UNLOCK_EE=true          # Mở tất cả tính năng EE (self-hosted)
APP_URL=http://localhost:3000
APP_SECRET=<32+ ký tự>
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

---

## Cấu trúc monorepo

```
sc_doc/
├── apps/
│   ├── client/          # React + Vite + Mantine
│   └── server/          # NestJS API + collaboration
│       └── src/ee/      # Enterprise backend (in-repo)
├── packages/
│   ├── editor-ext/      # TipTap extensions
│   └── base-formula/    # Công thức Bases
├── docs/
│   ├── unlock-ee/       # Kế hoạch & spec EE
│   └── plugin_management/
├── docker-compose.yml
└── Dockerfile
```

EE được load động từ `app.module.ts` qua `require('./ee/ee.module')` — core OSS gần như không đổi.

---

## Tài liệu nội bộ

| Tài liệu | Nội dung |
|----------|----------|
| [docs/unlock-ee/README.md](docs/unlock-ee/README.md) | Tổng quan unlock EE, roadmap |
| [docs/unlock-ee/SSO_IMPLEMENTATION_SPEC.md](docs/unlock-ee/SSO_IMPLEMENTATION_SPEC.md) | Spec SSO (OIDC, SAML, LDAP, Google) |
| [docs/plugin_management/README.md](docs/plugin_management/README.md) | Hệ thống plugin |
| [Docmost docs](https://docmost.com/docs) | Tài liệu upstream |
