# Enterprise Architect (EA) XML Import — Specification

Status: approved (pending sign-off on §12 Q4 budget)
Date: 2026-10-09
Scope: Enterprise Edition (EE) feature, `Feature.EA_IMPORT`

## 0. Expert panel decisions (locked)

A four-expert review (EA/XMI content, Docmost architecture, product/UX,
reliability/security) resolved the earlier open questions:

| # | Decision | Confidence |
|---|---|---|
| Q1 | Keep the exported root package as a **container page**; sections are children. | unanimous |
| Q2 | **Always create** every package page; synthesize honest content for flow/UI with a provenance callout — never skip. | unanimous |
| Q3 | **Structured list is primary**; append a Mermaid block only when all connectors resolve unambiguously, else omit. | unanimous |
| Q4 | **Synchronous v1 behind a strict fast-path budget** (≤10 MB file, ≤100 pages, ≤32 MB decoded RTF, ≤16 MB single doc). Reject over budget with `413`/`422`. Async is Phase 2. | split — see §5.3 |
| Q5 | **Hand-roll** the RTF→HTML subset in pure TS. No third-party RTF library. | unanimous |
| Wireframes | Images are **not recoverable** from the XMI. Surface alternatives (EA HTML report / Save-as-image). | unanimous |

## 1. Summary

Import an **Enterprise Architect XMI export** (`.xml`/`.xmi`) into Docmost. One
XML file is one exported **package/topic** containing sub-packages; each
sub-package becomes a Docmost page, preserving the package hierarchy. The feature
lives entirely under `ee/` and touches only a minimal set of core files. EA
**BPMN 2.0** exports (`<bpmn:definitions>`) are also accepted and mapped to one
page per `bpmn:process` (see §2.4). EA's **native XML** package export
(database-shaped `<Package>/<Table name="t_*">`, see §2.5) is accepted too.

Sample analyzed: `TN_11.tmp.xml` (EA XMI 1.1, exporter "Enterprise Architect
2.5", encoding `windows-1252`, 383 KB).

## 2. Sample analysis (grounded in `TN_11.tmp.xml`)

### 2.1 Document envelope

```
<XMI xmi.version="1.1" xmlns:UML="omg.org/UML1.3">
  <XMI.content>
    <UML:Model name="EA Model" xmi.id="MX_EAID_...">
      <UML:Namespace.ownedElement>
        <UML:Class name="EARootClass" .../>                    <!-- EA root marker, ignore -->
        <UML:Package name="GS_01:Theo dõi ...">                <!-- exported root package = 1 topic -->
          <UML:Collaboration name="Collaborations">...</UML:Collaboration>   <!-- index duplicate, ignore -->
          <UML:Package name="1. Mô tả chi tiết"> ... </UML:Package>
          <UML:Package name="2. Luồng màn hình"> ... </UML:Package>
          <UML:Package name="3. Giao diện"> ... </UML:Package>
          <UML:Package name="4. Dữ liệu đầu vào"> ... </UML:Package>
          <UML:Package name="5. Dữ liệu đầu ra"> ... </UML:Package>
        </UML:Package>
      </UML:Namespace.ownedElement>
    </UML:Model>
    <UML:Diagram name="2. Luồng màn hình" owner="EAPK_...">...</UML:Diagram>
    <UML:Diagram name="3.1. MH Tìm kiếm" owner="EAPK_...">...</UML:Diagram>
    ...
  </XMI.content>
</XMI>
```

Observed counts in the sample:

| Item | Count |
|---|---|
| `UML:Package` | 6 (1 root + 5 sections, `tpos` 1..5) |
| `Document` artifacts with `modeldocument` payload | 3 (in packages 1, 4, 5) |
| `ActivityModel` / `Activity` / `Lane` + `DataAssociation` dependencies | package 2 |
| Wireframe `CustomDiagram` | 2 (package 3) |
| Embedded image binaries (`UML:Image`) | **0** |

### 2.2 Rich document payload (the important part)

EA stores "Model Document" content as a `<UML:TaggedValue tag="modeldocument">`
whose text is **base64 of a ZIP** containing a single `str.dat`, which is **RTF**:

- Header: `{\rtf1\ansi\deflang3081\ftnbj\uc1\deff0 ...`
- ~1.8 MB each, but only **~4% is body** (74 KB / 95 KB / 36 KB); ~96% is
  `fonttbl` + a 236-style stylesheet + list/colour tables.
- Body control-word set is small and stable (57–64 distinct words). Notably:
  - `\pict` = 0 (no images), `\pn`/`\listtext` = 0 (**no real lists** — bullets
    are literal `- ` text), `\ul` = 0, `\line` = 0, `\sect` = 0.
  - Present: `\b`, `\i` (one doc), `\par`, `\pard`, `\plain`, align
    `\ql/\qc/\qj`, indents `\li/\sa/\sb/\sl/\slmult`, `\tab`, `\u`, and table
    structure `\trowd \trgaph \trleft \trrh \tblind \trpadd* \cellx
    \clvertalt|c \clbrdr* \clcbpat \intbl \cell \row \trhdr \lastrow`.
  - Bodies reference only `\s0`; the 236 heading styles are **unused**. Headings
    are **bold, numbered paragraphs** (`1.`, `4.1.`, `4.1.1.`), so `\sN→hN`
    mapping is a no-op and headings must be detected heuristically.
- Vietnamese is stored as `\uNNNN` (decimal unicode) **with a trailing `\'hh`
  fallback**, e.g. `\u245 \'f5` → `õ`, `\u7921 \'3f` → `ự`. `\uNNNN` is the
  source of truth; skip exactly one `\uc1` fallback token.

### 2.3 Flow and UI packages

- **Package 2 (flow)** has no RTF. `UML:StateMachine.transitions` is empty; order
  lives in the `CollaborationDiagram` geometry + four `UML:Dependency`
  (`stereotype="DataAssociation"`) `client`/`supplier` links, which map cleanly
  to a linear chain. Nodes = `ActionState` (`ea_stype=Activity`, plus one
  `ActivityPartition`/`Lane` which must not be counted as a step) and
  `UML:Class` (`stereotype="InputData"`).
- **Package 3 (UI)** has no RTF. Two `CustomDiagram` wireframes whose
  `UML:DiagramElement` carries only an integer `ImageID`
  (`2000954772`, `144733693`) and a `subject` → an **unnamed `Boundary`
  ClassifierRole**. The PNG bytes live in EA's `.qea/.eap` image table, which XMI
  export omits (`UML:Image` = 0). **Verdict: not recoverable from this file.**

### 2.4 BPMN 2.0 exports (`.xml`)

EA can also publish a package as **BPMN 2.0 XML** (root `<bpmn:definitions>`)
rather than an XMI/UML model. This is a distinct schema, detected by the parser
(`isBpmnDocument`) and routed to a dedicated parser (`ea-bpmn.parser.ts`).

- Each `bpmn:process` becomes **one root page** (BPMN has no packages). The page
  name comes from the process `name`, else the owning `bpmn:participant` name,
  else the definitions `name`.
- `bpmn:laneSet`/`bpmn:lane` + `flowNodeRef` → lanes and lane membership.
- Flow nodes (`task`/`userTask`/…/`startEvent`/`endEvent`/gateways/`subProcess`)
  → ordered steps; `bpmn:sequenceFlow` (`sourceRef`/`targetRef`/`name`) → edges.
- Content is synthesized with the same flow builder as the XMI path
  (`buildFlowHtml`: provenance callout, lanes table, step list, best-effort
  Mermaid). `bpmndi:BPMNDiagram`/`BPMNShape` are recorded as diagrams.
- An empty `<bpmn:definitions>` (no `bpmn:process`) yields no pages.

### 2.5 Native XML (database table) exports (`.xml`)

EA's **Export Package to XML** (not XMI) writes a database-shaped document whose
root is `<Package name="…">` and whose body is a set of `<Table name="t_*">`
rows (`t_package`, `t_object`, `t_connector`, `t_diagram`,
`t_diagramobjects`, `t_document`, `t_xref`, `t_image`). It is detected by
`isEaNativeDocument` (root `<Package>` + a `t_*` table in the first 8 KB) and
routed to `ea-native.parser.ts`, which reconstructs the same `EaPackageNode[]`
contract used by the XMI/BPMN paths:

- `t_package` rows → the page tree (`PACKAGE_ID`/`PARENT_ID`; a package whose
  `PARENT_ID` is absent is a root). Sibling order = `TPOS` → leading name
  integer → document order.
- `t_object` rows → flow elements: `ActivityPartition` → lane; `Activity`
  (and `Class`, when the package has a lane or the class is stereotyped
  `InputData`) → step. Lane membership via `PARENTID`.
- `t_connector` rows (`Dependency`, e.g. BPMN `DataAssociation`) between two
  flow elements of the same package → edges (`START_OBJECT_ID` → `END_OBJECT_ID`,
  honoring `DIRECTION`).
- `t_document.BINCONTENT` (base64 ZIP → `str.dat` RTF) → Model Document content;
  the owning package is resolved from the `DOCNAME` path (`package::doc`), and
  concatenated in `SEQUENCE` order.
- `t_diagram` (+ `t_diagramobjects`) → diagrams: `diagramId` = `DIAGRAM_ID`,
  `subjectIds` = member `OBJECT_ID`s, `imageId` from `OBJECTSTYLE`
  (`ImageID=…`). The image bytes live in **`t_image.IMAGE`**
  (`dt:dt="bin.base64"`, PNG/JPEG), which the native export *does* include:
  they are decoded, MIME-sniffed and attached as `EaDiagram.embeddedImage`, so
  wireframe pages embed the real image with no companion ZIP or HTML report
  (§13). Diagrams without an image (e.g. the synthesized BPMN flow) keep the
  name-list + limitation callout.
- `t_xref` (`NAME=Stereotypes`) resolves object stereotypes (e.g. `InputData`).

Content synthesis reuses the XMI builders (`buildDocumentsHtml`,
`buildFlowHtml`, `buildDiagramHtml`, `buildContainerHtml`), so native
exports get the same RTF→HTML, flow and diagram treatment. The BPMN flow of the
`NKHQ_QLTKQT.xml` sample is such a native export: package `2. Luồng màn hình`
(`t_diagram.DIAGRAM_TYPE=Analysis`, `MDGDgm=BPMN2.0::Business Process`) yields a
synthesized flow page from 1 lane, 59 flow nodes and 68 connectors.

## 3. Page mapping

```
GS_01:Theo dõi ... (root package)          → container page
├── 1. Mô tả chi tiết                       → child page (RTF → HTML)
├── 2. Luồng màn hình                       → child page (generated flow HTML)
├── 3. Giao diện                            → child page (generated diagram HTML + limitation note)
├── 4. Dữ liệu đầu vào                      → child page (RTF → HTML)
└── 5. Dữ liệu đầu ra                       → child page (RTF → HTML)
```

Rules:

1. Every `UML:Package` becomes a page. Parent = nearest enclosing package (via
   `parent` tagged value `EAPK_*` and/or XML containment).
2. Sibling order = leading integer of the name, fallback `tpos`, fallback
   document order.
3. A package with one or more `Document` artifacts → concatenate their RTF
   content in `tpos` order.
4. A package with an `ActivityModel` → synthesized flow HTML (§4.3).
5. A package that only owns diagrams → synthesized diagram HTML + limitation
   note (§4.3).
6. A container with no own content → short child summary paragraph.
7. `UML:Collaboration`/`ClassifierRole` index nodes are ignored.
8. Multiple roots → multiple container pages.
9. **Titles**: root title = name with the EA code prefix before the first `:`
   stripped (e.g. `GS_01:`) and preserved as a caption line inside the page;
   child titles **keep** their numeric prefixes (they encode reading order).
   Preserve Vietnamese diacritics (NFC-normalize only); never transliterate.

## 4. Content conversion

### 4.1 XMI parsing

- Decode the uploaded Buffer using the XML declaration encoding. Use
  `iconv-lite` (installed) for `windows-1252` — plain `latin1` differs at
  `0x80–0x9F`.
- Parse with **`fast-xml-parser`** (hardened: external entities throw,
  `processEntities` bounded). **Declare it as a direct dependency** — it is
  currently only transitive. `@xmldom/xmldom` is a safe alternative.
- **Reject input containing `<!DOCTYPE` / `<!ENTITY`** before parsing (EA XMI
  never needs DTDs) — cheap XXE/billion-laughs defense.
- Walk `Model/Namespace.ownedElement` recursively; index each element's tagged
  values by `tag`; read `modeldocument` wherever present — on elements **and**
  on `UML:Diagram` nodes (e.g. wireframe screen descriptions), the latter
  attached to the owning package so no document is dropped.
- Read diagrams and their `UML:DiagramElement` `subject`/`ImageID`/`SOID`/`EOID`.
- Never throw on one bad document — record a warning and continue.

### 4.2 RTF → HTML (hand-rolled, pure TS)

Required constructs (observed subset):

- Escapes: `\\`, `\{`, `\}`, `\~` (nbsp), `\-` (optional hyphen), `\tab`.
- Unicode: `\uN` decimal (negative → `+65536`), keep the glyph, skip **exactly
  one** `\uc1` fallback (`\'hh` or a single char); decode stray `\'hh` as the
  RTF code page.
- Paragraphs: `\par` → close paragraph; `\plain`/`\pard` reset formatting.
- Char formatting: `\b/\b0`, `\i/\i0`, `\ul/\ul0` (defensive; `\ul` absent in
  sample).
- Headings: heuristic — a paragraph that is entirely bold **and** matches
  `^\d+(\.\d+)*\.?\s` becomes `<h1..h6>` by dot-depth; otherwise `<p><strong>`.
- Tables: `\trowd`/`\cellx`/`\intbl`/`\cell`/`\row` → `<table><tr><td>` (no
  nested tables in sample).
- **HTML-escape every text run**; drop `\pict`/`\object`/`\htmltag` groups.
- Skip unknown control words; on unexpected input return a safe stub for that
  document rather than throwing.

Output HTML is fed to the core pipeline `ImportService.processHTML` → cheerio
`normalizeImportHtml` → `htmlToJson`, so imported pages match `md`/`html`/`docx`.

**Security note:** `processHTML`/`normalizeImportHtml` do **not** sanitize
`<script>` or `href`. The RTF→HTML layer is the security boundary: escape text,
emit only the whitelisted tags above, and block `javascript:`/`file:` URLs in
any synthesized link.

### 4.3 Flow / diagram synthesis (packages without RTF)

- **Flow**: `<h2>` + a "Lanes" table (when an `ActivityPartition` exists) + a
  deterministic ordered "Steps" `<ol>` derived from the resolved
  `DataAssociation` chain. Append a ` ```mermaid flowchart LR ` fenced block
  **only** when every `SOID`/`EOID` resolves to a known node; otherwise omit.
  Sanitize Mermaid labels (quotes/newlines).
- **UI**: `<h2>` + list of diagram names + a callout:
  "Wireframe images are not embedded in the EA export."
- **Provenance callout is mandatory** on every synthesized (non-RTF) page, e.g.
  "Tự động tạo từ sơ đồ Enterprise Architect; nội dung minh họa, không đầy đủ."
  — so generated content is never mistaken for authored text.

## 5. Architecture

Follows the established EE pattern: all logic under `ee/`; core receives only
mechanical wiring.

### 5.1 Server — `apps/server/src/ee/ea-import/`

| File | Responsibility |
|---|---|
| `ea-import.module.ts` | `imports: [ImportModule, PageModule, CaslModule]`; provides service; registers controller. |
| `ea-import.controller.ts` | `@UseGuards(JwtAuthGuard) @Controller('pages')`, `@Post('import-ea') @RequireFeature(Feature.EA_IMPORT)`, `@UseInterceptors(FileInterceptor)`, multipart limits, space ability check. |
| `ea-import.service.ts` | Orchestration: parse → build page tree → convert → insert → emit/audit. |
| `ea-xmi.parser.ts` | Pure XMI → `EaPackageNode[]` (no Nest deps). |
| `ea-bpmn.parser.ts` | Pure BPMN 2.0 XML → `EaPackageNode[]` (no Nest deps). |
| `ea-native.parser.ts` | Pure EA native table XML → `EaPackageNode[]` (no Nest deps). |
| `rtf-to-html.ts` | Pure RTF → HTML (no Nest deps). |
| `dto/ea-import.dto.ts` | Multipart field DTO. |
| `types/ea-import.types.ts` | Parser/service types. |

Wiring facts (verified):

- `ImportModule` exports `ImportService` (`processHTML`, `createYdoc`,
  `extractTitleAndRemoveHeading`); `PageModule` exports `PageService`
  (`nextPagePosition`) and must be imported explicitly (ImportModule does not
  re-export it).
- `CaslModule`, `DatabaseModule`, `EnvironmentModule`, audit modules are
  `@Global()` — no imports needed for `@InjectKysely`, `AUDIT_SERVICE`,
  `EventEmitter2`, `LicenseCheckService`.
- Registering `EaImportModule` in `EeModule.imports` is enough to activate the
  controller; exporting is **not** required.
- Use `pageService.nextPagePosition(spaceId, parentId, trx)` and insert each
  page **immediately after** computing its position (or precompute sibling keys
  with `generateJitteredKeyBetween`), never compute all positions up-front.

Page insert (same shape as `FileImportTaskService`):

```ts
const pmState = await importService.processHTML(html);
const { title, prosemirrorJson } =
  importService.extractTitleAndRemoveHeading(pmState);
const insertable: InsertablePage = {
  id, slugId: generateSlugId(), title, content: prosemirrorJson,
  textContent: jsonToText(prosemirrorJson),
  ydoc: await importService.createYdoc(prosemirrorJson),
  position: await pageService.nextPagePosition(spaceId, parentPageId, trx),
  spaceId, workspaceId, creatorId, lastUpdatedById: creatorId, parentPageId,
};
```

Ordering & side effects:

- Do all CPU/IO (decode, unzip, RTF→HTML, `processHTML`, `createYdoc`) and the
  stub/warning decisions **before** opening the transaction.
- One **insert-only** `executeTx`: roots then children level-by-level (FK).
- Emit `EventName.PAGE_CREATED` **after commit** (not inside the tx), payload
  `{ pageIds, workspaceId }`.
- One audit row `AuditEvent.PAGE_IMPORTED` on the space, metadata
  `{ source: 'ea', fileName, pageCount }`. (Per-page `PAGE_CREATED` is in
  `EXCLUDED_AUDIT_EVENTS` — don't log it.)
- Bulk insert skips `watcherService`/transclusion side effects (documented,
  consistent with the zip import).

### 5.2 Client

- `apps/client/src/ee/ea-import/services/ea-import-service.ts` —
  `importEaXml(file, spaceId)` posting multipart to `/pages/import-ea`; returns
  the `FileTask`.
- Core import modal gets a feature-gated **"Enterprise Architect (XML)"** button
  (`accept=".xml,.xmi,.zip"`) in the existing `SimpleGrid`, using
  `useHasFeature(Feature.EA_IMPORT)` + `useUpgradeLabel()` (same as DOCX/PDF).
- Flow is **asynchronous** (mirrors the ZIP import): upload → `setFileTaskId` →
  the shared polling effect calls `getFileTaskById` → on success
  `refetchQueries(["root-sidebar-pages", spaceId])` +
  `emit({ operation: "refetchRootTreeNodeEvent", spaceId })`; when
  `metadata.skipped` is set, an "already imported" notification is shown instead.

### 5.3 Processing model — asynchronous (EE BullMQ queue)

The endpoint enqueues the work on an **EE-owned BullMQ queue**
(`{ea-import-queue}`) and returns the `file_tasks` row; a worker
(`EaImportProcessor`) processes it. The client polls the existing
`POST /file-tasks/info`. This offloads the CPU-bound
parse/RTF/`processHTML`/`createYdoc` work from the request and raises the file
limit to **30 MB**.

| Guard | Limit |
|---|---|
| Uploaded file size | ≤ 30 MB |
| Pages per import | ≤ 300 |
| Total decoded RTF bytes | ≤ 96 MB |
| Single decoded document | ≤ 32 MB |
| Images | ≤ 200 / ≤ 8 MB each / ≤ 64 MB total |
| ZIP entries / uncompressed bytes | 2,000 / 64 MB |

Re-importing the same EA root package (same root signature) into the same
space is **detected**: the worker creates nothing and sets `metadata.skipped`
+ `metadata.duplicate` (plus `replacedPageIds` = the existing tree's root
pages). The client then shows a **Replace / Skip** confirm dialog:
Choose **Replace** to re-upload the same file with `replace=1` (the new tree is
imported, then the previous tree is force-deleted and the old task's signature
cleared); choose **Skip** to do nothing. Idempotency applies to the
XMI/native/HTML-report paths; the HTML-report path (§14) always creates new
pages.

## 6. Core change budget (explicit)

| # | File | Change | Required? |
|---|---|---|---|
| 1 | `apps/server/src/common/features.ts` | `+ EA_IMPORT: 'import:ea'` (needed for `FeatureKey` typing + gate) | **yes** |
| 2 | `apps/client/src/features/page/components/page-import-modal.tsx` | add the feature-gated button (no registry/extension point exists) | **yes** |
| 3 | `apps/client/src/features/page/services/page-service.ts` | `+ importEaXml` — **avoidable** by importing the EE service directly into the modal | optional |

`apps/server/src/ee/ee.module.ts` and `apps/client/src/ee/features.ts` are
fork-owned EE files, not core. No change to `integrations/import/*`, no DB
migration, no existing-endpoint changes. (Note: in this fork
`apps/client/src/ee/hooks/use-feature.ts` and `LicenseCheckService` are stubbed
to `true`; the server `@RequireFeature` remains the authoritative gate.)

## 7. Feature gating / licensing

- Server: `@RequireFeature(Feature.EA_IMPORT)` + existing `FeatureGateGuard` /
  `LicenseCheckService.hasFeature()`.
- Client: `useHasFeature(Feature.EA_IMPORT)` disables the button with the
  standard upgrade tooltip.

## 8. API contract

```
POST /pages/import-ea            (multipart/form-data)
  fields: spaceId (uuid, required)
          replace ('1' to replace an existing import; default '0')
  file:   .xml | .xmi | .zip (required, <= 30 MB)
headers: Authorization (JWT)
response 200: FileTask {
  id, type, source: 'ea', status, fileName, filePath, fileSize, fileExt,
  errorMessage, creatorId, spaceId, workspaceId, metadata, createdAt, updatedAt
}
  -> poll POST /file-tasks/info { fileTaskId } until status is success|failed
  -> metadata: { eaRootId, pageIds?, rootPageIds?, pageCount, warnings?,
                 skipped?, duplicate?, replacedPageIds? }
errors: 400 invalid file/type, 403 no space edit ability / feature not licensed,
        413 file too large
```

Permission: `spaceAbility.createForUser(user, spaceId)` must allow
`SpaceCaslAction.Edit, SpaceCaslSubject.Page` (identical to `pages/import`).

## 9. Data model impact

No migration. Reuses `pages` (`InsertablePage`) and the existing `file_tasks`
table (`type='import'`, `source='ea'`; `metadata` carries the EA root signature,
page ids, warnings and the `skipped` flag).

## 10. Error handling

- Invalid XML (`fast-xml-parser` throws) / no packages → `400` with message.
- `<!DOCTYPE`/`<!ENTITY` present → `400` (rejected up-front).
- Corrupt base64 / ZIP / non-RTF `modeldocument` / RTF conversion failure →
  **stub page + `warnings[]` entry**, import continues; never abort the tx.
- All DB inserts in one transaction; any DB error rolls back and returns `400`.
- Partial conversion is surfaced to the user: success toast with a yellow warning
  when `warnings.length > 0` ("Imported N pages. M sections could not be fully
  converted."). `pageCount === 0` → red error.

## 11. Limits & non-goals (Phase 1)

- Wireframe/diagram images: for **native XML** exports they are embedded
  (`t_image.IMAGE`) and imported automatically; for XMI/BPMN exports they come
  via **companion assets** (§13). Only when neither is present do diagram pages
  fall back to the name list + limitation callout.
- Mermaid flow is best-effort; wrong-diagram risk mitigated by the
  all-connectors-resolve gate.
- No inline RTF images (`\pict`); dropped in v1 (Phase 2 → attachments).
- No incremental/update re-import (each import creates new pages; duplicates are
  a known limitation).
- No async/progress; single file per request; ≤10 MB.

## 12. Resolved decisions (was "open questions")

1. **Container page** — keep root package as container. *(unanimous)*
2. **Flow/UI packages** — create synthesized pages with a mandatory provenance
   callout. *(unanimous)*
3. **Mermaid** — structured list primary; Mermaid only when connectors resolve
   unambiguously. *(unanimous)*
4. **Processing model** — synchronous v1 behind the strict budget in §5.3;
   async (EE-owned queue) as Phase 2. *(split: architecture favored sync for
   minimal core changes; reliability required a bounded budget or async — this
   spec adopts sync + bound.)*
5. **RTF converter** — hand-rolled pure-TS subset. *(unanimous)*

## 13. Wireframe / diagram image import (Phase 1b)

### 13.1 Why a ZIP

Enterprise Architect does not embed diagram images in a plain **XMI** package
export by default. (A **native XML** export *does* — see §2.5, so no ZIP is
needed there.) For XMI, the documented, deterministic way to get them is EA's
export that emits an **`Images/` folder next to the XMI**, with one file per
diagram named after the diagram's **`xmi:id`** (e.g.
`Images/EAID_3891F93B_2CD5_48ea_8C4E_A663C9F46FA8.png`). PNG and SVG are
supported by EA; SVG is recommended.

Therefore the importer accepts, in addition to `.xml`/`.xmi`:

- `.zip` containing the XMI plus its image files (any folder layout). The XMI
  entry is the first `.xml`/`.xmi` entry; images are every `.png/.jpg/.jpeg/
  .gif/.webp/.svg` entry.

A bare `.xml`/`.xmi` still imports (no images). A conservative **best-effort**
embedded-image scan also runs: base64 `data:image/...` blobs found inside a
`UML:Diagram` element are attached to that diagram.

### 13.2 Matching

For each `UML:Diagram` (parser now records `diagramId = xmi:id`), resolve an
image by, in order:

1. `normalizeAssetKey(diagramId)` == asset key (stem, lowercased, `-`→`_`).
2. `String(imageId)` == asset key.
3. `normalizeAssetKey(diagram.name)` == asset key.
4. the diagram's embedded base64 image, if any.

Unmatched diagrams keep the existing name-list + "images not embedded" callout.

### 13.3 Attachment embedding

Matched images are uploaded as page attachments using the core pattern
(`StorageService.uploadStream` + an `attachments` row) and embedded as
`<img src="/api/files/{attachmentId}/{fileName}" data-attachment-id="…"
width="…" data-align="center">`, which the core `processHTML` pipeline turns
into an image node. Page ids are pre-generated, so attachments reference the
future page id (the `attachments.pageId` column is not FK-enforced before the
page row is inserted — same as the ZIP import path).

- Per-image cap: 8 MB; total images cap: 32 MB; image count ≤ 100.
- A failed image upload → warning, diagram keeps its name list.
- `EaDiagram.diagramId` and `EaImageAsset` are the only contract additions.

### 13.4 EA export instructions (shown to users)

> In Enterprise Architect: right-click the package → **Publish > Model Exchange
> > Export > XMI Format**, choose **XMI 1.1/2.1**, and export the diagram images
> alongside (EA writes an `Images/` folder next to the file). Zip the `.xmi`
> and the `Images/` folder together and upload the `.zip` here.

## 14. Phase 2 additions

- **Async** (§5.3): EE-owned `{ea-import-queue}` + `file_tasks` + polling; 30 MB.
- **Idempotent re-import**: XMI imports keyed by the root `xmi:id` signature are
  skipped when already imported into the same space (`metadata.skipped`, client
  shows an "already imported" notice).
- **RTF `\pict` images**: embedded RTF images (`\pngblip`/`\jpegblip`) are
  extracted, uploaded as page attachments via the same `EaAttachmentService`
  path, and inlined (`eaRtfImagePlaceholder` → `<img>`). Unsupported blip types
  (`\wmetafile`/`\emfblip`) and oversize images are dropped with a warning.
- **EA HTML-report ingestion**: a `.zip` with **no XMI entry** but `.htm`/`.html`
  pages is treated as an EA HTML report — a container page + one child page per
  report page, images imported through `ImportAttachmentService.processAttachments`.
  Best-effort: flat tree ordered by path; titles from `<h1>` / `<title>` /
  filename; no idempotency; untested against a real EA report.
