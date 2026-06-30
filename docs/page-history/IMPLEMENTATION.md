# Implementation — file by file

## Backend

### New: `apps/server/src/database/migrations/20260701T000003-add-content-hash-to-page-history.ts`
```ts
import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('page_history')
    .addColumn('content_hash', 'varchar(12)')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('page_history')
    .dropColumn('content_hash')
    .execute();
}
```
> Filename originally created as `T000000`; renamed to `T000003` after a real Postgres instance rejected it with `corrupted migrations: ... New migrations must always have a name that comes alphabetically after the last executed migration` (two other migrations, `T000001` azure-ad-user-groups and `T000002` minio-attachment-schema, were already applied). **Lesson: always check the latest applied migration filename before naming a new one — don't assume same-day timestamps are safe.**

### `apps/server/src/database/types/db.d.ts`
Added `contentHash: string | null;` to the `PageHistory` interface.

### `apps/server/src/database/repos/page/page-history.repo.ts`
- Added `'contentHash'` to `baseFields` so it's selected by every read query (`findById`, `findPageHistoryByPageId`, `findPageLastHistory`).
- `insertPageHistory()` now computes the hash if not explicitly provided and stores it.
- `saveHistory()` return type changed `Promise<void>` → `Promise<PageHistory>` (purely additive; only caller, `history.processor.ts:81`, awaits it without using the return value, so no breaking change).
- Added private `computeContentHash(content)` using `node:crypto`'s `createHash('sha256')`.

### `apps/server/src/core/page/services/page-history.service.ts`
- Constructor now also injects `PageRepo` and `PageService` (both already provided by `PageModule`, no new DI wiring needed).
- New `restore(historyId, user)` method — see [ARCHITECTURE.md](ARCHITECTURE.md#restore-flow-sequence) for the full sequence.

### `apps/server/src/core/page/page.controller.ts`
- New route `POST /pages/history/restore` → `restorePageHistory()`. Reuses `PageHistoryIdDto`, follows the exact same CASL-check pattern as the existing trash-restore endpoint (`restore()` at line ~374 in the same file).

## Frontend

### `apps/client/src/features/page-history/types/page.types.ts`
Added `contentHash?: string` and `isCurrent?: boolean` to `IPageHistory`.

### `apps/client/src/features/page-history/atoms/history-atoms.ts`
- Added `CURRENT_VERSION_ID = "current"`.
- Added `compareWithIdAtom`; `activeHistoryPrevIdAtom` is now an alias of it (see [ARCHITECTURE.md](ARCHITECTURE.md#why-an-alias-instead-of-a-rename)).
- Added `viewOnlyModeAtom`, `comparePickModeAtom`.

### New: `apps/client/src/features/page-history/services/page-history-service.ts`
Added `restorePageHistory(historyId)` calling `POST /pages/history/restore`.

### New: `apps/client/src/features/page-history/hooks/use-history-item-content.ts`
`useHistoryItemContent(historyId)` — single hook used everywhere a revision's content is needed; transparently resolves the synthetic "Current" id from the live editor instead of hitting the API. Exported from `hooks/index.ts`.

### `apps/client/src/features/page-history/hooks/use-history-restore.tsx`
Rewritten: no longer touches `pageEditorAtom`/`titleEditorAtom` directly. Calls `restorePageHistory(activeHistoryId)`, shows success/error notification, closes the modal. The confirm-dialog UX (Mantine `modals.openConfirmModal`) is unchanged.

### `apps/client/src/features/page-history/hooks/use-history-reset.ts`
Also resets `viewOnlyModeAtom` and `comparePickModeAtom` when `pageId` changes, so switching pages doesn't leak stale UI mode.

### `apps/client/src/features/page-history/components/history-view.tsx`
Uses `useHistoryItemContent` instead of `usePageHistoryQuery` directly for both sides; when `viewOnlyModeAtom` is true, forces `previousContent` to `undefined` regardless of `compareWithIdAtom` so `HistoryEditor` renders a plain (non-diff) view.

### `apps/client/src/features/page-history/components/history-list.tsx`
- Builds `displayItems = [currentItem, ...historyItems]`, where `currentItem` is the synthetic "Current" row built from `titleEditorAtom`.
- `handleSelect` now branches: if `comparePickModeAtom` is true, the click sets `compareWithIdAtom` (arbitrary-pair compare) instead of normal navigation.
- New handlers passed down to `HistoryItem`: `handleView` (sets view-only mode, clears comparison), `handleCompareWithCurrent` (sets the right side to `CURRENT_VERSION_ID`), `handleStartComparePick` (enters pick mode).
- Restore button disabled when the active selection is the "Current" row (can't restore to itself).

### `apps/client/src/features/page-history/components/history-item.tsx`
- Renders a monospace `Badge` with `historyItem.contentHash` next to the timestamp (real revisions only).
- Renders a "Current version" label + icon instead of timestamp for the synthetic row.
- Adds a Mantine `Menu` (trigger: `IconDots`) with **View this revision**, **Compare with current**, **Compare with...** — hidden for the "Current" row itself.
- New `isPickSource` / `isPickTarget` props apply CSS outline states (`.pickSource` solid blue, `.pickTarget` dashed-on-hover) so the user can visually tell which row is the comparison source and which rows are pickable while `comparePickModeAtom` is active.

### `apps/client/src/features/page-history/components/css/history.module.css`
Added `.pickSource` / `.pickTarget` classes for the compare-pick visual states above.

### `apps/client/src/features/page-history/components/history-modal-body.tsx`
- Shows a sticky "Comparing `<left>` → `<right>`" label above the diff pane whenever two sides are selected (and not in view-only mode), using `useHistoryItemContent` for both sides — reuses the same React Query cache key `HistoryView` already populated, so this adds no extra network requests.
- `revisionLabel()` formats a revision as its date + `#hash` (or "Current version" for the synthetic row).

### New: `apps/client/src/features/page-history/components/history-editor-side-by-side.tsx`
`HistoryEditorSideBySide({ title, previousTitle, content, previousContent })` — renders two independent read-only TipTap editor instances side by side (`Group` + `Divider orientation="vertical"`). Runs the identical `recreateTransform()` → `ChangeSet.create().addSteps()` → `simplifyChanges()` pipeline as `HistoryEditor`, but instead of merging both versions into one document with widgets for deleted text, it decorates each side's *own* native content range directly:
- Left pane (`previousContent`): `Decoration.inline(change.fromA, change.toA, { class: "history-diff-removed-side" })` for deleted ranges.
- Right pane (`content`): `Decoration.inline(change.fromB, change.toB, { class: "history-diff-added" })` for added ranges (reuses the existing `.history-diff-added` class).

`diffCountsAtom` is populated identically to the inline view, so the existing prev/next change navigation toolbar in `history-modal-body.tsx` works unchanged for both modes.

### `apps/client/src/features/page-history/components/css/history.module.css`
Added `.history-diff-removed-side` (red background + strikethrough, no widget — applied to the old doc's own text in place, unlike `.history-diff-deleted` which decorates synthetic widget spans injected into the merged inline view).

### `apps/client/src/features/page-history/atoms/history-atoms.ts`
Added `DiffViewMode = "inline" | "side-by-side"` and `diffViewModeAtom` (default `"inline"`).

### `apps/client/src/features/page-history/components/history-view.tsx`
Branches on `diffViewModeAtom`: renders `HistoryEditorSideBySide` when mode is `"side-by-side"` AND a comparison is active (`hasComparison`); otherwise falls back to the existing `HistoryEditor` (inline) — side-by-side is meaningless in view-only mode (no second revision to compare), so the fallback also covers that case automatically.

### `apps/client/src/features/page-history/components/history-modal-body.tsx`
Added a Mantine `SegmentedControl` ("Inline" / "Side by side") next to the existing "Highlight changes" switch, only rendered while `activeHistoryId && activeHistoryPrevId` are both set (i.e. only when a comparison is actually showing) — matches where the switch itself was already gated.

## Things intentionally left as-is

- `HistoryEditor` / `use-diff-navigation.ts` — zero changes; the diffing algorithm was already pair-agnostic (see [ARCHITECTURE.md](ARCHITECTURE.md#diff-engine--unchanged)).
- `history-modal-body.tsx` — zero changes; it reads `activeHistoryPrevIdAtom`, which still resolves correctly via the alias.
- `/pages/history` and `/pages/history/info` endpoints — zero changes; reused as-is for arbitrary-pair comparison.
