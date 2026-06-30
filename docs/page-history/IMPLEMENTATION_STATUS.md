# Implementation Status

## Done

- [x] Migration `content_hash` column on `page_history` (fixed ordering issue after first deploy attempt)
- [x] Server: auto SHA-256 hash on every history insert (`page-history.repo.ts`)
- [x] Server: `POST /pages/history/restore` endpoint, CASL-protected, force-snapshots before overwrite
- [x] Server: `tsc --noEmit` clean
- [x] Client: hash badge + "Current version" row + action menu in `HistoryItem`
- [x] Client: arbitrary-pair compare (pick mode), "View this revision" (no-diff render), "Compare with current"
- [x] Client: visible feedback for compare-pick mode (banner + outlined source/target rows) — fixes the gap where the feature existed in state but had no UI affordance to discover/use it
- [x] Client: "Comparing X → Y" sticky label in the diff pane so both sides of an arbitrary comparison are always visible
- [x] Client: `useHistoryRestore` now calls the backend instead of mutating the editor directly
- [x] Client: header hash chip — `useLatestPageHistoryHash` (lightweight, `limit: 1`, no content payload) + Badge in `page-header-menu.tsx` next to Share, click opens History modal
- [x] Client: history list redesigned as a vertical timeline (Notion/Git-style) grouped by calendar day — date group headers, connecting rail + dot per revision (filled blue when active), `CURRENT` badge, hash chip, avatar/contributor row, italic "Add note..." placeholder on the Current row (display-only — no backend persistence for notes was implemented, see Open Questions)
- [x] Client: `tsc --noEmit` clean
- [x] Client: side-by-side diff mode — new `HistoryEditorSideBySide` component (two read-only panes: old revision with deletions highlighted in place on the left, new revision with additions highlighted in place on the right), `SegmentedControl` toggle ("Inline" / "Side by side") in `history-modal-body.tsx`, new `diffViewModeAtom`. Reuses the exact same `recreateTransform()`/`ChangeSet` diff computation as the inline view — only the decoration placement differs (no widget-injection trick needed since each side renders its own native document)
- [x] GitNexus `detect_changes` vs `HEAD` (this session's uncommitted edits only): 4 files / 2 symbols, **risk level: low**, 0 affected processes
- [x] GitNexus `detect_changes` vs `main` (full cumulative branch diff, includes prior committed work from commit `9ff9b99e`): 42 files, **risk level: high**, 12 affected processes — expected for a full feature branch vs `main`, not a regression introduced this session; re-run this comparison again before the final PR to confirm nothing unexpected crept in

## Known issue fixed post-implementation

The first migration filename (`20260701T000000-...`) collided with the alphabetical-ordering requirement of Kysely's migrator on an environment where two other `20260701T*` migrations (`T000001` azure-ad-user-groups, `T000002` minio-attachment-schema) were already applied. Renamed to `20260701T000003-...`. **No data was affected** — the failure happened at app boot, before any migration ran.

## Not done yet (requires manual QA — cannot be verified by static analysis alone)

- [ ] Manual run through dev server: open History panel, confirm hash badges render
- [ ] Confirm "Current" row appears at top, is excluded from Restore, can be used as a compare target
- [ ] Compare two non-adjacent revisions and visually confirm diff highlighting is correct
- [ ] Restore test: make an edit, restore immediately (before debounce queue would fire), verify pre-restore content was snapshotted in `page_history`
- [ ] Permission test: Reader role gets 403 on restore but can still view/compare
- [ ] i18n: new UI strings ("Current version", "View this revision", "Compare with current", "Compare with...", "Failed to restore version") were added as plain `t()` calls; this codebase appears to rely on key-as-fallback i18n (no separate `en/translation.json` found), consistent with how other recently-added strings in this feature were handled — but worth double-checking if the project later adds a strict translation-key linter.

## Open questions for follow-up (not blocking, out of original scope)

- Backfill: old `page_history` rows have `content_hash = NULL`. Currently the UI just omits the badge for those rows. A backfill migration could compute hashes for existing rows if desired later.
- `version` column remains unused/legacy — out of scope for this change, not touched.
- The "Add note..." placeholder on the Current row is **visual only**, matching the reference design — there is no notes feature, no API, no storage. If a real notes-on-revision feature is wanted later, it needs its own column/table and endpoint; out of scope here.
- The header hash chip shows the **most recently saved** `page_history.contentHash`, not a hash of the live unsaved editor buffer — by design, since hashing live content on every keystroke client-side would be wasteful and the reference screenshot's chip also reads as a "last commit" indicator, not a live diff.
- Date-group headers ("JUNE 27") omit the year. Acceptable for now since `page_history` rows are typically recent; revisit if cross-year history browsing becomes common.
