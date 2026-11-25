# Attachment Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin page `/settings/attachments` to configure max upload size, allowed extensions/MIME types, and max total RTF bytes for EA import, stored in `workspaces.settings.attachments`.

**Architecture:** Pure resolver/validator in `ee/attachment-settings/` (imported directly by core, same precedent as `ee/attachment-path`), a small ee controller/service for read/update via the existing `ee/common/workspace-settings.repo.ts` `mergeSettings`, and a client page under `apps/client/src/ee/attachment-settings/`. Core files get import + one-liner changes only.

**Tech Stack:** NestJS + Kysely + Jest (server), React + Mantine + TanStack Query + Vitest (client).

**Spec:** `docs/superpowers/specs/2026-11-25-attachment-settings-design.md`

## Global Constraints

- Golden Rule (CLAUDE.md): logic only in `ee/`; core = import + one line.
- Env `FILE_UPLOAD_SIZE_LIMIT` removed everywhere (server env service + spec, `static.module.ts`, client `config.ts` + `config.test.ts`, `vite.config.ts`, `.env.example`). `FILE_IMPORT_SIZE_LIMIT` stays untouched.
- Defaults when unconfigured: max upload **10 MB**, max total RTF **100 MB** (`bytes('10mb')`, `bytes('100mb')`).
- Extension allow-list: key absent => `DEFAULT_ALLOWED_EXTENSIONS` = `.doc .docx .xls .xlsx .ppt .pptx .pdf .txt .csv .md .rtf .odt .ods .odp .png .jpg .jpeg .webp .gif .svg .bmp .html .htm .mp4 .mov .webm .mp3 .wav .ogg .m4a .zip .7z .rar`; saved `[]` => allow all. MIME list: absent or `[]` => no MIME check. Extensions stored lowercase with leading dot; MIME entries lowercase, `type/*` wildcard allowed. Both lists configured => file must match both.
- Oversize => 413 (existing behavior); disallowed type => `BadRequestException` (400).
- Admin only. Settings key: `workspaces.settings.attachments = { maxUploadBytes?, allowedExtensions?, allowedMimeTypes?, maxTotalRtfBytes? }`. No migration.

## Review Focus

- Extension case/dots: `.PDF`, `pdf`, `a.tar.GZ` must match configured `.pdf` / `.gz` (match last extension, case-insensitive).
- File with no extension while an extension list is set → rejected.
- MIME `image/*` wildcard matches `image/png`, not `imagex/png`; MIME with params (`text/plain; charset=utf-8`) matches `text/plain`.
- Corrupt/non-numeric stored values (`maxUploadBytes: "abc"`, negative, 0) → fall back to defaults, never crash or allow unlimited.
- Update DTO rejects `maxUploadBytes <= 0` and non-array lists; saving `[]` extensions means allow all, while `null` for a field removes it (back to default).
- Defaults must not break editor uploads: `.png/.jpg/.jpeg/.gif/.webp/.svg/.pdf/.mp4/.mov/.webm/.mp3/.wav/.ogg/.m4a` are all in the default list (test asserts it).

---

### Task 1: Pure resolver + validator

**Files:**
- Create: `apps/server/src/ee/attachment-settings/attachment-settings.ts`
- Test: `apps/server/src/ee/attachment-settings/attachment-settings.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DEFAULT_MAX_UPLOAD_BYTES: number;      // bytes('10mb')
  export const DEFAULT_MAX_TOTAL_RTF_BYTES: number;   // bytes('100mb')
  export const DEFAULT_ALLOWED_EXTENSIONS: readonly string[]; // list in Global Constraints
  export interface AttachmentSettings { maxUploadBytes: number; allowedExtensions: string[]; allowedMimeTypes: string[]; maxTotalRtfBytes: number }
  export function resolveAttachmentSettings(workspaceSettings: unknown): AttachmentSettings; // applies defaults, sanitizes
  export function assertFileAllowed(cfg: AttachmentSettings, fileName: string, mimeType: string | undefined): void; // throws BadRequestException
  ```

- [ ] **Step 1: Write failing tests** covering: defaults for `undefined`/`{}` (including `allowedExtensions` equal to `DEFAULT_ALLOWED_EXTENSIONS`, `allowedMimeTypes` `[]`); saved `allowedExtensions: []` stays `[]` (allow all); default list contains every editor-upload extension named in Review Focus; `.exe`, `.js`, `.sh` rejected by default; garbage values (`"abc"`, `-1`, `0`) → defaults; configured values pass through; `assertFileAllowed` — empty lists allow anything; `.PDF` matches `['.pdf']`; `a.tar.GZ` matches `['.gz']`; no-extension rejected when list set; `image/*` matches `image/png` but not `imagex/png`; `text/plain; charset=utf-8` matches `text/plain`; both lists set and only one matches → throws `BadRequestException` whose message contains the file name.
- [ ] **Step 2: Run** `pnpm --filter ./apps/server exec jest src/ee/attachment-settings/attachment-settings.spec.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the functions in `attachment-settings.ts` (normalize lists to lowercase, drop non-strings; extension from `path.extname(fileName).toLowerCase()`; MIME compare after stripping `;` params).
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(ee): attachment settings resolver and validator`.

### Task 2: Read/update API

**Files:**
- Create: `apps/server/src/ee/attachment-settings/attachment-settings.service.ts`, `attachment-settings.controller.ts`, `attachment-settings.module.ts`, `dto/update-attachment-settings.dto.ts`
- Modify: `apps/server/src/ee/ee.module.ts` (import + add `AttachmentSettingsModule` to imports)
- Test: `apps/server/src/ee/attachment-settings/attachment-settings.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 `resolveAttachmentSettings`; `WorkspaceSettingsRepo.mergeSettings(workspaceId, patch)` from `apps/server/src/ee/common/workspace-settings.repo.ts` (register it in this module's providers, as `personal-space.module.ts` does).
- Produces:
  ```ts
  class AttachmentSettingsService {
    get(workspace: Workspace): AttachmentSettings;                       // resolveAttachmentSettings(workspace.settings)
    update(workspace: Workspace, dto: UpdateAttachmentSettingsDto): Promise<AttachmentSettings>; // merges dto over the workspace's stored settings.attachments; a field set to null is removed (back to default)
  }
  ```
  Controller `@Controller('attachment-settings')`, `@UseGuards(JwtAuthGuard)`, both `POST` + `HttpCode(200)`: `info` → `get`, `update` → `update`; each calls `assertWorkspaceAdmin(this.workspaceAbility, user, workspace)` (see `announcement.controller.ts`). No `@RequireFeature` (page must work without a license).
  DTO: `maxUploadBytes?: number` (`@IsInt @Min(1)`), `allowedExtensions?: string[]`, `allowedMimeTypes?: string[]`, `maxTotalRtfBytes?: number` (`@IsInt @Min(1)`), lists `@IsArray @IsString({each:true})`.

- [ ] **Step 1: Write failing test** `update merges {attachments: sanitized dto} via mergeSettings and returns resolved settings`; `update with empty lists stores empty arrays`.
- [ ] **Step 2: Run** `pnpm --filter ./apps/server exec jest src/ee/attachment-settings/attachment-settings.service.spec.ts` → FAIL.
- [ ] **Step 3: Implement** service (patch = `{ attachments: <dto normalized> }`; return `resolveAttachmentSettings(returnedSettings)`), controller, module, DTO, and register in `ee.module.ts`.
- [ ] **Step 4: Run** the spec → PASS; run `pnpm --filter ./apps/server exec tsc --noEmit -p apps/server/tsconfig.json` → no errors.
- [ ] **Step 5: Commit** `feat(ee): attachment settings API`.

### Task 3: Enforce on upload, remove upload env

**Files:**
- Modify: `apps/server/src/core/attachment/attachment.controller.ts` (uploadFile: lines ~121, 132, 230 — use `resolveAttachmentSettings(workspace.settings).maxUploadBytes` for the limit and message via `bytes(limit)`; after `file` is obtained call `assertFileAllowed(cfg, file.filename, file.mimetype)` before any other processing)
- Modify: `apps/server/src/core/attachment/attachment.controller.spec.ts` (lines ~233: `getFileUploadSizeLimit` stub removed; limit now comes from `workspace.settings.attachments.maxUploadBytes`)
- Modify: `apps/server/src/integrations/environment/environment.service.ts` (delete `getFileUploadSizeLimit`) and `environment.service.spec.ts` (delete its 3 tests)
- Modify: `apps/server/src/integrations/static/static.module.ts` (drop `FILE_UPLOAD_SIZE_LIMIT` from injected config)
- Modify: `apps/client/vite.config.ts` (drop `FILE_UPLOAD_SIZE_LIMIT` ×2), `.env.example:56`

**Interfaces:**
- Consumes: Task 1 `resolveAttachmentSettings`, `assertFileAllowed`.

- [ ] **Step 1: Update/add controller spec tests:** upload of a `.exe` with `allowedExtensions: ['.pdf']` → rejects 400; file over `settings.attachments.maxUploadBytes` → 413; no settings → 10 MB limit passed to `req.file({limits:{fileSize: 10*1024*1024}})`.
- [ ] **Step 2: Run** `pnpm --filter ./apps/server exec jest src/core/attachment/attachment.controller.spec.ts` → FAIL.
- [ ] **Step 3: Implement** the controller edits and delete the env getter, static-module entry, vite entries, `.env.example` line.
- [ ] **Step 4: Run** attachment controller spec + `environment.service.spec.ts` → PASS; `grep -r FILE_UPLOAD_SIZE_LIMIT` (excluding node_modules/dist/docs) → no hits except client `config.ts` (Task 5).
- [ ] **Step 5: Commit** `feat: enforce attachment settings on upload, drop FILE_UPLOAD_SIZE_LIMIT`.

### Task 4: EA import RTF budget from settings

**Files:**
- Modify: `apps/server/src/ee/ea-import/ea-convert.pool.ts` (remove const `MAX_TOTAL_RTF_BYTES`; `convertNodeDocuments(nodes, warnings, maxTotalRtfBytes: number)`; use the parameter at the two spots that referenced the const)
- Modify: `apps/server/src/ee/ea-import/ea-import.service.ts:620` (read workspace settings by `scope.workspaceId` via `this.db`, resolve with Task 1, pass `.maxTotalRtfBytes`)
- Test: `apps/server/src/ee/ea-import/ea-convert.pool.spec.ts` (create if absent; check for an existing spec first)

**Interfaces:**
- Consumes: Task 1 `resolveAttachmentSettings`.

- [ ] **Step 1: Write failing test:** with `maxTotalRtfBytes` smaller than the sum of two documents' sizes, the second node's document is skipped with a warning containing `exceed the <limit> byte total limit`; with a large limit both convert (mock `convertModelDocuments`/size reader as the existing specs do).
- [ ] **Step 2: Run** `pnpm --filter ./apps/server exec jest src/ee/ea-import/ea-convert.pool.spec.ts` → FAIL.
- [ ] **Step 3: Implement** the parameter and the service lookup.
- [ ] **Step 4: Run** that spec and the full `src/ee/ea-import` specs → PASS.
- [ ] **Step 5: Commit** `feat(ee): configurable EA import RTF budget`.

### Task 5: Client page, route, sidebar, client limit

**Files:**
- Create: `apps/client/src/ee/attachment-settings/pages/attachment-settings.tsx`, `services/attachment-settings-service.ts`, `queries/attachment-settings-query.ts`, `lib/upload-limit.ts`
- Modify: `apps/client/src/App.tsx` (route `attachments` beside `announcements`, line ~289), `apps/client/src/components/settings/settings-sidebar.tsx` (item "Attachments", `IconPaperclip`, path `/settings/attachments`, `role: "admin"`, no feature gate), `apps/client/src/features/workspace/types/workspace.types.ts` (add `attachments?: IWorkspaceAttachmentSettings` to `IWorkspaceSettings`), `apps/client/src/lib/config.ts` (`getFileUploadSizeLimit` returns `getWorkspaceUploadLimit()` from `ee/attachment-settings/lib/upload-limit.ts`), `apps/client/src/lib/config.test.ts` (replace env tests)
- Test: `apps/client/src/ee/attachment-settings/lib/upload-limit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/upload-limit.ts
  export function getWorkspaceUploadLimit(): number; // getDefaultStore().get(workspaceAtom)?.settings?.attachments?.maxUploadBytes ?? 10 * 1024 * 1024
  // services: POST /attachment-settings/info and /update  -> AttachmentSettings
  ```
  Page: Mantine form with `NumberInput` (MB) for max upload and max RTF total, `TagsInput` for extensions (shows the effective list, defaults included) and MIME types, a "Reset to default" button (sends `null` fields), Save button; on success set `workspaceAtom` settings from response and show notification; follows `ee/announcement/pages` structure for header/layout.

- [ ] **Step 1: Verify** the app uses jotai's default store (no custom `<Provider store=…>` in `main.tsx`/`App.tsx`); if a custom store exists, export it and read from that instead.
- [ ] **Step 2: Write failing test** `upload-limit.test.ts`: default 10 MB when workspace has no `attachments`; returns configured bytes when set (set via `getDefaultStore().set(workspaceAtom, …)`).
- [ ] **Step 3: Run** `pnpm --filter ./apps/client exec vitest run src/ee/attachment-settings/lib/upload-limit.test.ts` → FAIL.
- [ ] **Step 4: Implement** all files above; keep `config.ts` change to one import + replace function body line; add i18n keys to the English locale file used by other pages.
- [ ] **Step 5: Run** the new test, `src/lib/config.test.ts`, and `pnpm --filter ./apps/client exec tsc --noEmit` → PASS / no errors.
- [ ] **Step 6: Commit** `feat(ee): attachment settings page`.

### Task 6: Verify end-to-end and diff audit

- [ ] **Step 1:** `pnpm dev`, log in as admin, open `/settings/attachments`: change max upload to 1 MB, allowed extensions `.pdf`; upload a 2 MB `.png` in a page → blocked client-side; a small `.pdf` uploads. Clear the lists → `.png` uploads again.
- [ ] **Step 2:** Run `pnpm --filter ./apps/server run test` and `pnpm --filter ./apps/client run test` → PASS.
- [ ] **Step 3: Golden-Rule audit:** `git diff -- apps/*/src` outside `ee/` contains only imports and one-liners (attachment.controller, config.ts, App.tsx, settings-sidebar.tsx, workspace.types.ts, env/static/vite removals). Anything more → move into `ee/`.
