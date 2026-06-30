# API Requirements

Base path: `/pages` (NestJS controller [page.controller.ts](../../apps/server/src/core/page/page.controller.ts)), all routes behind `JwtAuthGuard`.

## Existing endpoints (unchanged)

### `POST /pages/history`
List revisions for a page, cursor-paginated. Body: `PageIdDto + PaginationOptions`.
Permission: `validateCanView`.
Response items now include `contentHash` (new field, see below) automatically since it's part of `baseFields` in the repo.

### `POST /pages/history/info`
Fetch one revision with full content. Body: `PageHistoryIdDto { historyId }`.
Permission: `validateCanView`.
Used for both sides of a comparison (left and right) — no change needed to support comparing two arbitrary revisions, since the frontend now simply calls this twice with two different ids instead of always deriving the second id from list order.

## New endpoint

### `POST /pages/history/restore`

Body: `PageHistoryIdDto { historyId: string }` (reused existing DTO — no new DTO file needed).

Permission checks (mirrors the existing page-restore-from-trash pattern in the same controller):
```ts
const ability = await this.spaceAbility.createForUser(user, page.spaceId);
if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
  throw new ForbiddenException();
}
await this.pageAccessService.validateCanEdit(page, user);
```

Behavior:
1. Loads the target history row and the live page; 404 if either missing.
2. Synchronously inserts a fresh `page_history` snapshot of the **current** live page content (`pageHistoryRepo.saveHistory(page)`) — this is the data-loss fix; it happens unconditionally, even if the debounced auto-save queue hasn't fired yet.
3. Calls `pageService.update(page, { content, title, operation: 'replace', format: 'json' }, user)` — the same method used by normal page edits, so the change propagates through the existing Yjs collaboration path to all connected clients.
4. Returns the updated `Page`.

Response: `Page` (same shape as other page-mutation endpoints in this controller).

Errors:
- `404 Not Found` — history id or page id doesn't exist.
- `403 Forbidden` — user lacks `Edit` permission on the page (e.g. Reader role).

## Schema change

`PageHistory.contentHash: string | null` — added to:
- `apps/server/src/database/types/db.d.ts` (`PageHistory` interface)
- Auto-derived `Selectable<PageHistory>` / `Insertable<PageHistory>` types via `entity.types.ts` (no manual change needed there — it's a generic re-export over `db.d.ts`)
- Frontend `IPageHistory` interface ([page.types.ts](../../apps/client/src/features/page-history/types/page.types.ts))

No new DTO validation needed for `contentHash` — it's never user-supplied, only ever read.

## Hash generation (server-only, not an endpoint)

```ts
// apps/server/src/database/repos/page/page-history.repo.ts
private computeContentHash(content: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(content ?? null))
    .digest('hex')
    .slice(0, 8);
}
```

Runs inside `insertPageHistory()` for every insert (both the periodic auto-save path and the new restore-snapshot path), so it's impossible to create a history row without a hash.
