# Manual QA Checklist

Run `node .gitnexus/run.cjs analyze` first if the index is stale, then start the dev server.

## Hash tags

- [ ] Edit a page 3-4 times (enough to generate several `page_history` rows)
- [ ] Open History panel → each real revision shows a monospace badge (8 hex chars)
- [ ] Two revisions with identical content show the same hash
- [ ] Old rows (created before this change) show no badge, no crash

## Current marker

- [ ] "Current version" row appears at the very top of the list, visually distinct (icon + label, no timestamp)
- [ ] Clicking it shows the live editor content (matches what's on screen)
- [ ] It does NOT have a hash badge
- [ ] The action menu (⋮) does NOT appear on the Current row
- [ ] Restore button is disabled when Current is the active selection

## View this revision

- [ ] Open menu on any real revision → "View this revision"
- [ ] Content renders with NO diff highlighting (plain read-only render)
- [ ] Selecting a different revision afterwards correctly returns to diff mode

## Compare arbitrary revisions

- [ ] Open menu on revision A → "Compare with current" → diff renders against live editor content
- [ ] Open menu on revision A → "Compare with..." → click on a non-adjacent revision B → diff renders between A and B (not A and its immediate predecessor)
- [ ] Add/delete counts in the bottom toolbar match a manual eyeball diff of A vs B
- [ ] Diff navigation (prev/next change buttons) still scrolls correctly for an arbitrary-pair diff

## Restore safety

- [ ] Make an edit, restore to an OLDER version **immediately** (faster than the debounce queue would normally auto-save)
- [ ] After restore, reopen History — confirm a new row exists with the pre-restore content (i.e. nothing was lost)
- [ ] Confirm the live page now shows the restored content
- [ ] Confirm connected clients (open the same page in a second browser/tab) see the restored content live via collaboration sync

## Permissions

- [ ] As a Reader-role user: History panel viewable, Restore button absent/disabled, direct API call to `/pages/history/restore` returns 403
- [ ] As a Writer/Admin: Restore works end-to-end

## Regression

- [ ] Existing adjacent-revision diff (default click on a list item) still looks the same as before this change
- [ ] Mobile history modal (`history-modal-mobile.tsx`) still opens and behaves correctly — it reuses the same atoms/components, no direct changes were made to it, but verify nothing broke
