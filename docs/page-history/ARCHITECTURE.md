# Architecture

## Data model

`page_history` table (Postgres, Kysely):

```
id              uuid PK
page_id         uuid FK -> pages
slug_id, slug   varchar
title           varchar
icon            varchar
cover_photo     varchar
content         jsonb           -- ProseMirror doc snapshot
content_hash    varchar(12)     -- NEW: sha256(content).slice(0,8), git-like short SHA
version         integer (unused, nullable, legacy)
last_updated_by_id  uuid FK -> users
contributor_ids uuid[]
space_id, workspace_id  uuid
created_at, updated_at  timestamp
```

Migration: [20260701T000003-add-content-hash-to-page-history.ts](../../apps/server/src/database/migrations/20260701T000003-add-content-hash-to-page-history.ts)
(renamed from `...T000000...` to `...T000003...` because Kysely's migrator requires filenames to sort strictly after the last-executed migration; `T000001`/`T000002` were already applied on this environment).

`content_hash` is nullable — old rows created before this migration simply show no hash badge; no backfill required.

## Insertion path (unchanged, now hash-aware)

```
Editor edit → Yjs collab → persistence.extension.ts (debounced queue)
  → history.processor.ts: HistoryProcessor.process()
    → pageHistoryRepo.saveHistory(page, { contributorIds })
      → insertPageHistory()
        → computeContentHash(content)   // NEW
        → INSERT INTO page_history (..., content_hash)
```

Restore now also calls `saveHistory()` directly (synchronously, not via the debounce queue) to force a snapshot before overwrite. See [API_REQUIREMENTS.md](API_REQUIREMENTS.md#restore).

## Frontend state model

Before:
```
activeHistoryIdAtom       — the revision being read
activeHistoryPrevIdAtom   — ALWAYS auto-derived: historyItems[index + 1]
```

After:
```
activeHistoryIdAtom       — the revision being read (left/primary side)
compareWithIdAtom         — the "other side" of the comparison (any revision,
                             or CURRENT_VERSION_ID, or "" for no-diff view)
activeHistoryPrevIdAtom   — kept as an *alias* of compareWithIdAtom so existing
                             call sites (history-modal-body.tsx, use-history-reset.ts)
                             keep working without changes
viewOnlyModeAtom          — when true, HistoryView forces no-diff rendering
comparePickModeAtom       — when true, the next click in the list sets
                             compareWithIdAtom instead of normal navigation
CURRENT_VERSION_ID        — sentinel id ("current") for the synthetic
                             "live editor" list entry
```

File: [history-atoms.ts](../../apps/client/src/features/page-history/atoms/history-atoms.ts)

### Why an alias instead of a rename

`activeHistoryPrevIdAtom` is read in `history-modal-body.tsx` and `use-history-reset.ts`. Jotai atoms are referentially equal regardless of which exported name points to them, so `export const activeHistoryPrevIdAtom = compareWithIdAtom` keeps both names working as the *same* atom — no need to touch those call sites.

## The "Current" virtual entry

The live page content is never written to `page_history` until the debounce queue fires. To let users compare-against or view "what's on screen right now", `HistoryList` synthesizes a row:

```ts
{ id: CURRENT_VERSION_ID, isCurrent: true, title, content: <from editor>, ... }
```

prepended to the real `historyItems` array. It is sourced live from `pageEditorAtom` / `titleEditorAtom` (the same Tiptap editor instances the page itself renders) — no extra network fetch.

Resolving "what content does id X have" is unified by `useHistoryItemContent(id)`:
- `id === CURRENT_VERSION_ID` → reads `editor.getJSON()` directly, synchronously, no network call.
- any other id → delegates to `usePageHistoryQuery(id)` (existing React Query hook hitting `/pages/history/info`).

File: [use-history-item-content.ts](../../apps/client/src/features/page-history/hooks/use-history-item-content.ts)

## Diff engine — unchanged

`HistoryEditor` ([history-editor.tsx](../../apps/client/src/features/page-history/components/history-editor.tsx)) already accepted two arbitrary ProseMirror docs (`content`, `previousContent`) and ran `recreateTransform()` on them — this never assumed adjacency at the algorithm level. The adjacency assumption lived entirely in the *call site* (`history-list.tsx` setting `prevId = historyItems[index+1]`), which is what changed. The diff engine itself required zero modification.

When `previousContent` is `undefined` (view-only mode, or "Current" with no comparison selected), `HistoryEditor` falls back to its existing plain-render branch — no new prop was needed for "View this revision".

## Restore flow (sequence)

```
User clicks "Restore" → confirm modal (unchanged UX)
  → POST /pages/history/restore { historyId }
    → PageController.restorePageHistory()
        - load history row, load live page
        - CASL check: ability.cannot(Edit, Page) → 403
        - pageAccessService.validateCanEdit()
        - PageHistoryService.restore(historyId, user)
            1. pageHistoryRepo.saveHistory(page)        // snapshot BEFORE overwrite
            2. pageService.update(page, { content: history.content,
                                           title: history.title,
                                           operation: 'replace',
                                           format: 'json' }, user)
               → goes through the same Yjs collaboration path as a normal edit,
                 so connected clients receive the update live (no manual
                 editor.setContent() needed on the frontend anymore)
```

Compare with the old flow: `useHistoryRestore` used to call `mainEditor.chain().setContent(...)` directly on the client with **no backend call at all**. The new flow makes restore atomic and server-authoritative.
