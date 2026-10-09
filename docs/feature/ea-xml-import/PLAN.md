# Enterprise Architect (EA) XML Import — Implementation Plan

Companion to [`SPEC.md`](./SPEC.md). Decisions in SPEC §0/§12 are locked.
Status: approved
Date: 2026-10-09

## 0. Guiding constraints

- EE feature: all real logic under `apps/server/src/ee/ea-import/` and
  `apps/client/src/ee/ea-import/`.
- Core edits limited to SPEC §6: **2 required** (server feature flag + client
  modal button); 1 optional (client service) — avoidable.
- No DB migration. No change to `integrations/import/*`.
- Synchronous v1 behind the strict budget (SPEC §5.3).

## 1. Milestones

| M | Deliverable | Demo |
|---|---|---|
| M1 | Parser + RTF converter (pure, unit-tested) | test prints page tree + HTML for the sample |
| M2 | Server EE module + endpoint | `POST /pages/import-ea` creates the 6 pages from `TN_11.tmp.xml` |
| M3 | Client button + feature gating | button visible/licensed, imports and refreshes the tree |
| M4 | Hardening/security + docs | malformed/oversized input, warnings UX, docs |

## 2. Work breakdown

### M1 — Parsing core (no Nest)

1. `ee/ea-import/types/ea-import.types.ts`
   - `EaDocumentPayload`, `EaDiagram`, `EaPackageNode`
     `{ id, name, parentId, order, documents, diagrams, lanes, activities, edges, children }`,
     `EaParseResult { roots; warnings }`.

2. `ee/ea-import/ea-xmi.parser.ts`
   - Decode Buffer via XML declaration encoding using `iconv-lite`
     (`windows-1252`; plain `latin1` is wrong at `0x80–0x9F`).
   - **Reject `<!DOCTYPE`/`<!ENTITY`** before parsing.
   - Parse with `fast-xml-parser` (add as a direct dependency; currently only
     transitive).
   - Recursively collect packages/elements; link parents via `parent`/`EAPK_*`
     and/or containment; sibling order by leading name integer → `tpos` → doc
     order.
   - Ignore `EARootClass`, `UML:Collaboration`/`ClassifierRole`.
   - Read `modeldocument` from any element; base64 → in-memory unzip with `yauzl`
     (`fromBuffer`, `validateEntrySizes:true`, single `str.dat` entry, budget
     `max(compressed×10, 8MB)` / abs 16 MB) → validate base64 charset/length
     first.
   - Collect flow data (`ActivityPartition` lanes vs `Activity` steps,
     `InputData`, `DataAssociation` client/supplier) and diagram
     names/`subject`/`ImageID`/`SOID`/`EOID`.
   - On any single-document failure: push a warning, continue (never throw).

3. `ee/ea-import/ea-bpmn.parser.ts` / `ee/ea-import/ea-native.parser.ts`
   - `ea-bpmn.parser.ts`: `<bpmn:definitions>` → one root per `bpmn:process`
     (lanes, flow nodes, `sequenceFlow`, `BPMNDiagram`).
   - `ea-native.parser.ts`: EA **native table XML** (`<Package>` +
     `t_package`/`t_object`/`t_connector`/`t_diagram`/`t_diagramobjects`/
     `t_document`/`t_xref`) → the same `EaPackageNode[]`: packages by
     `PACKAGE_ID`/`PARENT_ID`, lanes (`ActivityPartition`), steps
     (`Activity`/`Class`), edges (`t_connector`), Model Documents
     (`t_document.BINCONTENT` → base64 ZIP → `str.dat` RTF, owner from the
     `DOCNAME` path) and diagrams (`t_diagram` + `t_diagramobjects`).
   - `ea-xml.util.ts` holds the shared hardened parser + node helpers;
     `isEaNativeDocument`/`isBpmnDocument` route in `parseDocument`.

4. `ee/ea-import/rtf-to-html.ts`
   - Tokenizer for control words/groups/text; `\uN` decimal (negative →
     `+65536`) with exactly-one-fallback skip; `\'hh` fallback decode.
   - Escapes `\\ \{ \} \~ \- \tab`; `\par`/`\plain`/`\pard`; `\b \i \ul`
     (defensive); align/indent ignored safely.
   - Heading heuristic: whole-paragraph bold + `^\d+(\.\d+)*\.?\s` → `h1..h6`
     (bare `\sN` mapping is a no-op in this template).
   - Tables: `\trowd`/`\cellx`/`\intbl`/`\cell`/`\row` → `<table>`.
   - Drop `\pict`/`\object`/`\htmltag`; escape all text; whitelist output tags.
   - `rtfToHtml(rtf: string): string`; on exception return a safe stub marker.

5. Tests:
   - `ea-xmi.parser.spec.ts`: trimmed fixture (not the 383 KB sample) → 1 root,
     5 children, 3 documents, 2 wireframe diagrams, `tpos` order; plus XXE
     (`<!DOCTYPE`) rejection + malformed-base64 stub.
   - `ea-bpmn.parser.spec.ts`: detection + one page per `bpmn:process` (lanes,
     activities, sequence flows, diagrams); empty definitions → no pages.
   - `ea-native.parser.spec.ts`: trimmed table fixture → package tree (ordered
     by `TPOS`), lane membership, activities/classes, connectors, diagrams and
     a Model Document (owner resolved from `DOCNAME`); detection excludes
     XMI/BPMN.
   - `rtf-to-html.spec.ts`: headings (bold numbered), paragraphs, a table,
     Vietnamese `\uNNNN` round-trip (`Theo dõi`, `Dữ liệu đầu vào`), script
     escaping (`<script>` in text stays inert).

**Verification:** one-off script/test decodes the real sample and prints HTML;
visually confirm Vietnamese + tables.

### M2 — Server EE module + endpoint

5. `ee/ea-import/dto/ea-import.dto.ts` — `spaceId` validation.
6. `ee/ea-import/ea-import.service.ts`
   - `importEaXml({ file, userId, spaceId, workspaceId })`.
   - Enforce budget (SPEC §5.3) before heavy work → `413`/`422`.
   - Build pages: container(s) + children; synthesize flow/UI content with a
     **provenance callout**; concat RTF docs per package; strip a duplicate
     leading heading so `extractTitleAndRemoveHeading` doesn't double-H1.
   - Titles per SPEC §3.9 (root strips `GS_01:` prefix, kept as caption; children
     keep numeric prefixes; NFC-normalize; preserve diacritics).
   - Run `importService.processHTML` / `extractTitleAndRemoveHeading` /
     `createYdoc` for all pages **before** the tx.
   - One insert-only `executeTx`: roots, then children level-by-level;
     `nextPagePosition(spaceId, parentId, trx)` per insertion.
   - After commit: `eventEmitter.emit(EventName.PAGE_CREATED, { pageIds,
     workspaceId })`; one `auditService.log(PAGE_IMPORTED)`.
   - Return `{ pageIds, rootPageIds, pageCount, warnings }`.
7. `ee/ea-import/ea-import.controller.ts`
   - `@UseGuards(JwtAuthGuard) @Controller('pages')`.
   - `@Post('import-ea') @RequireFeature(Feature.EA_IMPORT)`.
   - `@UseInterceptors(FileInterceptor)`; validate `.xml`/`.xmi`; `fields:1
     files:1`; size limit from `environmentService.getFileImportSizeLimit()`
     (bounded to the 10 MB EA budget).
   - `spaceAbility.createForUser(...)` must allow `Edit/Page` else 403.
8. `ee/ea-import/ea-import.module.ts`
   - `imports: [ImportModule, PageModule, CaslModule]`,
     `providers: [EaImportService]`, `controllers: [EaImportController]`.

### M3 — Core wiring + client

9. `apps/server/src/common/features.ts` → `EA_IMPORT: 'import:ea'`.
10. `apps/server/src/ee/ee.module.ts` → import + register `EaImportModule`
    (imports only; no export needed).
11. `apps/client/src/ee/features.ts` → `EA_IMPORT: 'import:ea'`.
12. `apps/client/src/ee/ea-import/services/ea-import-service.ts`
    → `importEaXml(file, spaceId)`.
13. `apps/client/src/features/page/components/page-import-modal.tsx`
    → **"Enterprise Architect (XML)"** button in the existing `SimpleGrid`,
    `accept=".xml,.xmi"`, gated by `useHasFeature(Feature.EA_IMPORT)` +
    `useUpgradeLabel()`; on success refetch sidebar + emit
    `refetchRootTreeNodeEvent`; on `warnings.length > 0` show a yellow warning
    notification, `pageCount===0` red error.

### M4 — Hardening & docs

14. Edge cases: empty/multi-root XMI, nested packages, multiple documents/pkg,
    missing `modeldocument`, non-RTF payload, malformed base64, over-budget.
15. Security: XXE/DTD rejection, ZIP bounds, RTF→HTML escaping, block
    `javascript:`/`file:` links; add tests.
16. Docs: keep SPEC/PLAN as the feature docs; note wireframe limitation +
    alternatives (EA HTML report / Save-as-image).
17. Manual QA matrix: sample file; two-root file; no-document file;
    over-budget file; non-XML file; unlicensed workspace; partial-conversion
    warning.

## 3. Test plan

- Unit: parser (incl. XXE, malformed payload), RTF→HTML (incl. escaping).
- Service: assert tree/page count, parent linking, position ordering, budget
  rejection, transaction ordering, PAGE_CREATED after commit, single audit row,
  warnings for stubbed documents.
- E2E/manual: upload the sample → 1 container + 5 children, correct Vietnamese,
  tables render, tree refreshes; verify generated flow/UI pages carry the
  provenance callout.

## 4. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| RTF subset broader than observed (fields, nested tables, images) | content loss | scope v1; stub + warning; Phase 2 |
| Event-loop block / memory blowup on large XMI | server-wide stall/OOM | §5.3 budget (10 MB / 100 pages / 32 MB RTF); Phase 2 async |
| XXE / billion laughs | RCE/DoS | reject DOCTYPE/ENTITY; hardened `fast-xml-parser`; ZIP bounds |
| HTML/JS injection via RTF text | XSS | escape + whitelist tags; downstream `processHTML` does NOT sanitize |
| Diagram images absent from XMI | user disappointment | documented + UI callout + export alternatives |
| Core drift | maintenance | 2 required core edits; rest under `ee/` |

## 5. Phase 2 (implemented)

- **Async**: EE-owned BullMQ queue `{ea-import-queue}` (`ea-import.constants.ts`,
  `ea-import.processor.ts`) + `file_tasks` row (source `ea`) + existing
  `POST /file-tasks/info` polling — file limit raised to **30 MB**. See SPEC §5.3.
- **Idempotent re-import with Replace / Keep both / Skip**: `ea-import.util.ts`
  `eaRootSignature`; the worker detects a re-import when a successful
  `file_tasks` row with the same root signature exists in the space and sets
  `metadata.skipped` + `metadata.duplicate`. The client shows a **Replace /
  Keep both / Skip** dialog; Replace (`mode=replace`) imports the fresh tree and
  force-deletes the previous one (clearing the old task's signature), Keep both
  (`mode=keep`) imports an additional copy alongside it.
- **RTF `\pict` → attachments**: `rtf-to-html.ts` pict pre-pass +
  `eaRtfImagePlaceholder`; `decodeModelDocument`/`buildDocumentsHtml` take an
  image sink; the service uploads via `EaAttachmentService` and inlines.
- **EA HTML-report ingestion**: `ea-asset.util.ts` `inspectEaArchive`;
  `ea-html-report.service.ts` imports `.htm`/`.html` report zips (no XMI) as a
  container + one child page per report page, images via
  `ImportAttachmentService`. Best-effort (flat, no idempotency, untested against
  a real EA report).
- **Performance**: `rtf-to-html.ts` hot loops rewritten around `charCodeAt`
  (+ no-pict fast path); Model Documents converted in parallel across a
  `worker_threads` pool (`ea-convert.pool.ts` + `ea-convert.worker.ts`, env
  `EA_IMPORT_CONVERT_CONCURRENCY`, inline fallback) with an up-front size
  pre-scan. ~7× total on the `NKHQ_QLTKQT.xml` sample (see SPEC §5.4).

## 6. Out of scope (v1)

- RTF inline images (`\pict`) → attachments.
- Incremental re-import / update.
- Async queue + progress polling.
- Importing EA `.qea`/`.eap` repositories.

## 7. Wireframe / diagram images (implemented)

See SPEC §13. Delivered in the same EE module:

- **Native XML**: `t_image.IMAGE` (base64 PNG/JPEG) is decoded and attached as
  `EaDiagram.embeddedImage` — wireframe images import automatically, no ZIP.
- `.zip` input containing the XMI + an EA `Images/` folder (files named by
  diagram `xmi:id`); plus a best-effort scan for base64 images embedded in a
  `UML:Diagram`.
- `ea-asset.util.ts` (`isZipBuffer`, `normalizeAssetKey`, `sniffImageMime`,
  `imageExtForMime`, `extractEaZip`, `resolveImageForDiagram`).
- `ea-attachment.service.ts` (`uploadImage` → storage + `attachments` row +
  `<img>` HTML, same pipeline as the ZIP import).
- Parser records `EaDiagram.diagramId`; builders embed matched/embedded images
  (and only show the "not embedded" callout when a diagram has no image).
- Client accepts `.xml/.xmi/.zip`.
