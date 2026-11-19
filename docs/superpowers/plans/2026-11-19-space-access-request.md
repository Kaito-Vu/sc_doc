# Space Access Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workspace member who gets 403 on a space can request a role (reader/writer/admin); workspace owner/admin and space admins approve or reject it, with notifications and a queue page.

**Architecture:** New server module `ee/space-access-request` (table, repo, service, controller, notification hook) modelled on `ee/page-verification`. Client feature `ee/space-access-request` replaces the 403 body inside the existing `ee/space-access/space-access-guard.tsx` and adds an approver page + sidebar entry. Grant reuses `SpaceMemberService.addMembers`; notifications reuse `NotificationService.create` + `NotificationType`.

**Tech Stack:** NestJS + Fastify, Kysely (hand-written migration), Jest; React 19, Mantine, TanStack Query, Vitest, i18next.

**Spec:** `docs/superpowers/specs/2026-11-19-space-access-request-design.md`

## Global Constraints

- **Golden rule (CLAUDE.md):** all new code under `apps/server/src/ee/` and `apps/client/src/ee/`. Core files get only an import + one line. Allowed core touches: `apps/server/src/core/notification/notification.constants.ts` (2 enum lines), `apps/client/src/features/notification/types/notification.types.ts` (2 union members), `apps/server/src/ee/ee.module.ts` (import + register — it is already ee), `apps/client/src/App.tsx` (1 lazy import + 1 `<Route>`).
- Roles are `admin | writer | reader` (UI labels Full access / Can edit / Can view). Reuse `spaceRoleData` from `features/space/types/space-role-data.ts`.
- One pending request per (space, requester): partial unique index.
- 24 h cooldown after a rejection before the same user can re-request the same space.
- Workspace members only (JwtAuthGuard user with `workspaceId` match).
- Never hand-edit `db.d.ts`; run `pnpm --filter ./apps/server run migration:codegen`.
- Migration filename style: `YYYYMMDDTHHMMSS-name.ts`, exports `up`/`down`.
- i18n: wrap every string in `t()`; add vi/en keys to existing locale files.

## Review Focus

- Two approvers click Approve/Reject at the same time → exactly one wins, the other gets 409 (Task 2).
- User already a member (or became one meanwhile) requests/approved → 400 on create; approve is idempotent-safe, no duplicate member row (Task 2).
- Requester withdraws while approver is mid-review → approve returns 409, no grant (Task 2).
- Space slug nonexistent vs. inaccessible → identical `info` response shape (Task 3).
- Approver loses admin role after request created → approve returns 403 (Task 2).

---

### Task 1: Migration + repo

**Files:**
- Create: `apps/server/src/database/migrations/20261119T120000-space-access-requests.ts`
- Create: `apps/server/src/ee/space-access-request/space-access-request.repo.ts`
- Test: `apps/server/src/ee/space-access-request/space-access-request.repo.spec.ts` (follow `page-verification.repo.spec.ts` setup)
- Modify (generated): `apps/server/src/database/types/db.d.ts`

**Interfaces:**
- Produces: table `space_access_requests`; `SpaceAccessRequestRepo` with
  - `insert(data: {workspaceId; spaceId; requesterId; roleRequested: SpaceRole; message?: string}): Promise<Row>`
  - `findPendingForSpaceAndUser(spaceId: string, userId: string): Promise<Row|undefined>`
  - `findLatestForSpaceAndUser(spaceId, userId): Promise<Row|undefined>`
  - `findByIdForUpdate(id: string, trx: KyselyTransaction): Promise<Row|undefined>`
  - `decide(id, trx, patch: {status: 'approved'|'rejected'|'cancelled'; reviewerId?: string; roleGranted?: SpaceRole; decisionReason?: string}): Promise<void>`
  - `listPendingForSpaces(workspaceId: string, spaceIds: string[]|'all', pagination: PaginationOptions)` (joins requester name/avatar, space name/slug)
  - `countPending(workspaceId: string, spaceIds: string[]|'all'): Promise<number>`

- [ ] **Step 1: Write failing repo test** — `inserts a pending row`, `rejects a 2nd pending row for same (space,user)` (expect unique violation), `allows new pending after status becomes rejected`, `findByIdForUpdate+decide sets status and decided_at`.
- [ ] **Step 2: Run** `pnpm --filter ./apps/server exec jest src/ee/space-access-request/space-access-request.repo.spec.ts` → FAIL (no table/repo).
- [ ] **Step 3: Write migration.** Columns: `id uuid pk default gen_uuid_v7()` (copy id default from an existing migration), `workspace_id`, `space_id` (FK spaces on delete cascade), `requester_id` (FK users cascade), `role_requested varchar not null`, `message text`, `status varchar not null default 'pending'`, `reviewer_id uuid null`, `role_granted varchar null`, `decision_reason text null`, `decided_at timestamptz null`, `created_at timestamptz default now()`. Partial unique index `ux_sar_pending ON (space_id, requester_id) WHERE status='pending'`; index on `(workspace_id, status)`.
- [ ] **Step 4: Run** `pnpm --filter ./apps/server run migration:latest` then `migration:codegen`; confirm `spaceAccessRequests` in `db.d.ts`.
- [ ] **Step 5: Implement `SpaceAccessRequestRepo`** per the Interfaces block (inject `@InjectKysely() db`, use `dbOrTx`; `findByIdForUpdate` uses `.forUpdate()`).
- [ ] **Step 6: Run repo spec** → PASS.
- [ ] **Step 7: Commit** `feat(ee): space access request table and repo`.

---

### Task 2: Service (create / cancel / approve / reject / list / count)

**Files:**
- Create: `apps/server/src/ee/space-access-request/space-access-request.service.ts`
- Test: `apps/server/src/ee/space-access-request/space-access-request.service.spec.ts` (mock repo, `SpaceMemberService`, `SpaceMemberRepo`, `NotificationQueue`, audit — mirror `page-verification.service.spec.ts`)
- Modify: `apps/server/src/common/events/audit-events.ts` (add `SPACE_ACCESS_REQUESTED|APPROVED|REJECTED|CANCELLED` — if this file is core, add 4 enum lines only)

**Interfaces:**
- Consumes: Task 1 repo; `SpaceMemberService.addMembers(...)` (read its signature in `core/space/services/space-member.service.ts` before use); `SpaceMemberRepo.getUserIdsWithSpaceAccess`/role lookup; workspace role from `user.role` (`owner|admin`).
- Produces: `SpaceAccessRequestService` with
  - `create(dto: {spaceId; role: SpaceRole; message?}, user: User): Promise<Row>`
  - `cancel(id: string, user: User): Promise<void>`
  - `approve(id: string, role: SpaceRole, user: User): Promise<void>`
  - `reject(id: string, reason: string|undefined, user: User): Promise<void>`
  - `list(user: User, pagination): Promise<Paginated<Row>>`, `count(user): Promise<number>`
  - private `isApprover(user, spaceId): Promise<boolean>` = workspace owner/admin OR space role `admin`.
  - `getApproverIds(workspaceId, spaceId): Promise<string[]>`
- Emits: BullMQ job on `QueueName.NOTIFICATION_QUEUE` with `QueueJob.SPACE_ACCESS_REQUESTED` / `SPACE_ACCESS_DECIDED` and payload `{requestId; spaceId; workspaceId}` (job names added in Task 4).

- [ ] **Step 1: Write failing tests**, each a named test:
  - `create throws BadRequest if user already member`
  - `create throws Conflict if pending exists`
  - `create throws 429-style BadRequest within 24h of rejection`
  - `create inserts and enqueues SPACE_ACCESS_REQUESTED`
  - `approve grants role via addMembers and marks approved in one trx`
  - `approve throws Forbidden when caller is not approver (incl. demoted admin)`
  - `approve throws Conflict when status != pending` (covers concurrent + withdrawn)
  - `approve can grant role different from requested`
  - `reject stores reason, status rejected, enqueues SPACE_ACCESS_DECIDED`
  - `cancel only by requester, only if pending`
- [ ] **Step 2: Run** `jest space-access-request.service.spec.ts` → FAIL.
- [ ] **Step 3: Implement service.** `approve`/`reject`/`cancel` use `executeTx` + `findByIdForUpdate`; check status inside the lock; call `addMembers` in the same trx only if requester not already member. Audit-log each outcome with `AUDIT_SERVICE`.
- [ ] **Step 4: Run spec** → PASS.
- [ ] **Step 5: Commit** `feat(ee): space access request service`.

---

### Task 3: Controller, module, `info` endpoint

**Files:**
- Create: `apps/server/src/ee/space-access-request/space-access-request.controller.ts`, `space-access-request.module.ts`, `dto/*.dto.ts`
- Test: `space-access-request.controller.spec.ts` (mirror `page-verification.controller.spec.ts`)
- Modify: `apps/server/src/ee/ee.module.ts` (import + add to `imports`, like `PageVerificationModule` at lines 12/55)

**Interfaces:**
- Consumes: Task 2 service.
- Produces (all `@Post`, `@UseGuards(JwtAuthGuard)`, prefix `space-access-requests`, `@AuthUser()`):
  - `info` body `{spaceSlug: string}` → `{ space: {id,name,slug}|null, request: {id,status,roleRequested,roleGranted,decisionReason,createdAt}|null, canRequest: boolean }`. Space resolved by slug within user's workspace; **nonexistent and inaccessible return the same shape** (`space` null only when slug not found in workspace; for an existing space the name is returned — approved trade-off: workspace members already see space names in spaces lists). `canRequest=false` if already member or in cooldown.
  - `create` `{spaceId, role, message?}`; `cancel` `{id}`; `approve` `{id, role}`; `reject` `{id, reason?}`; `list` (pagination); `count`.
  - DTOs validated with class-validator (`@IsEnum(SpaceRole)`, `@MaxLength(500)` on message/reason). Apply `@Throttle` (reuse repo's throttle decorator pattern) on `create`.

- [ ] **Step 1: Write failing controller tests**: `info returns identical shape for unknown slug and forbidden space`, `create validates role enum`, `approve delegates to service`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement controller/DTOs/module**, register in `ee.module.ts`.
- [ ] **Step 4: Run** `pnpm --filter ./apps/server exec jest space-access-request` → PASS; `pnpm --filter ./apps/server build` compiles.
- [ ] **Step 5: Commit** `feat(ee): space access request API`.

---

### Task 4: Notifications (in-app + email)

**Files:**
- Create: `apps/server/src/ee/space-access-request/space-access-request.notification.ts`, email template next to `review-notification.service.ts`'s template (follow how it builds its email)
- Test: `space-access-request.notification.spec.ts` (mirror `review-notification.service.spec.ts`)
- Modify: `apps/server/src/core/notification/notification.constants.ts` (add `SPACE_ACCESS_REQUESTED: 'space.access_requested'`, `SPACE_ACCESS_DECIDED: 'space.access_decided'`; add both to `DIRECT_NOTIFICATION_TYPES`); `apps/server/src/integrations/queue/constants.ts` (2 `QueueJob` names); `apps/server/src/core/notification/notification.processor.ts` (route the 2 jobs to the ee handler — one `case` each, delegating); `apps/client/src/features/notification/types/notification.types.ts` (2 union members).

**Interfaces:**
- Consumes: `NotificationService.create(InsertableNotification)` (fields: userId, workspaceId, type, actorId, spaceId, data `{requestId, role}`), `NotificationService.queueEmail`, `service.getApproverIds`.
- Produces: `SpaceAccessRequestNotification` with `processRequested(job)` (one notification per approver, excluding requester) and `processDecided(job)` (notify requester; **delete other approvers' `space.access_requested` rows for that requestId**: add `NotificationRepo`-level delete via a query inside this class on `notifications` where `type`, `data->>'requestId'`).

- [ ] **Step 1: Write failing tests**: `requested notifies each approver once, not the requester`, `decided notifies requester with outcome`, `decided clears approvers' pending notifications`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** + processor wiring. **Step 4: Run** specs → PASS.
- [ ] **Step 5: Commit** `feat(ee): space access request notifications`.

---

### Task 5: Client — request panel on 403 + notification rendering

**Files:**
- Create: `apps/client/src/ee/space-access-request/{types,services/space-access-request-service.ts,queries/space-access-request-query.ts,components/request-access-panel.tsx}`
- Test: `components/request-access-panel.test.tsx` (Vitest + RTL, mock the service)
- Modify: `apps/client/src/ee/space-access/space-access-guard.tsx` (replace the `<EmptyState …/>` body with `<RequestAccessPanel spaceSlug={spaceSlug} />` — one import, one JSX line); `apps/client/src/ee/notifications/notification-renderers.ts` (add `MESSAGE_KEYS` for `space.access_requested` / `space.access_decided`, and URLs: requested → `/access-requests`, decided → `/s/${slug}`); locale files.

**Interfaces:**
- Produces: `useSpaceAccessInfoQuery(spaceSlug)`, `useCreateAccessRequestMutation()`, `useCancelAccessRequestMutation()`; `RequestAccessPanel({spaceSlug: string})`.
- Behavior: loads `info`; no request & `canRequest` → form (space name read-only, Select from `spaceRoleData`, Textarea message, Send / Cancel→navigate `/home`); `pending` → "Request pending" + Withdraw; `rejected` → reason + (re-request form if `canRequest`); `approved` → button "Open space" (invalidate space query). Space `null` → generic "Space not found or no access" with Back button.

- [ ] **Step 1: Write failing tests**: `shows role select with Can view / Can edit / Full access`, `Send calls create with chosen role`, `pending state shows Withdraw and hides form`, `rejected state shows reason`.
- [ ] **Step 2: Run** `pnpm --filter ./apps/client exec vitest run src/ee/space-access-request` → FAIL.
- [ ] **Step 3: Implement** panel, queries, service (axios `api.post('/space-access-requests/...')`), guard wiring, renderers.
- [ ] **Step 4: Run tests** → PASS; open the app, visit a space URL as a non-member and verify the panel (use preview tools).
- [ ] **Step 5: Commit** `feat(ee): request-access panel for forbidden spaces`.

---

### Task 6: Client — approver page, badge, sidebar

**Files:**
- Create: `apps/client/src/ee/space-access-request/pages/access-requests-page.tsx`, `components/access-request-row.tsx`
- Test: `access-request-row.test.tsx`
- Modify: `apps/client/src/App.tsx` (lazy import + `<Route path="/access-requests" …/>` next to line ~221 `/reviews`); `apps/client/src/ee/ui/sidebar/global-sidebar-v2.tsx` and `apps/client/src/ee/ui/experience/nav-extras.tsx` (one nav link each, rendered via an ee `AccessRequestsNavLink` component that hides itself when `count` query returns 0/403 and shows the badge otherwise — all logic inside the ee component).

**Interfaces:**
- Consumes: `list`, `count`, `approve`, `reject` endpoints; `useSocket` notification event to invalidate `count`/`list` (follow `use-notification-socket.ts`).
- Produces: `AccessRequestsPage`, `AccessRequestRow({request, onApprove(role), onReject(reason?)})`, `AccessRequestsNavLink`.

- [ ] **Step 1: Write failing tests**: `row defaults approve role to requested role`, `row lets approver change role before approving`, `reject sends optional reason`, `409 shows "already handled" toast and removes row`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter ./apps/client exec vitest run src/ee/space-access-request` → PASS.
- [ ] **Step 5: End-to-end manual check** with two users (member + space admin): request → bell+badge appear → approve → requester sees space; second approver's notification vanishes.
- [ ] **Step 6: Run `pnpm --filter ./apps/client run lint`** and re-check the core-file diff (`git diff --stat` must show only the allowed core touches). Commit `feat(ee): access requests approver page`.
