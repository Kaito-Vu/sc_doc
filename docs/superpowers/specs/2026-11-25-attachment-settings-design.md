# Attachment settings page (`/settings/attachments`) — design

## Intent
Admins configure upload limits from the UI instead of env vars + redeploy.
Trigger: EA import skipped RTF documents (total limit hit) and uploads had no type control.

## Goals
1. Max size per uploaded attachment (replaces env `FILE_UPLOAD_SIZE_LIMIT`; default **10 MB**).
2. Allowed file extensions / MIME types for attachment upload. Unconfigured extensions default to an allow-list (below); an explicitly saved empty list = allow all. MIME list defaults to empty (= no MIME check) because browsers report unreliable MIME for office files.
   Default extensions: `.doc .docx .xls .xlsx .ppt .pptx .pdf .txt .csv .md .rtf .odt .ods .odp .png .jpg .jpeg .webp .gif .svg .bmp .html .htm .mp4 .mov .webm .mp3 .wav .ogg .m4a .zip .7z .rar`
   (covers every editor upload block: image, video, audio, pdf, drawio/excalidraw svg; html/htm/svg are served with `Content-Disposition: attachment` + CSP, see `attachment.controller.ts` `inlineFileExtensions`). Existing stored files are unaffected; only new uploads are checked.
3. Max total RTF bytes for EA import (replaces hard-coded `MAX_TOTAL_RTF_BYTES`; default **100 MB**).

## Non-goals
- Other upload paths keep their own limits: file import (`FILE_IMPORT_SIZE_LIMIT`), AI chat, avatar/logo.
- No per-space overrides, no migration (stored in `workspaces.settings.attachments` JSONB).

## Decisions (user)
- Env `FILE_UPLOAD_SIZE_LIMIT` is removed everywhere (server, client build/config injection, `.env.example`, specs).
- Unconfigured defaults: 10 MB upload, 100 MB total RTF.

## Decisions (my calls)
- Allow-list: extensions (`.pdf`) and/or MIME (`image/*`). Both configured => file must match both. Mismatch => HTTP 400 with clear message. Oversize => 413 as today.
- Admin-only page. No hard ceiling beyond the setting itself (note: proxy `client_max_body_size` still applies).
- Client reads the limit from `workspace.settings.attachments` (already delivered with workspace info); default 10 MB when absent.

## Approaches considered
- **A (chosen):** JSON under `workspaces.settings.attachments`, new `ee/attachment-settings` module on server + client. No migration, matches `export`/`sharing` settings pattern.
- B: dedicated table — needs migration + codegen, no benefit for 3 scalar/list values.
- C: keep env as fallback — rejected by user.

## Golden Rule wiring (all logic in `ee/`)
Server `apps/server/src/ee/attachment-settings/`: module, controller (`info`/`update`, admin guard), service (read with defaults, write via own kysely jsonb merge, `assertFileAllowed`, `getMaxUploadBytes`, `getMaxTotalRtfBytes`).
Core touches (one-liners only): `attachment.controller.ts` uploadFile calls ee limit + type check in place of env; `ee.module` import; remove `getFileUploadSizeLimit` from `environment.service.ts` and `static.module.ts`.
EA import: `convertNodeDocuments` gets `maxTotalRtfBytes` parameter from `ea-import.service.ts` (both in `ee/`).
Client `apps/client/src/ee/attachment-settings/`: page, query/service. Core touches: one route in `App.tsx`, one sidebar item, `lib/config.ts` `getFileUploadSizeLimit()` returns value set from workspace settings (default 10 MB); `vite.config.ts` drops the env.

## Left to builder
Form layout/validation copy, i18n keys, tests (service defaults/merge, type check, controller limit).
