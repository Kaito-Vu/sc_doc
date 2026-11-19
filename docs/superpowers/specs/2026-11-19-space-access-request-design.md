# Space Access Request — Design

Date: 2026-11-19 · Status: draft, awaiting approval

## Intent
A workspace member who opens a link to a space they cannot access currently hits a dead-end 403. They should be able to ask for access (space + role) and have an approver grant it, with visible status for both sides.

## Goals
- Requester: on the no-access screen, form with space name (locked), role (Can view / Can edit / Full access), optional message, Send / Cancel.
- After sending, requester sees "Request pending" (with Withdraw), later "Approved" / "Rejected (+reason)".
- Approvers = workspace owner/admin + members with Full access (space admin) of that space. Any one approver decides; first decision wins.
- Approver sees in-app notification (bell) + email, a badge, and an "Access requests" page listing pending requests with Approve (role dropdown, defaults to requested) / Reject (optional reason).
- Requester notified of outcome. Other approvers' notifications cleared once decided.
- Audit event for create/approve/reject/cancel.

## Non-goals
- Guests / users outside the workspace. Group requests. Page-level access requests. Multi-approver consensus. Auto-expiry of requests.

## Anti-goals
- Leaking that a space exists to non-workspace users, or leaking anything beyond space name to unauthorised viewers.
- Any business logic in core (upstream) files — see CLAUDE.md Golden Rule.

## Constraints
- All code under `apps/server/src/ee/` and `apps/client/src/ee/`. Core touches limited to: import + one-line wiring at (1) the client space no-access/403 render point, (2) sidebar/menu entry for the approver page, (3) module registration in `ee.module.ts`/router.
- Migration is a new file (Kysely); never hand-edit `db.d.ts` (run codegen).
- Reuse: `SpaceMemberService.addMembers` for the grant, `NOTIFICATION_QUEUE` (BullMQ) + `notifications` table, `getUserIdsWithSpaceAccess`, `AUDIT_SERVICE`, `ee/page-verification` as structural template (`/reviews` page, notification service).

## Approaches considered
- **A. Full (chosen):** dedicated table, API, 403 form, status, approver page, bell + email, audit. Matches page-verification pattern; low risk.
- B. MVP without email/space-settings tab/cooldown: faster, weaker for approvers.
- C. Reuse `notifications` as the request store: least code, no status/uniqueness/audit — rejected.

## Design
**Table `space_access_requests`:** id, workspace_id, space_id, requester_id, role_requested, message, status (`pending|approved|rejected|cancelled`), reviewer_id, role_granted, decision_reason, decided_at, created_at. Partial unique index on (space_id, requester_id) where status='pending'.

**API (server `ee/space-access-request`):**
- `POST /space-access-requests/info` {spaceSlug} → space name + my latest request status (only for same-workspace authenticated users; identical response for nonexistent space slug and space the user can't see, except name resolution rules below).
- `POST /create` {spaceId, role, message}; `POST /cancel` {id}.
- `POST /list` (approver: pending by workspace/space, paginated); `POST /approve` {id, role}; `POST /reject` {id, reason}; `POST /count` for badge.
- Approve = one transaction: lock row, verify pending (else 409), verify caller is approver, `addMembers`, set decision fields. Approver permission re-checked server-side.
- Create guards: user not already a member, no pending request, 24h cooldown after rejection, throttle.

**Notifications:** new notification types `space_access_request` (to approvers) and `space_access_decision` (to requester). Processor mirrors `verification.notification.ts`. On decision, delete remaining approvers' request notifications. Email template via existing mail integration.

**Client (`ee/space-access-request`):** `RequestAccessPanel` (replaces 403 content), `AccessRequestsPage` (route `/access-requests`), sidebar entry + badge, TanStack Query hooks, i18n keys (vi/en).

## Left to the builder
Exact 403 hook point in the client router; notification enum placement; email template copy; whether approver sidebar entry is hidden for non-approvers (assumed yes, via count/permission check).

## Defaults (my calls — please confirm)
Any single approver suffices; approver may change role; 24h cooldown after reject; workspace members only.
