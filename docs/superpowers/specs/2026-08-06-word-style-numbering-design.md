# Word-style multilevel numbering

## Problem

The editor currently uses TipTap's default `OrderedList`/`ListItem` (from `@tiptap/starter-kit`) with no configurable multilevel numbering, and headings (`packages/editor-ext/src/lib/heading/heading.ts`, levels 1–10) render as plain text with no outline numbers. Users want Word-like "multilevel list" behavior:

- Ordered lists numbered per nesting level (minimum 10 levels), with a user-chosen format per level (e.g. `1.`, `1.1.`, `a)`, `i.`).
- Headings optionally auto-numbered as an outline (`1.`, `1.1.`, `1.1.1.`) driven by heading level, using the same per-level format configuration.
- Both features share one 10-level numbering definition per page.
- Users can restart numbering at a specific list item or heading.
- Numbering must be preserved in DOCX and PDF export, not just the live editor.

This is an EE feature (gated by license, like SSO/Bases/Audit), scoped per page, and must follow the fork's Golden Rule: all logic lives under `ee/`, core files get only mechanical hook-ins.

## Non-goals

- Word's full "list style" reuse-across-documents system — one numbering definition per page is sufficient for v1.
- Numbering across multiple pages (e.g. auto-numbering that continues from a parent page into subpages).
- Markdown export numbering (Markdown has no native multilevel numbering; out of scope — copy-as-markdown keeps current behavior).
- Per-list-instance format overrides — all ordered lists and headings on a page share the single page-level definition.

## Data model

New nullable JSONB column `numberingSettings` on the `pages` table (migration under `apps/server/src/database/migrations`, follows the pattern of existing nullable page columns like `icon`/`coverPhoto`). `null` means numbering is off and preserves current behavior exactly.

```ts
type NumberingLevelFormat =
  | "decimal"
  | "lowerRoman"
  | "upperRoman"
  | "lowerLetter"
  | "upperLetter"
  | "bullet";

interface NumberingLevelConfig {
  format: NumberingLevelFormat;
  // Word-style pattern using %1.."%10 placeholders referencing the counter
  // value at that ancestor level, e.g. "%1.%2." -> "1.1.", "(%3)" -> "(a)".
  // For "bullet" format, `text` is the literal bullet glyph (e.g. "●").
  text: string;
}

interface NumberingSettings {
  enabled: boolean;
  linkHeadingsToNumbering: boolean;
  levels: [
    NumberingLevelConfig, NumberingLevelConfig, NumberingLevelConfig,
    NumberingLevelConfig, NumberingLevelConfig, NumberingLevelConfig,
    NumberingLevelConfig, NumberingLevelConfig, NumberingLevelConfig,
    NumberingLevelConfig,
  ]; // exactly 10 entries, index 0 = level 1
}
```

`GET /pages/:id` and page repo selects include `numberingSettings`. A dedicated `POST /pages/:pageId/numbering-settings` endpoint (mirrors the shape of other page-scoped EE action endpoints, e.g. page permissions) updates it, rather than overloading the general page-update DTO. Default value shipped in the UI when a user first enables numbering: all 10 levels `format: "decimal"`, with cumulative patterns `"%1."`, `"%1.%2."`, ... `"%1.%2.%3.%4.%5.%6.%7.%8.%9.%10."` (the most common Word default).

## Shared numbering engine

New package module `packages/editor-ext/src/lib/numbering/` (plain TS, no framework deps) exporting:

- `buildCounterCss(settings: NumberingSettings, opts: { headings: boolean }): string` — generates a `<style>` string with `counter-reset`/`counter-increment`/`content` rules for `.numbered-list` and `.numbered-heading` classes, parameterized by the 10 level configs. Used by both the main editor and the PDF-render view.
- `resolveLevelFormat(format: NumberingLevelFormat): { cssListStyle?: string, isText: boolean }` — maps our format enum to CSS `list-style-type`/counter formatting keywords (`decimal`, `lower-roman`, `upper-roman`, `lower-alpha`, `upper-alpha`) or bullet glyph.
- `buildDocxLevels(settings: NumberingSettings): ILevelsOptions[]` — maps the same config to the `docx` package's `LevelFormat` enum + `text` pattern (extends the existing `packages/editor-ext/src/lib/prosemirror-docx/numbering.ts`, replacing its two hardcoded presets with a generator driven by `NumberingSettings`).

This keeps format-mapping logic in exactly one place instead of duplicating it between CSS generation and DOCX generation.

## Editor implementation

Numbers are **not** stored in node content or node attrs as literal digits — only a boolean `restart` attr is stored, and actual numbers are computed live via CSS counters. Rationale: this makes numbering self-healing across inserts/deletes/reorders/collaborative edits with zero custom sync logic, matching how Word visually renumbers as you type.

- `apps/client/src/ee/numbering/extensions/numbered-ordered-list.ts`: extends TipTap's `OrderedList` (from `@tiptap/starter-kit`) to add a `restart: boolean` attr and a `numbered-list` HTML class; nesting level is derived from ancestor `orderedList`/`bulletList` depth at render time (existing TipTap node structure already nests these), no new attr needed for level.
- `apps/client/src/ee/numbering/extensions/numbered-heading.ts`: extends the existing `Heading` (`packages/editor-ext/src/lib/heading/heading.ts`) to add a `restart: boolean` attr and a `numbered-heading` class, active only when `linkHeadingsToNumbering` is true.
- `apps/client/src/ee/numbering/hooks/use-numbering-style.ts`: reads `page.numberingSettings`, calls `buildCounterCss`, injects/updates a `<style>` tag scoped to the editor container (mirrors how other dynamic-style EE features work, e.g. theme injection) whenever settings change.
- Restart UI: a toolbar/bubble-menu button ("Restart numbering here") that toggles the `restart` attr on the currently selected `orderedList`/`heading` node.
- **Level navigation (Tab/Shift-Tab)**: `@tiptap/extension-list`'s `ListItem` already binds `Tab` → `sinkListItem` and `Shift-Tab` → `liftListItem`, which nest/unnest the current item into a child `orderedList` (standard TipTap behavior, unrelated to this feature). Since our CSS counters key off `orderedList` nesting depth, this means pressing Tab on a `1.` item already turns it into `1.1.` with zero new code — `numbered-ordered-list.ts` must not override or remove this default keymap when extending `OrderedList`/`ListItem`. This applies to ordered lists only; heading level changes continue to use the existing mechanism (slash command / `Ctrl+Alt+1..0`) and are not affected by Tab.

Core wiring (mechanical only):
- `apps/client/src/features/editor/extensions/extensions.ts`: import `NumberedOrderedList`, `NumberedHeading` from `@/ee/numbering` and swap them in for the current `StarterKit` ordered list default / existing `Heading` import, gated by `useHasFeature`/settings being present. One import + list-entry change, no branching logic added inline (the conditional lives inside the `ee/numbering` extension itself, e.g. it no-ops when `numberingSettings` is absent).
- `page-header-menu.tsx`: one import + one `<Menu.Item>` for `NumberingSettingsMenuItem` from `@/ee/numbering`, following the exact pattern of `PageVerificationMenuItem`.

## Configuration UI

`apps/client/src/ee/numbering/components/numbering-settings-modal.tsx`, opened from the page action menu (same trigger pattern as `PageShareModal`/`PageVerificationModal`). Contents:

- Enable/disable switch.
- "Link headings to numbering" switch.
- A 10-row list (level 1–10), each row: format `Select` (decimal/roman upper/roman lower/letter upper/letter lower/bullet) + pattern `TextInput` (e.g. `%1.%2.`) with a live preview of that level's rendered number.
- Save button calls a mutation (`useUpdatePageNumberingMutation`) that PATCHes the page.

## Feature gating

Add `NUMBERING: 'page:numbering'` to the `Feature` enum in `apps/server/src/common/features.ts` and the client mirror `apps/client/src/ee/features.ts`. Gate:
- The menu item and modal (`useHasFeature(Feature.NUMBERING)`).
- The server endpoint that updates `numberingSettings` (licence guard, same pattern as other EE endpoints).
- Rendering: if a workspace loses the license after numbering was configured, `numberingSettings` stays in the DB but the client extensions treat it as inert (feature flag off wins over stored settings), so content doesn't visually break — no destructive migration needed on license expiry.

## Export

- **DOCX** (`apps/server/src/ee/docx-export`): pass `page.numberingSettings` into the `prosemirror-docx` serializer options; when present, call `buildDocxLevels` to register a `docx` `Numbering` reference used by ordered-list and (if linked) heading paragraph styles, replacing the current hardcoded `numbered`/`bullets` presets in `numbering.ts`. When `numberingSettings` is null, fall back to the existing hardcoded presets unchanged (no behavior change for pages that don't use this feature).
- **PDF** (`apps/server/src/ee/pdf-export`): `getRenderPayload` includes `numberingSettings` in its response; the PDF-render client route applies the same `ee/numbering` extensions/CSS as the main editor, so the headless-browser-rendered PDF matches the editor visually. No separate PDF-specific numbering code needed.
- **Markdown copy/export**: unchanged (non-goal).

## Restart numbering semantics

`restart: true` on an `orderedList` or `heading` node triggers `counter-reset` for that node's level (and implicitly all descendant levels reset to their configured start, matching Word's behavior of resetting subordinate levels when a parent restarts). Only one explicit user action: toggle "Restart numbering here" on the node under the cursor; there's no separate "continue numbering" control needed since continuation is the default (CSS counters only reset where explicitly told to).

## Testing

- `packages/editor-ext`: unit tests for `buildCounterCss` (given a settings object, produces the expected `counter-reset`/`content` rules) and `buildDocxLevels` (given settings, produces expected `ILevelsOptions`), plus a test that `numbering.ts`'s existing hardcoded presets remain byte-identical when `numberingSettings` is null (regression guard for existing DOCX export tests).
- `apps/client`: component test for `numbering-settings-modal` (save round-trip, 10-row validation), and a test that `NumberedHeading`/`NumberedOrderedList` no-op (render exactly like the upstream extensions) when the feature is off or settings are null.
- `apps/server`: e2e test for the `numberingSettings` PATCH endpoint (licence-gated 403 when feature disabled), and a DOCX export snapshot test with a custom `numberingSettings` producing the expected `numbering.xml` levels.
- Manual verification: enable numbering on a page with nested ordered lists + headings across all 10 levels, confirm live renumbering on insert/delete/reorder, confirm "restart here" resets correctly, confirm DOCX export opens in Word with matching numbers, confirm PDF export (Print PDF / export-to-PDF) matches editor.
