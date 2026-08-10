# Word-style Multilevel Numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a page have a single 10-level numbering definition (per-level number format + pattern) applied to ordered lists and, optionally, headings — rendered live in the editor via CSS counters, configurable through a page-scoped settings modal, gated behind a license feature flag, and carried through to PDF export.

**Architecture:** A framework-free "numbering engine" in `packages/editor-ext` (types + CSS-counter generator) is consumed by a new `ee/numbering` module on both client and server. The server module owns a `numbering_settings` JSONB column on `pages` and one licence-gated update endpoint. The client module owns two TipTap extensions (`NumberedOrderedList`, `NumberedHeading`) that add a `restart` attr and CSS classes, a hook that injects generated counter CSS into the editor DOM, and UI (settings modal + restart button). Core files receive only mechanical single-line/single-import hook-ins per the fork's Golden Rule. Numbers are never stored as literal digits — CSS `counter-reset`/`counter-increment` recompute them live, so inserts/deletes/reorders/collaborative edits renumber for free, and Tab/Shift-Tab indent (already wired by `@tiptap/extension-list`) already produces the right nesting.

**Tech Stack:** NestJS + Kysely (server), React 19 + TipTap 3 + Mantine + TanStack Query (client), Jest (server tests), Vitest (client tests).

## Global Constraints

- All new logic lives under `ee/` (client: `apps/client/src/ee/numbering/`, server: `apps/server/src/ee/numbering/`); core files get only an import + a one-line usage per the fork's Golden Rule (see `/Users/vunguyen/workspaces/02.ETC/sc_doc/CLAUDE.md`).
- Never hand-edit `apps/server/src/database/types/db.d.ts` — regenerate it with `pnpm --filter ./apps/server run migration:codegen` after the migration runs.
- Feature is licence-gated via a new `Feature.NUMBERING` entry, checked with `@RequireFeature` (server) and `useHasFeature` (client), following the exact pattern of `Feature.PAGE_PERMISSIONS` / `PagePermissionModule`.
- DOCX export and Markdown export are explicitly out of scope and must not be touched (see spec's Non-goals) — `apps/server/src/ee/docx-export/docx-export.service.ts` stays exactly as-is.
- 10 levels, indices 0–9 representing Word-style levels 1–10.
- Package manager: pnpm; run commands from repo root using `pnpm --filter ./apps/server` / `./apps/client` / `./packages/editor-ext` to scope.

---

### Task 1: `numbering_settings` column + repo/type wiring

**Files:**
- Create: `apps/server/src/database/migrations/20260810T000001-add-numbering-settings-to-pages.ts`
- Modify: `apps/server/src/database/repos/page/page.repo.ts:28-46` (add `'numberingSettings'` to `baseFields`)
- Modify: `apps/client/src/features/page/types/page.types.ts:3-32` (add `numberingSettings` field to `IPage`)
- Test: `apps/server/src/database/repos/page/page.repo.spec.ts` (new file)

**Interfaces:**
- Produces: DB column `pages.numbering_settings` (nullable `jsonb`), exposed by Kysely codegen as `Pages['numberingSettings']: unknown | null` (raw `Json | null` — later tasks narrow this via the shared `NumberingSettings` type on read).
- Produces: `PageRepo.findById(...)` and `PageRepo.updatePage(...)` now read/write `numberingSettings` since it's in `baseFields`.
- Produces: `IPage.numberingSettings: NumberingSettings | null` on the client (type imported from `@docmost/editor-ext`, defined in Task 2 — until Task 2 lands, import will fail; Task 1's client edit is committed together with Task 2 in practice, but the step order below keeps this task server-only and defers the client type edit to the end of Task 2 to avoid a broken intermediate commit).

- [ ] **Step 1: Write the migration**

```ts
// apps/server/src/database/migrations/20260810T000001-add-numbering-settings-to-pages.ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .addColumn('numbering_settings', 'jsonb')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('pages').dropColumn('numbering_settings').execute();
}
```

- [ ] **Step 2: Run the migration and regenerate types**

Run: `docker compose up -d db redis` (if not already running), then from repo root:
```bash
pnpm --filter ./apps/server run migration:up
pnpm --filter ./apps/server run migration:codegen
```
Expected: `apps/server/src/database/types/db.d.ts`'s `Pages` interface gains `numberingSettings: unknown | null` (codegen infers `unknown` for `jsonb`, matching how `content`/`ydoc`-adjacent JSON columns are typed elsewhere in that file — do not hand-edit it).

- [ ] **Step 3: Add the field to `PageRepo.baseFields`**

In `apps/server/src/database/repos/page/page.repo.ts`, add `'numberingSettings'` to the `baseFields` array (around line 45, after `'contributorIds'`):

```ts
  private baseFields: Array<keyof Page> = [
    'id',
    'slugId',
    'title',
    'icon',
    'coverPhoto',
    'position',
    'parentPageId',
    'creatorId',
    'lastUpdatedById',
    'spaceId',
    'workspaceId',
    'isLocked',
    'isBase',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'contributorIds',
    'numberingSettings',
  ];
```

- [ ] **Step 4: Write a repo test asserting the field round-trips**

```ts
// apps/server/src/database/repos/page/page.repo.spec.ts
import { Test } from '@nestjs/testing';
import { PageRepo } from './page.repo';
import { SpaceMemberRepo } from '../space/space-member.repo';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';

describe('PageRepo.baseFields', () => {
  it('includes numberingSettings so findById/updatePage read and write it', async () => {
    const module = await Test.createTestingModule({
      providers: [
        PageRepo,
        { provide: SpaceMemberRepo, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
      ],
    }).compile();

    const repo = module.get(PageRepo);
    expect((repo as any).baseFields).toContain('numberingSettings');
  });
});
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter ./apps/server exec jest page.repo.spec.ts -t "includes numberingSettings"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/database/migrations/20260810T000001-add-numbering-settings-to-pages.ts \
  apps/server/src/database/types/db.d.ts \
  apps/server/src/database/repos/page/page.repo.ts \
  apps/server/src/database/repos/page/page.repo.spec.ts
git commit -m "feat(numbering): add numbering_settings column to pages"
```

---

### Task 2: Shared numbering engine — types and format resolver

**Files:**
- Create: `packages/editor-ext/src/lib/numbering/types.ts`
- Create: `packages/editor-ext/src/lib/numbering/format.ts`
- Test: `packages/editor-ext/src/lib/numbering/format.test.ts`
- Modify: `packages/editor-ext/src/index.ts` (export the new module)
- Modify: `apps/client/src/features/page/types/page.types.ts:1-32` (add `numberingSettings` to `IPage`, deferred from Task 1)

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `NumberingLevelFormat` union type, `NumberingLevelConfig`, `NumberingSettings` interface (exactly 10-entry `levels` tuple), `resolveLevelFormat(format: NumberingLevelFormat): { cssCounterStyle: string; isBullet: boolean }`. Later tasks (`css.ts`, server module, client module) import these from `@docmost/editor-ext`.

- [ ] **Step 1: Write the failing test for `resolveLevelFormat`**

```ts
// packages/editor-ext/src/lib/numbering/format.test.ts
import { resolveLevelFormat } from './format';

describe('resolveLevelFormat', () => {
  it('maps decimal to the CSS decimal counter style', () => {
    expect(resolveLevelFormat('decimal')).toEqual({
      cssCounterStyle: 'decimal',
      isBullet: false,
    });
  });

  it('maps roman formats to CSS lower/upper-roman', () => {
    expect(resolveLevelFormat('lowerRoman')).toEqual({
      cssCounterStyle: 'lower-roman',
      isBullet: false,
    });
    expect(resolveLevelFormat('upperRoman')).toEqual({
      cssCounterStyle: 'upper-roman',
      isBullet: false,
    });
  });

  it('maps letter formats to CSS lower/upper-alpha', () => {
    expect(resolveLevelFormat('lowerLetter')).toEqual({
      cssCounterStyle: 'lower-alpha',
      isBullet: false,
    });
    expect(resolveLevelFormat('upperLetter')).toEqual({
      cssCounterStyle: 'upper-alpha',
      isBullet: false,
    });
  });

  it('marks bullet as a literal glyph, not a counter style', () => {
    expect(resolveLevelFormat('bullet')).toEqual({
      cssCounterStyle: 'decimal',
      isBullet: true,
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter ./packages/editor-ext exec vitest run src/lib/numbering/format.test.ts`
Expected: FAIL — `Cannot find module './format'`

- [ ] **Step 3: Write `types.ts`**

```ts
// packages/editor-ext/src/lib/numbering/types.ts
export type NumberingLevelFormat =
  | 'decimal'
  | 'lowerRoman'
  | 'upperRoman'
  | 'lowerLetter'
  | 'upperLetter'
  | 'bullet';

export interface NumberingLevelConfig {
  format: NumberingLevelFormat;
  // Word-style pattern using %1.."%10 placeholders referencing the counter
  // value at that ancestor level, e.g. "%1.%2." -> "1.1.", "(%3)" -> "(a)".
  // For "bullet" format, `text` is the literal bullet glyph (e.g. "●") and
  // %N placeholders are not applicable.
  text: string;
}

export type NumberingLevels = [
  NumberingLevelConfig, NumberingLevelConfig, NumberingLevelConfig,
  NumberingLevelConfig, NumberingLevelConfig, NumberingLevelConfig,
  NumberingLevelConfig, NumberingLevelConfig, NumberingLevelConfig,
  NumberingLevelConfig,
];

export interface NumberingSettings {
  enabled: boolean;
  linkHeadingsToNumbering: boolean;
  levels: NumberingLevels;
}

export const DEFAULT_NUMBERING_SETTINGS: NumberingSettings = {
  enabled: true,
  linkHeadingsToNumbering: false,
  levels: Array.from({ length: 10 }, (_, i) => ({
    format: 'decimal' as const,
    text: Array.from({ length: i + 1 }, (_, j) => `%${j + 1}.`).join(''),
  })) as NumberingLevels,
};
```

- [ ] **Step 4: Write `format.ts`**

```ts
// packages/editor-ext/src/lib/numbering/format.ts
import { NumberingLevelFormat } from './types';

const CSS_COUNTER_STYLES: Record<NumberingLevelFormat, string> = {
  decimal: 'decimal',
  lowerRoman: 'lower-roman',
  upperRoman: 'upper-roman',
  lowerLetter: 'lower-alpha',
  upperLetter: 'upper-alpha',
  bullet: 'decimal', // unused when isBullet is true
};

export function resolveLevelFormat(format: NumberingLevelFormat): {
  cssCounterStyle: string;
  isBullet: boolean;
} {
  return {
    cssCounterStyle: CSS_COUNTER_STYLES[format],
    isBullet: format === 'bullet',
  };
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm --filter ./packages/editor-ext exec vitest run src/lib/numbering/format.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Export the new module and add the client type field**

In `packages/editor-ext/src/index.ts`, add:
```ts
export * from "./lib/numbering/types";
export * from "./lib/numbering/format";
```

In `apps/client/src/features/page/types/page.types.ts`, add to `IPage` (after `coverPhoto: string;` on line 9):
```ts
  numberingSettings: import("@docmost/editor-ext").NumberingSettings | null;
```

- [ ] **Step 7: Commit**

```bash
git add packages/editor-ext/src/lib/numbering/types.ts \
  packages/editor-ext/src/lib/numbering/format.ts \
  packages/editor-ext/src/lib/numbering/format.test.ts \
  packages/editor-ext/src/index.ts \
  apps/client/src/features/page/types/page.types.ts
git commit -m "feat(numbering): add shared numbering types and level-format resolver"
```

---

### Task 3: Shared numbering engine — CSS counter generator

**Files:**
- Create: `packages/editor-ext/src/lib/numbering/css.ts`
- Test: `packages/editor-ext/src/lib/numbering/css.test.ts`
- Modify: `packages/editor-ext/src/index.ts` (export)

**Interfaces:**
- Consumes: `NumberingSettings`, `resolveLevelFormat` from Task 2.
- Produces: `buildCounterCss(settings: NumberingSettings): string`. Later tasks (client `use-numbering-style.ts`) call this and inject the returned string into a `<style>` tag.

Rendering contract this function establishes (documented here since later tasks depend on the exact class/attribute names):
- Ordered lists render with class `numbered-list` and a `data-numbering-level` attribute is NOT required — nesting depth is expressed structurally (an `ol.numbered-list` nested inside a `li` inside another `ol.numbered-list`), so the CSS uses `counter-reset`/`counter-increment` scoped per `ol.numbered-list` and one nested selector chain per level (1 through 10).
- Each `li` inside `ol.numbered-list` gets its number via a `::before` pseudo-element reading the settings `text` pattern for its level, substituting `%N` with `counter(numbering-level-N)`.
- A node with `restart` set gets class `numbering-restart`, which resets `counter-reset` at that node.
- Headings render with class `numbered-heading` and `data-heading-level="1".."10"`; counters `heading-level-1`..`heading-level-10` are reset/incremented the same way, scoped to the editor content container (headings aren't nested in the DOM, so counters live on a shared ancestor and reset via `h1.numbered-heading { counter-reset: heading-level-2 heading-level-3 ... }` cascading resets — implemented explicitly per level below).

- [ ] **Step 1: Write the failing test**

```ts
// packages/editor-ext/src/lib/numbering/css.test.ts
import { buildCounterCss } from './css';
import { DEFAULT_NUMBERING_SETTINGS, NumberingSettings } from './types';

describe('buildCounterCss', () => {
  it('emits a counter-reset/counter-increment/content rule for level 1 ordered lists', () => {
    const css = buildCounterCss(DEFAULT_NUMBERING_SETTINGS);
    expect(css).toContain('counter-reset: numbering-level-1');
    expect(css).toContain('counter-increment: numbering-level-1');
    expect(css).toContain("content: counter(numbering-level-1, decimal) \".\"");
  });

  it('emits a cumulative pattern for level 2 combining ancestor counters', () => {
    const css = buildCounterCss(DEFAULT_NUMBERING_SETTINGS);
    // level 2 default pattern is "%1.%2." per DEFAULT_NUMBERING_SETTINGS
    expect(css).toContain(
      'content: counter(numbering-level-1, decimal) "." counter(numbering-level-2, decimal) "."',
    );
  });

  it('emits a literal bullet glyph instead of a counter() call for bullet levels', () => {
    const settings: NumberingSettings = {
      ...DEFAULT_NUMBERING_SETTINGS,
      levels: DEFAULT_NUMBERING_SETTINGS.levels.map((lvl, i) =>
        i === 0 ? { format: 'bullet' as const, text: '●' } : lvl,
      ) as NumberingSettings['levels'],
    };
    const css = buildCounterCss(settings);
    expect(css).toContain('content: "●"');
  });

  it('emits heading counter rules only for the 10 heading levels when headings enabled', () => {
    const settings: NumberingSettings = {
      ...DEFAULT_NUMBERING_SETTINGS,
      linkHeadingsToNumbering: true,
    };
    const css = buildCounterCss(settings);
    expect(css).toContain('heading-level-1');
    expect(css).toContain('h1.numbered-heading::before');
  });

  it('omits heading rules entirely when headings are not linked', () => {
    const css = buildCounterCss(DEFAULT_NUMBERING_SETTINGS);
    expect(css).not.toContain('numbered-heading');
  });

  it('resets the counter at a restart node', () => {
    const css = buildCounterCss(DEFAULT_NUMBERING_SETTINGS);
    expect(css).toContain('.numbering-restart');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter ./packages/editor-ext exec vitest run src/lib/numbering/css.test.ts`
Expected: FAIL — `Cannot find module './css'`

- [ ] **Step 3: Implement `css.ts`**

```ts
// packages/editor-ext/src/lib/numbering/css.ts
import { resolveLevelFormat } from './format';
import { NumberingSettings } from './types';

function levelContentExpression(text: string, resolveCounterName: (n: number) => string): string {
  // Split "%1.%2." into alternating literal/placeholder tokens and build a
  // CSS `content:` value: counter(...) calls for %N, quoted strings for literals.
  const tokens: string[] = [];
  const regex = /%(\d{1,2})|([^%]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    if (match[1]) {
      const level = Number(match[1]);
      tokens.push(`counter(${resolveCounterName(level)}, decimal)`);
    } else if (match[2]) {
      tokens.push(`"${match[2].replace(/"/g, '\\"')}"`);
    }
  }
  return tokens.length > 0 ? tokens.join(' ') : '""';
}

function buildOrderedListRules(settings: NumberingSettings): string {
  const rules: string[] = [];
  const counterName = (n: number) => `numbering-level-${n}`;

  settings.levels.forEach((level, index) => {
    const levelNum = index + 1;
    const { cssCounterStyle, isBullet } = resolveLevelFormat(level.format);
    const selector = `.numbered-list[data-numbering-depth="${levelNum}"] > li`;

    const contentValue = isBullet
      ? `"${level.text.replace(/"/g, '\\"')}"`
      : levelContentExpression(level.text, (n) => `${counterName(n)}${n === levelNum ? `, ${cssCounterStyle}` : ''}`)
          // The innermost counter (this level) carries the chosen style; ancestor
          // counters always render as decimal per Word convention.
          .replace(`counter(${counterName(levelNum)}, decimal)`, `counter(${counterName(levelNum)}, ${cssCounterStyle})`);

    rules.push(`.numbered-list[data-numbering-depth="${levelNum}"] { counter-reset: ${counterName(levelNum)}; }`);
    rules.push(`${selector} { counter-increment: ${counterName(levelNum)}; }`);
    rules.push(`${selector}::before { content: ${contentValue}; }`);
  });

  rules.push('.numbered-list.numbering-restart { counter-reset: revert; }');

  return rules.join('\n');
}

function buildHeadingRules(settings: NumberingSettings): string {
  if (!settings.linkHeadingsToNumbering) return '';

  const rules: string[] = [];
  const counterName = (n: number) => `heading-level-${n}`;
  const resetChain = Array.from({ length: 10 }, (_, i) => counterName(i + 1)).join(' ');

  rules.push(`.editor-content { counter-reset: ${resetChain}; }`);

  settings.levels.forEach((level, index) => {
    const levelNum = index + 1;
    const { cssCounterStyle, isBullet } = resolveLevelFormat(level.format);
    const selector = `h${levelNum}.numbered-heading`;
    const deeperResets = Array.from({ length: 10 - levelNum }, (_, i) => counterName(levelNum + i + 1)).join(' ');

    const contentValue = isBullet
      ? `"${level.text.replace(/"/g, '\\"')}"`
      : levelContentExpression(level.text, (n) => `${counterName(n)}${n === levelNum ? `, ${cssCounterStyle}` : ''}`)
          .replace(`counter(${counterName(levelNum)}, decimal)`, `counter(${counterName(levelNum)}, ${cssCounterStyle})`);

    rules.push(`${selector} { counter-increment: ${counterName(levelNum)};${deeperResets ? ` counter-reset: ${deeperResets};` : ''} }`);
    rules.push(`${selector}::before { content: ${contentValue}; margin-right: 0.4em; }`);
    rules.push(`${selector}.numbering-restart { counter-reset: ${counterName(levelNum)}${deeperResets ? ' ' + deeperResets : ''}; }`);
  });

  return rules.join('\n');
}

export function buildCounterCss(settings: NumberingSettings): string {
  if (!settings.enabled) return '';
  return [buildOrderedListRules(settings), buildHeadingRules(settings)]
    .filter(Boolean)
    .join('\n');
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter ./packages/editor-ext exec vitest run src/lib/numbering/css.test.ts`
Expected: PASS (6 tests). If the "cumulative pattern" or "bullet glyph" assertions fail on quoting, adjust `levelContentExpression`'s escaping to match — the test's exact expected strings are the source of truth.

- [ ] **Step 5: Export it**

In `packages/editor-ext/src/index.ts`, add:
```ts
export * from "./lib/numbering/css";
```

- [ ] **Step 6: Commit**

```bash
git add packages/editor-ext/src/lib/numbering/css.ts \
  packages/editor-ext/src/lib/numbering/css.test.ts \
  packages/editor-ext/src/index.ts
git commit -m "feat(numbering): add CSS counter generator for multilevel numbering"
```

---

### Task 4: Server `ee/numbering` module (feature flag + update endpoint)

**Files:**
- Modify: `apps/server/src/common/features.ts` (add `NUMBERING` entry)
- Create: `apps/server/src/ee/numbering/numbering.service.ts`
- Create: `apps/server/src/ee/numbering/numbering.controller.ts`
- Create: `apps/server/src/ee/numbering/numbering.module.ts`
- Modify: `apps/server/src/ee/ee.module.ts` (register `NumberingModule`)
- Test: `apps/server/src/ee/numbering/numbering.service.spec.ts`

**Interfaces:**
- Consumes: `NumberingSettings` type from `@docmost/editor-ext` (Task 2); `PageRepo.findById`/`updatePage` (Task 1); `PageAccessService.validateCanEdit` (existing, same signature `validateCanEdit(page, user): Promise<{ hasRestriction: boolean }>` used in `page.controller.ts:279`).
- Produces: `POST /pages/numbering-settings` — body `{ pageId: string; numberingSettings: NumberingSettings }`, guarded by `JwtAuthGuard` + `RequireFeature(Feature.NUMBERING)`, returns `{ numberingSettings: NumberingSettings }`. `NumberingService.updateSettings(pageId: string, settings: NumberingSettings, user: User): Promise<NumberingSettings>` — later tasks (client service) call this endpoint by name only, not the service directly.

- [ ] **Step 1: Add the feature flag**

In `apps/server/src/common/features.ts`, add to the `Feature` object (after `STATISTICS: 'statistics',`):
```ts
  NUMBERING: 'page:numbering',
```

- [ ] **Step 2: Write the failing service test**

```ts
// apps/server/src/ee/numbering/numbering.service.spec.ts
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NumberingService } from './numbering.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { DEFAULT_NUMBERING_SETTINGS } from '@docmost/editor-ext';

describe('NumberingService.updateSettings', () => {
  function buildModule(overrides: { pageRepo?: any; pageAccessService?: any } = {}) {
    return Test.createTestingModule({
      providers: [
        NumberingService,
        {
          provide: PageRepo,
          useValue: overrides.pageRepo ?? {
            findById: jest.fn().mockResolvedValue({ id: 'p1', deletedAt: null }),
            updatePage: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PageAccessService,
          useValue: overrides.pageAccessService ?? {
            validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }),
          },
        },
      ],
    }).compile();
  }

  it('rejects a settings payload without exactly 10 levels', async () => {
    const module = await buildModule();
    const service = module.get(NumberingService);

    const invalid = { ...DEFAULT_NUMBERING_SETTINGS, levels: DEFAULT_NUMBERING_SETTINGS.levels.slice(0, 3) };

    await expect(
      service.updateSettings('p1', invalid as any, { id: 'u1' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the page does not exist', async () => {
    const module = await buildModule({
      pageRepo: { findById: jest.fn().mockResolvedValue(null), updatePage: jest.fn() },
    });
    const service = module.get(NumberingService);

    await expect(
      service.updateSettings('missing', DEFAULT_NUMBERING_SETTINGS, { id: 'u1' } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('validates edit access then persists the settings and returns them', async () => {
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'p1', deletedAt: null }),
      updatePage: jest.fn().mockResolvedValue(undefined),
    };
    const pageAccessService = { validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }) };
    const module = await buildModule({ pageRepo, pageAccessService });
    const service = module.get(NumberingService);
    const user = { id: 'u1' };

    const result = await service.updateSettings('p1', DEFAULT_NUMBERING_SETTINGS, user as any);

    expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(
      { id: 'p1', deletedAt: null },
      user,
    );
    expect(pageRepo.updatePage).toHaveBeenCalledWith(
      { numberingSettings: DEFAULT_NUMBERING_SETTINGS },
      'p1',
    );
    expect(result).toEqual(DEFAULT_NUMBERING_SETTINGS);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter ./apps/server exec jest numbering.service.spec.ts`
Expected: FAIL — `Cannot find module './numbering.service'`

- [ ] **Step 4: Implement the service**

```ts
// apps/server/src/ee/numbering/numbering.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { User } from '@docmost/db/types/entity.types';
import { NumberingSettings } from '@docmost/editor-ext';

@Injectable()
export class NumberingService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
  ) {}

  private assertValid(settings: NumberingSettings): void {
    if (!settings || !Array.isArray(settings.levels) || settings.levels.length !== 10) {
      throw new BadRequestException('numberingSettings.levels must have exactly 10 entries');
    }
    for (const level of settings.levels) {
      if (!level || typeof level.format !== 'string' || typeof level.text !== 'string') {
        throw new BadRequestException('Each numbering level requires a format and text pattern');
      }
    }
  }

  async updateSettings(
    pageId: string,
    settings: NumberingSettings,
    user: User,
  ): Promise<NumberingSettings> {
    this.assertValid(settings);

    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);

    await this.pageRepo.updatePage({ numberingSettings: settings as any }, pageId);

    return settings;
  }
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm --filter ./apps/server exec jest numbering.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the controller**

```ts
// apps/server/src/ee/numbering/numbering.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { NumberingService } from './numbering.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import { NumberingSettings } from '@docmost/editor-ext';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class NumberingController {
  constructor(private readonly numberingService: NumberingService) {}

  @HttpCode(HttpStatus.OK)
  @Post('numbering-settings')
  @RequireFeature(Feature.NUMBERING)
  async updateNumberingSettings(
    @Body() body: { pageId: string; numberingSettings: NumberingSettings },
    @AuthUser() user: User,
  ) {
    const numberingSettings = await this.numberingService.updateSettings(
      body.pageId,
      body.numberingSettings,
      user,
    );
    return { numberingSettings };
  }
}
```

- [ ] **Step 7: Write the module and register it**

```ts
// apps/server/src/ee/numbering/numbering.module.ts
import { Module } from '@nestjs/common';
import { NumberingService } from './numbering.service';
import { NumberingController } from './numbering.controller';
import { PageAccessModule } from '../../core/page/page-access/page-access.module';

@Module({
  imports: [PageAccessModule],
  providers: [NumberingService],
  controllers: [NumberingController],
})
export class NumberingModule {}
```

In `apps/server/src/ee/ee.module.ts`, add the import statement (after `import { PagePermissionModule } from './page-permission/page-permission.module';`):
```ts
import { NumberingModule } from './numbering/numbering.module';
```
and add `NumberingModule,` to the `imports` array (after `PagePermissionModule,`).

- [ ] **Step 8: Verify the server builds**

Run: `pnpm --filter ./apps/server run lint`
Expected: no new errors from the `ee/numbering` files.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/common/features.ts \
  apps/server/src/ee/numbering/ \
  apps/server/src/ee/ee.module.ts
git commit -m "feat(numbering): add server NumberingModule with licence-gated update endpoint"
```

---

### Task 5: Client numbering data layer (feature flag, types, service, query)

**Files:**
- Modify: `apps/client/src/ee/features.ts` (add `NUMBERING` entry)
- Create: `apps/client/src/ee/numbering/types/numbering.types.ts`
- Create: `apps/client/src/ee/numbering/services/numbering-service.ts`
- Create: `apps/client/src/ee/numbering/queries/numbering-query.ts`
- Create: `apps/client/src/ee/numbering/index.ts`
- Test: `apps/client/src/ee/numbering/queries/numbering-query.test.ts`

**Interfaces:**
- Consumes: `NumberingSettings` from `@docmost/editor-ext` (Task 2); `IPage` from `@/features/page/types/page.types` (Task 2's edit); axios instance `api` from `@/lib/api-client` (existing, used by `page-permission-service.ts`).
- Produces: `useUpdateNumberingSettingsMutation(): UseMutationResult<{ numberingSettings: NumberingSettings }, Error, { pageId: string; numberingSettings: NumberingSettings }>` — Task 8 (settings modal) and Task 9 (restart button) call this.

- [ ] **Step 1: Add the feature flag**

In `apps/client/src/ee/features.ts`, add to the `Feature` object (after `DETAIL_INFO_PANEL: 'detail:info-panel',`):
```ts
  NUMBERING: 'page:numbering',
```

- [ ] **Step 2: Write the types file**

```ts
// apps/client/src/ee/numbering/types/numbering.types.ts
import { NumberingSettings } from "@docmost/editor-ext";

export interface IUpdateNumberingSettings {
  pageId: string;
  numberingSettings: NumberingSettings;
}

export interface IUpdateNumberingSettingsResponse {
  numberingSettings: NumberingSettings;
}
```

- [ ] **Step 3: Write the service**

```ts
// apps/client/src/ee/numbering/services/numbering-service.ts
import api from "@/lib/api-client";
import {
  IUpdateNumberingSettings,
  IUpdateNumberingSettingsResponse,
} from "@/ee/numbering/types/numbering.types";

export async function updateNumberingSettings(
  data: IUpdateNumberingSettings,
): Promise<IUpdateNumberingSettingsResponse> {
  const req = await api.post<IUpdateNumberingSettingsResponse>(
    "/pages/numbering-settings",
    data,
  );
  return req.data;
}
```

- [ ] **Step 4: Write the failing query test**

```ts
// apps/client/src/ee/numbering/queries/numbering-query.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUpdateNumberingSettingsMutation } from "./numbering-query";
import * as numberingService from "@/ee/numbering/services/numbering-service";
import { DEFAULT_NUMBERING_SETTINGS } from "@docmost/editor-ext";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useUpdateNumberingSettingsMutation", () => {
  it("calls updateNumberingSettings and resolves with the response", async () => {
    vi.spyOn(numberingService, "updateNumberingSettings").mockResolvedValue({
      numberingSettings: DEFAULT_NUMBERING_SETTINGS,
    });

    const { result } = renderHook(() => useUpdateNumberingSettingsMutation(), {
      wrapper,
    });

    result.current.mutate({
      pageId: "p1",
      numberingSettings: DEFAULT_NUMBERING_SETTINGS,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(numberingService.updateNumberingSettings).toHaveBeenCalledWith({
      pageId: "p1",
      numberingSettings: DEFAULT_NUMBERING_SETTINGS,
    });
  });
});
```

- [ ] **Step 5: Run it to confirm it fails**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/queries/numbering-query.test.ts`
Expected: FAIL — `Cannot find module './numbering-query'`

- [ ] **Step 6: Implement the query hook**

```ts
// apps/client/src/ee/numbering/queries/numbering-query.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateNumberingSettings } from "@/ee/numbering/services/numbering-service";
import {
  IUpdateNumberingSettings,
  IUpdateNumberingSettingsResponse,
} from "@/ee/numbering/types/numbering.types";
import { IPage } from "@/features/page/types/page.types";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

export function useUpdateNumberingSettingsMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<
    IUpdateNumberingSettingsResponse,
    Error,
    IUpdateNumberingSettings
  >({
    mutationFn: (data) => updateNumberingSettings(data),
    onSuccess: (data, variables) => {
      queryClient.setQueriesData<IPage>({ queryKey: ["pages"] }, (old) => {
        if (old?.id === variables.pageId) {
          return { ...old, numberingSettings: data.numberingSettings };
        }
        return old;
      });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to update numbering settings"),
        color: "red",
      });
    },
  });
}
```

- [ ] **Step 7: Run the test to confirm it passes**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/queries/numbering-query.test.ts`
Expected: PASS

- [ ] **Step 8: Write the barrel export**

```ts
// apps/client/src/ee/numbering/index.ts
export * from "./types/numbering.types";
export * from "./queries/numbering-query";
```
(Later tasks add extension/component exports here.)

- [ ] **Step 9: Commit**

```bash
git add apps/client/src/ee/features.ts apps/client/src/ee/numbering/
git commit -m "feat(numbering): add client data layer for numbering settings"
```

---

### Task 6: `NumberedOrderedList` and `NumberedHeading` extensions

**Files:**
- Create: `apps/client/src/ee/numbering/extensions/numbered-ordered-list.ts`
- Create: `apps/client/src/ee/numbering/extensions/numbered-heading.ts`
- Test: `apps/client/src/ee/numbering/extensions/numbered-ordered-list.test.ts`
- Test: `apps/client/src/ee/numbering/extensions/numbered-heading.test.ts`
- Modify: `apps/client/src/ee/numbering/index.ts` (export extensions)

**Interfaces:**
- Consumes: `OrderedList` from `@tiptap/extension-list` (used inside `@tiptap/starter-kit`); `Heading` from `@docmost/editor-ext` (`packages/editor-ext/src/lib/heading/heading.ts`).
- Produces: `NumberedOrderedList` (TipTap `Node` extension, name `orderedList`, adds `restart: boolean` attr, renders `class="numbered-list"` + `data-numbering-depth` computed from ancestor `orderedList` depth via a ProseMirror decoration plugin, and registers the `toggleNumberingRestart` command for both `orderedList` and `heading`), `NumberedHeading` (extends `Heading`, adds `restart: boolean` attr, always renders `class="numbered-heading"` and `data-heading-level`). Task 7 imports both and wires them into `mainExtensions`; Task 9's restart button calls `editor.commands.toggleNumberingRestart()`.

- [ ] **Step 1: Write the failing test for `NumberedOrderedList`**

```ts
// apps/client/src/ee/numbering/extensions/numbered-ordered-list.test.ts
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { ListItem } from "@tiptap/extension-list";
import { NumberedOrderedList } from "./numbered-ordered-list";

function makeEditor() {
  return new Editor({
    extensions: [Document, Paragraph, Text, ListItem, NumberedOrderedList],
    content:
      "<ol><li><p>one</p></li><li><p>two</p><ol><li><p>nested</p></li></ol></li></ol>",
  });
}

describe("NumberedOrderedList", () => {
  it("renders the numbered-list class and a data-numbering-depth of 1 at the top level", () => {
    const editor = makeEditor();
    expect(editor.getHTML()).toContain(
      'class="numbered-list" data-numbering-depth="1"',
    );
    editor.destroy();
  });

  it("renders a data-numbering-depth of 2 for a nested ordered list", () => {
    const editor = makeEditor();
    expect(editor.getHTML()).toContain('data-numbering-depth="2"');
    editor.destroy();
  });

  it("exposes a toggleNumberingRestart command that flips the restart attr on the active list", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(2); // inside "one"
    editor.commands.toggleNumberingRestart();
    const json = editor.getJSON();
    expect(json.content?.[0]?.attrs?.restart).toBe(true);
    editor.destroy();
  });

  it("keeps Tab bound to sinkListItem (does not override the default list keymap)", () => {
    const editor = makeEditor();
    expect(typeof editor.commands.sinkListItem).toBe("function");
    editor.destroy();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/extensions/numbered-ordered-list.test.ts`
Expected: FAIL — `Cannot find module './numbered-ordered-list'`

- [ ] **Step 3: Implement `numbered-ordered-list.ts`**

Nesting depth (1–10) must reflect the node's actual position in the document, which TipTap's static `renderHTML` doesn't have access to (it receives only the node, not its document position). Depth is instead computed by a ProseMirror plugin that decorates each live `<ol>` element with `data-numbering-depth` after every state change — `css.ts` (Task 3) selects on that attribute.

```ts
// apps/client/src/ee/numbering/extensions/numbered-ordered-list.ts
import { OrderedList } from "@tiptap/extension-list";
import { mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

function orderedListDepthAt(doc: ProseMirrorNode, pos: number): number {
  const $pos = doc.resolve(pos + 1);
  let depth = 0;
  for (let d = $pos.depth; d >= 0; d--) {
    if ($pos.node(d).type.name === "orderedList") depth++;
  }
  return Math.min(depth, 10);
}

export const NumberedOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      restart: {
        default: false,
        parseHTML: (element) => element.classList.contains("numbering-restart"),
        renderHTML: (attributes) =>
          attributes.restart ? { class: "numbering-restart" } : {},
      },
    };
  },

  // `NumberedOrderedList` is the single owner of `toggleNumberingRestart` for
  // both node types it can apply to. TipTap merges `addCommands()` from every
  // loaded extension into one flat `editor.commands` object — if `NumberedHeading`
  // also defined a command with this name, whichever extension is registered
  // later in `mainExtensions` would silently overwrite the other. Keeping one
  // owner that branches on `editor.isActive(...)` avoids that collision.
  addCommands() {
    return {
      ...this.parent?.(),
      toggleNumberingRestart:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive("orderedList")) {
            const current = editor.getAttributes("orderedList").restart;
            return commands.updateAttributes("orderedList", { restart: !current });
          }
          if (editor.isActive("heading")) {
            const current = editor.getAttributes("heading").restart;
            return commands.updateAttributes("heading", { restart: !current });
          }
          return false;
        },
    } as any;
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey("numberedOrderedListDepth"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "orderedList") return;
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  "data-numbering-depth": String(orderedListDepthAt(state.doc, pos)),
                }),
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const classes = ["numbered-list", node.attrs.restart ? "numbering-restart" : ""]
      .filter(Boolean)
      .join(" ");
    return ["ol", mergeAttributes(HTMLAttributes, { class: classes }), 0];
  },
});
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/extensions/numbered-ordered-list.test.ts`
Expected: PASS (4 tests). If the "depth" assertions fail because Vitest's jsdom `getHTML()` doesn't apply decorations (decorations are a view-layer concept, not part of `editor.getHTML()`'s static serialization), adjust the test to instead mount the editor with `element: document.createElement('div')` and inspect `editor.view.dom.querySelectorAll('ol')[i].getAttribute('data-numbering-depth')` rather than `getHTML()`. Use whichever assertion actually observes the decorated DOM — the important behavior is "the rendered `<ol>` element in the live editor view carries the correct depth attribute," not the serialized HTML string.

- [ ] **Step 5: Write the failing test for `NumberedHeading`**

`NumberedHeading` always renders the `numbered-heading` class and a `data-heading-level` attribute — it has no on/off option of its own. Whether numbers are actually visible is controlled entirely by whether `buildCounterCss` (Task 3) emits heading rules for the page's current `numberingSettings.linkHeadingsToNumbering`, injected by the hook in Task 7. This avoids needing to reconfigure a live TipTap extension's options at runtime (not supported by the public API) every time the user toggles that setting — the DOM shape never changes, only the injected stylesheet does.

```ts
// apps/client/src/ee/numbering/extensions/numbered-heading.test.ts
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { NumberedHeading } from "./numbered-heading";

function makeEditor() {
  return new Editor({
    extensions: [Document, Paragraph, Text, NumberedHeading.configure({ levels: [1, 2, 3] })],
    content: "<h1>Title</h1>",
  });
}

describe("NumberedHeading", () => {
  it("always renders the numbered-heading class and data-heading-level attribute", () => {
    const editor = makeEditor();
    expect(editor.getHTML()).toContain('class="numbered-heading"');
    expect(editor.getHTML()).toContain('data-heading-level="1"');
    editor.destroy();
  });

  it("adds the numbering-restart class when the restart attr is set", () => {
    const editor = makeEditor();
    editor.commands.updateAttributes("heading", { restart: true });
    expect(editor.getHTML()).toContain("numbering-restart");
    editor.destroy();
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/extensions/numbered-heading.test.ts`
Expected: FAIL — `Cannot find module './numbered-heading'`

- [ ] **Step 7: Implement `numbered-heading.ts`**

```ts
// apps/client/src/ee/numbering/extensions/numbered-heading.ts
import { Heading } from "@docmost/editor-ext";
import { mergeAttributes } from "@tiptap/core";

export const NumberedHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      restart: {
        default: false,
        parseHTML: (element) => element.classList.contains("numbering-restart"),
        renderHTML: (attributes) =>
          attributes.restart ? { class: "numbering-restart" } : {},
      },
    };
  },

  // No addCommands() here: NumberedOrderedList owns toggleNumberingRestart
  // for both node types (see the comment in numbered-ordered-list.ts) so
  // TipTap's flat command-merging across extensions can't collide.

  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];
    const classes = ["numbered-heading", node.attrs.restart ? "numbering-restart" : ""]
      .filter(Boolean)
      .join(" ");

    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        id: node.attrs.id,
        class: classes,
        "data-heading-level": String(level),
      }),
      0,
    ];
  },
});
```

- [ ] **Step 8: Run the test to confirm it passes**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/extensions/numbered-heading.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Export the extensions**

In `apps/client/src/ee/numbering/index.ts`, add:
```ts
export * from "./extensions/numbered-ordered-list";
export * from "./extensions/numbered-heading";
```

- [ ] **Step 10: Commit**

```bash
git add apps/client/src/ee/numbering/extensions/ apps/client/src/ee/numbering/index.ts
git commit -m "feat(numbering): add NumberedOrderedList and NumberedHeading extensions"
```

---

### Task 7: CSS injection hook + wire extensions into the main editor

**Files:**
- Create: `apps/client/src/ee/numbering/hooks/use-numbering-style.ts`
- Test: `apps/client/src/ee/numbering/hooks/use-numbering-style.test.ts`
- Modify: `apps/client/src/ee/numbering/index.ts` (export hook)
- Modify: `apps/client/src/features/editor/extensions/extensions.ts:53,186` (swap `Heading` import for `NumberedHeading`, configure `linkHeadingsToNumbering`)
- Modify: `apps/client/src/features/editor/page-editor.tsx` (fetch page, call the hook)

**Interfaces:**
- Consumes: `buildCounterCss` from `@docmost/editor-ext` (Task 3); `NumberingSettings` type.
- Produces: `useNumberingStyle(settings: NumberingSettings | null | undefined): void` — injects/updates a `<style id="numbering-style">` tag in `document.head` with the generated CSS, and removes it when `settings` is null/disabled. Task 10 (PDF render) reuses this same hook.

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/src/ee/numbering/hooks/use-numbering-style.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useNumberingStyle } from "./use-numbering-style";
import { DEFAULT_NUMBERING_SETTINGS } from "@docmost/editor-ext";

afterEach(() => {
  cleanup();
  document.getElementById("numbering-style")?.remove();
});

describe("useNumberingStyle", () => {
  it("injects a style tag containing the generated counter CSS", () => {
    renderHook(() => useNumberingStyle(DEFAULT_NUMBERING_SETTINGS));
    const style = document.getElementById("numbering-style");
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain("numbering-level-1");
  });

  it("removes the style tag when settings are null", () => {
    const { rerender } = renderHook(
      ({ settings }) => useNumberingStyle(settings),
      { initialProps: { settings: DEFAULT_NUMBERING_SETTINGS as any } },
    );
    expect(document.getElementById("numbering-style")).not.toBeNull();

    rerender({ settings: null });
    expect(document.getElementById("numbering-style")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/hooks/use-numbering-style.test.ts`
Expected: FAIL — `Cannot find module './use-numbering-style'`

- [ ] **Step 3: Implement the hook**

```ts
// apps/client/src/ee/numbering/hooks/use-numbering-style.ts
import { useEffect } from "react";
import { buildCounterCss, NumberingSettings } from "@docmost/editor-ext";

const STYLE_ELEMENT_ID = "numbering-style";

export function useNumberingStyle(
  settings: NumberingSettings | null | undefined,
): void {
  useEffect(() => {
    if (!settings || !settings.enabled) {
      document.getElementById(STYLE_ELEMENT_ID)?.remove();
      return;
    }

    let styleEl = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ELEMENT_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = buildCounterCss(settings);

    return () => {
      document.getElementById(STYLE_ELEMENT_ID)?.remove();
    };
  }, [settings]);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/hooks/use-numbering-style.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Export the hook**

In `apps/client/src/ee/numbering/index.ts`, add:
```ts
export * from "./hooks/use-numbering-style";
```

- [ ] **Step 6: Wire `NumberedHeading` into `mainExtensions` (core hook-in)**

In `apps/client/src/features/editor/extensions/extensions.ts`:

Replace the import of `Heading` from `@docmost/editor-ext` (line 53, inside the big destructured import) — remove `Heading` from that import list and add a new import line near the other `@/ee/*` imports (after line 120, the `TemplateSkeleton` imports):
```ts
import { NumberedHeading } from "@/ee/numbering";
```

Replace line 186:
```ts
  Heading.configure({ levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } as any),
```
with:
```ts
  NumberedHeading.configure({ levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } as any),
```

`NumberedHeading` (Task 6) always renders its `numbered-heading` class regardless of the page's settings — whether numbers are visible is controlled entirely by whether `buildCounterCss` (Task 3) emits heading rules for the current `numberingSettings.linkHeadingsToNumbering`, applied by the hook below. This sidesteps needing to reconfigure a live TipTap extension's options at runtime, which the public API doesn't support without a full editor remount.

- [ ] **Step 7: Call `useNumberingStyle` from `page-editor.tsx` (core hook-in)**

In `apps/client/src/features/editor/page-editor.tsx`, add an import near the other `@/ee/*`-style imports:
```ts
import { useNumberingStyle } from "@/ee/numbering";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
```
(`usePageQuery` may already be imported elsewhere in this file for other purposes — check before duplicating the import; if a page query for this `pageId` isn't already fetched here, add it.)

Inside the `PageEditor` component body, after the existing hook calls (near line 125, after `const { handleScrollTo } = useEditorScroll(...)`), add:
```ts
  const { data: page } = usePageQuery({ pageId });
  useNumberingStyle(page?.numberingSettings);
```

- [ ] **Step 8: Manually verify in the browser**

Run: `pnpm dev` (or `preview_start` with the project's dev server config), open a page, add an ordered list with 3 nested levels via Tab, and confirm no console errors. Numbers won't render yet visually as "1." with real formatting until Task 8 (the settings modal) lets a user create `numberingSettings` (currently every page has `numberingSettings: null`, so `useNumberingStyle` no-ops) — this step only confirms no runtime crash from the wiring.

- [ ] **Step 9: Commit**

```bash
git add apps/client/src/ee/numbering/ apps/client/src/features/editor/extensions/extensions.ts apps/client/src/features/editor/page-editor.tsx
git commit -m "feat(numbering): wire NumberedHeading into main editor and inject counter CSS"
```

---

### Task 8: Numbering settings modal + page menu wiring

**Files:**
- Create: `apps/client/src/ee/numbering/components/numbering-level-row.tsx`
- Create: `apps/client/src/ee/numbering/components/numbering-settings-modal.tsx`
- Create: `apps/client/src/ee/numbering/components/numbering-settings-menu-item.tsx`
- Test: `apps/client/src/ee/numbering/components/numbering-settings-modal.test.tsx`
- Modify: `apps/client/src/ee/numbering/index.ts` (export components)
- Modify: `apps/client/src/features/page/components/header/page-header-menu.tsx:56,64,346-351` (import + one menu item, mirroring `PageVerificationMenuItem`)

**Interfaces:**
- Consumes: `useUpdateNumberingSettingsMutation` (Task 5); `DEFAULT_NUMBERING_SETTINGS`, `NumberingSettings`, `NumberingLevelFormat` (Task 2); `useHasFeature`, `Feature.NUMBERING` (Task 5 / `@/ee/hooks/use-feature`).
- Produces: `<NumberingSettingsMenuItem pageId={string} numberingSettings={NumberingSettings | null} onClick={() => void}>` and `<NumberingSettingsModal pageId opened onClose numberingSettings>` — self-contained, Task 8 wires the menu item into `page-header-menu.tsx`; no other task depends on these.

- [ ] **Step 1: Write the failing modal test**

```tsx
// apps/client/src/ee/numbering/components/numbering-settings-modal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { NumberingSettingsModal } from "./numbering-settings-modal";
import * as numberingService from "@/ee/numbering/services/numbering-service";
import { DEFAULT_NUMBERING_SETTINGS } from "@docmost/editor-ext";

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <NumberingSettingsModal
          pageId="p1"
          opened
          onClose={() => {}}
          numberingSettings={DEFAULT_NUMBERING_SETTINGS}
        />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("NumberingSettingsModal", () => {
  it("renders exactly 10 level rows", () => {
    renderModal();
    expect(screen.getAllByTestId(/numbering-level-row-/)).toHaveLength(10);
  });

  it("saves the edited settings on submit", async () => {
    const spy = vi
      .spyOn(numberingService, "updateNumberingSettings")
      .mockResolvedValue({ numberingSettings: DEFAULT_NUMBERING_SETTINGS });

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: "p1" }),
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/components/numbering-settings-modal.test.tsx`
Expected: FAIL — `Cannot find module './numbering-settings-modal'`

- [ ] **Step 3: Implement the level row component**

```tsx
// apps/client/src/ee/numbering/components/numbering-level-row.tsx
import { FC } from "react";
import { Group, Select, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { NumberingLevelConfig, NumberingLevelFormat } from "@docmost/editor-ext";

const FORMAT_OPTIONS: { value: NumberingLevelFormat; label: string }[] = [
  { value: "decimal", label: "1, 2, 3" },
  { value: "lowerRoman", label: "i, ii, iii" },
  { value: "upperRoman", label: "I, II, III" },
  { value: "lowerLetter", label: "a, b, c" },
  { value: "upperLetter", label: "A, B, C" },
  { value: "bullet", label: "Bullet" },
];

interface Props {
  level: number; // 1-10
  config: NumberingLevelConfig;
  onChange: (config: NumberingLevelConfig) => void;
}

export const NumberingLevelRow: FC<Props> = ({ level, config, onChange }) => {
  const { t } = useTranslation();

  return (
    <Group wrap="nowrap" gap="xs" data-testid={`numbering-level-row-${level}`}>
      <Text size="sm" w={60}>
        {t("Level {{level}}", { level })}
      </Text>
      <Select
        size="xs"
        data={FORMAT_OPTIONS}
        value={config.format}
        onChange={(value) =>
          value && onChange({ ...config, format: value as NumberingLevelFormat })
        }
        w={140}
      />
      <TextInput
        size="xs"
        value={config.text}
        onChange={(e) => onChange({ ...config, text: e.currentTarget.value })}
        placeholder={t("e.g. %1.%2.")}
        w={140}
      />
    </Group>
  );
};
```

- [ ] **Step 4: Implement the modal**

```tsx
// apps/client/src/ee/numbering/components/numbering-settings-modal.tsx
import { FC, useState } from "react";
import { Button, Group, Modal, ScrollArea, Stack, Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_NUMBERING_SETTINGS,
  NumberingLevelConfig,
  NumberingSettings,
} from "@docmost/editor-ext";
import { NumberingLevelRow } from "./numbering-level-row";
import { useUpdateNumberingSettingsMutation } from "@/ee/numbering/queries/numbering-query";

interface Props {
  pageId: string;
  opened: boolean;
  onClose: () => void;
  numberingSettings: NumberingSettings | null;
}

export const NumberingSettingsModal: FC<Props> = ({
  pageId,
  opened,
  onClose,
  numberingSettings,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<NumberingSettings>(
    numberingSettings ?? DEFAULT_NUMBERING_SETTINGS,
  );
  const updateMutation = useUpdateNumberingSettingsMutation();

  const updateLevel = (index: number, config: NumberingLevelConfig) => {
    const levels = [...draft.levels];
    levels[index] = config;
    setDraft({ ...draft, levels: levels as NumberingSettings["levels"] });
  };

  const handleSave = () => {
    updateMutation.mutate(
      { pageId, numberingSettings: draft },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Numbering settings")} size="lg">
      <Stack gap="sm">
        <Switch
          label={t("Enable numbering")}
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.currentTarget.checked })}
        />
        <Switch
          label={t("Link headings to numbering")}
          checked={draft.linkHeadingsToNumbering}
          onChange={(e) =>
            setDraft({ ...draft, linkHeadingsToNumbering: e.currentTarget.checked })
          }
        />
        <ScrollArea.Autosize mah={320}>
          <Stack gap="xs">
            {draft.levels.map((config, index) => (
              <NumberingLevelRow
                key={index}
                level={index + 1}
                config={config}
                onChange={(next) => updateLevel(index, next)}
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleSave} loading={updateMutation.isPending}>
            {t("Save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/components/numbering-settings-modal.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Implement the menu item wrapper**

```tsx
// apps/client/src/ee/numbering/components/numbering-settings-menu-item.tsx
import { FC } from "react";
import { Menu } from "@mantine/core";
import { IconListNumbers } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";

interface Props {
  onClick: () => void;
}

export const NumberingSettingsMenuItem: FC<Props> = ({ onClick }) => {
  const { t } = useTranslation();
  const hasNumbering = useHasFeature(Feature.NUMBERING);

  if (!hasNumbering) return null;

  return (
    <Menu.Item leftSection={<IconListNumbers size={16} />} onClick={onClick}>
      {t("Numbering settings")}
    </Menu.Item>
  );
};
```

- [ ] **Step 7: Export the components**

In `apps/client/src/ee/numbering/index.ts`, add:
```ts
export * from "./components/numbering-settings-modal";
export * from "./components/numbering-settings-menu-item";
```

- [ ] **Step 8: Wire the menu item into `page-header-menu.tsx` (core hook-in)**

In `apps/client/src/features/page/components/header/page-header-menu.tsx`, add an import (after line 60, near the `PageVerificationMenuItem` import):
```ts
import { NumberingSettingsMenuItem, NumberingSettingsModal } from "@/ee/numbering";
```

Inside `PageActionMenu`, add a disclosure alongside the existing `verificationOpened` one (near line 206-209):
```ts
  const [
    numberingSettingsOpened,
    { open: openNumberingSettings, close: closeNumberingSettings },
  ] = useDisclosure(false);
```

Add the menu item in the dropdown, right after the `PageWidthToggle` item block (after line 335):
```tsx
          {!page?.isBase && (
            <NumberingSettingsMenuItem onClick={openNumberingSettings} />
          )}
```

Render the modal alongside the other modals at the bottom of the component (after `</Menu>`, near line 434, alongside `MovePageModal`):
```tsx
      <NumberingSettingsModal
        pageId={page.id}
        opened={numberingSettingsOpened}
        onClose={closeNumberingSettings}
        numberingSettings={page.numberingSettings}
      />
```

- [ ] **Step 9: Manually verify in the browser**

Start the dev server, open a page, open the page action menu ("..."), click "Numbering settings", change level 1's format to "lowerRoman" and pattern to "%1)", enable numbering, save, and add an ordered list — confirm items render as "i)", "ii)", etc.

- [ ] **Step 10: Commit**

```bash
git add apps/client/src/ee/numbering/components/ apps/client/src/ee/numbering/index.ts apps/client/src/features/page/components/header/page-header-menu.tsx
git commit -m "feat(numbering): add numbering settings modal and page menu entry"
```

---

### Task 9: Restart-numbering toolbar button

**Files:**
- Create: `apps/client/src/ee/numbering/components/restart-numbering-button.tsx`
- Test: `apps/client/src/ee/numbering/components/restart-numbering-button.test.tsx`
- Modify: `apps/client/src/ee/numbering/index.ts` (export)
- Modify: `apps/client/src/features/editor/components/fixed-toolbar/groups/lists-group.tsx` (add the button next to the ordered-list toggle)

**Interfaces:**
- Consumes: `editor.commands.toggleNumberingRestart()` registered by `NumberedOrderedList` (Task 6), which handles both `orderedList` and `heading` nodes.
- Produces: `<RestartNumberingButton editor={Editor}>` — visible only when the selection is inside an `orderedList` (per the spec's decision to scope Tab/restart UI to ordered lists; headings can still be restarted programmatically via the same command, but no dedicated heading UI ships in this plan since it wasn't requested).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/client/src/ee/numbering/components/restart-numbering-button.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { ListItem } from "@tiptap/extension-list";
import { NumberedOrderedList } from "@/ee/numbering/extensions/numbered-ordered-list";
import { RestartNumberingButton } from "./restart-numbering-button";

function renderButton(editor: Editor) {
  return render(
    <MantineProvider>
      <RestartNumberingButton editor={editor} />
    </MantineProvider>,
  );
}

describe("RestartNumberingButton", () => {
  it("renders nothing when the selection is not inside an ordered list", () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, ListItem, NumberedOrderedList],
      content: "<p>hello</p>",
    });
    renderButton(editor);
    expect(screen.queryByRole("button")).toBeNull();
    editor.destroy();
  });

  it("toggles the restart attribute when clicked inside an ordered list", () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, ListItem, NumberedOrderedList],
      content: "<ol><li><p>one</p></li></ol>",
    });
    editor.commands.setTextSelection(3); // inside "one"
    renderButton(editor);

    fireEvent.click(screen.getByRole("button"));
    expect(editor.getAttributes("orderedList").restart).toBe(true);
    editor.destroy();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/components/restart-numbering-button.test.tsx`
Expected: FAIL — `Cannot find module './restart-numbering-button'`

- [ ] **Step 3: Implement the button**

```tsx
// apps/client/src/ee/numbering/components/restart-numbering-button.tsx
import { FC } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import classes from "@/features/editor/components/fixed-toolbar/fixed-toolbar.module.css";

interface Props {
  editor: Editor;
}

export const RestartNumberingButton: FC<Props> = ({ editor }) => {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor || ctx.editor.isDestroyed) return null;
      return {
        isOrderedList: ctx.editor.isActive("orderedList"),
        isRestarted: ctx.editor.getAttributes("orderedList").restart === true,
      };
    },
  });

  if (!state?.isOrderedList) return null;

  return (
    <Tooltip label={t("Restart numbering here")} withArrow>
      <ActionIcon
        variant="subtle"
        color="dark"
        size="md"
        aria-label={t("Restart numbering here")}
        aria-pressed={state.isRestarted}
        className={clsx({ [classes.active]: state.isRestarted })}
        onClick={() => editor.chain().focus().toggleNumberingRestart().run()}
      >
        <IconRestore size={16} />
      </ActionIcon>
    </Tooltip>
  );
};
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter ./apps/client exec vitest run src/ee/numbering/components/restart-numbering-button.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Export the button**

In `apps/client/src/ee/numbering/index.ts`, add:
```ts
export * from "./components/restart-numbering-button";
```

- [ ] **Step 6: Wire it into the lists toolbar group (core hook-in)**

In `apps/client/src/features/editor/components/fixed-toolbar/groups/lists-group.tsx`, add an import at the top:
```ts
import { RestartNumberingButton } from "@/ee/numbering";
```

Add the button inside the existing `<ActionIcon.Group>`, after the "Numbered List" `Tooltip`/`ActionIcon` block (after line 45, before "To-do List"):
```tsx
      <RestartNumberingButton editor={editor} />
```

- [ ] **Step 7: Manually verify in the browser**

With numbering enabled on a page (from Task 8), place the cursor in the second item of an ordered list, click the restart icon in the fixed toolbar, and confirm that item's numbering visually resets to the level's start.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/ee/numbering/components/restart-numbering-button.tsx \
  apps/client/src/ee/numbering/components/restart-numbering-button.test.tsx \
  apps/client/src/ee/numbering/index.ts \
  apps/client/src/features/editor/components/fixed-toolbar/groups/lists-group.tsx
git commit -m "feat(numbering): add restart-numbering toolbar button"
```

---

### Task 10: PDF export parity

**Files:**
- Modify: `apps/server/src/ee/pdf-export/pdf-export.service.ts` (include `numberingSettings` in `getRenderPayload`)
- Modify: `apps/client/src/ee/pdf-export/pdf-render-page.tsx` (pass `numberingSettings` through)
- Modify: `apps/client/src/features/editor/readonly-page-editor.tsx` (accept `numberingSettings` prop, call the hook)
- Test: `apps/server/src/ee/pdf-export/pdf-export.service.spec.ts` (extend or create)

**Interfaces:**
- Consumes: `page.numberingSettings` (Task 1); `useNumberingStyle` (Task 7); `ReadonlyPageEditor`'s existing `PageEditorProps` (`title`, `content`, `pageId`, `printMode`, `shareId`).
- Produces: `PdfExportService.getRenderPayload` return type gains `numberingSettings: NumberingSettings | null`; `ReadonlyPageEditor` gains an optional `numberingSettings?: NumberingSettings | null` prop, defaulting to `undefined` (no numbering CSS injected) for all other current callers (`history-editor`, `transclusion-content`, share views), which is an intentional, explicit non-goal — only the main editor (Task 7) and the PDF render route apply numbering CSS in this plan.

- [ ] **Step 1: Write the failing service test**

```ts
// apps/server/src/ee/pdf-export/pdf-export.service.spec.ts
import { Test } from '@nestjs/testing';
import { PdfExportService } from './pdf-export.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { TokenService } from '../../core/auth/services/token.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueName } from '../../integrations/queue/constants';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { DEFAULT_NUMBERING_SETTINGS } from '@docmost/editor-ext';

describe('PdfExportService.getRenderPayload', () => {
  it('includes the page numberingSettings in the render payload', async () => {
    const tokenService = { verifyJwt: jest.fn().mockResolvedValue({ pageId: 'p1' }) };
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'p1',
        title: 'T',
        content: null,
        deletedAt: null,
        numberingSettings: DEFAULT_NUMBERING_SETTINGS,
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        PdfExportService,
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: PageRepo, useValue: pageRepo },
        { provide: TokenService, useValue: tokenService },
        { provide: StorageService, useValue: {} },
        { provide: getQueueToken(QueueName.FILE_TASK_QUEUE), useValue: {} },
      ],
    }).compile();

    const service = module.get(PdfExportService);
    const payload = await service.getRenderPayload('p1', 'tok');

    expect(payload.numberingSettings).toEqual(DEFAULT_NUMBERING_SETTINGS);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter ./apps/server exec jest pdf-export.service.spec.ts`
Expected: FAIL — `payload.numberingSettings` is `undefined`

- [ ] **Step 3: Update `getRenderPayload`**

In `apps/server/src/ee/pdf-export/pdf-export.service.ts`, change the `return` inside `getRenderPayload` (seen at the end of that method) from:
```ts
    return {
      pageId: page.id,
      title: page.title,
      content: getProsemirrorContent(page.content),
    };
```
to:
```ts
    return {
      pageId: page.id,
      title: page.title,
      content: getProsemirrorContent(page.content),
      numberingSettings: page.numberingSettings ?? null,
    };
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter ./apps/server exec jest pdf-export.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Add the prop to `ReadonlyPageEditor`**

In `apps/client/src/features/editor/readonly-page-editor.tsx`:

Add an import:
```ts
import { useNumberingStyle } from "@/ee/numbering";
import type { NumberingSettings } from "@docmost/editor-ext";
```

Add `numberingSettings?: NumberingSettings | null;` to `PageEditorProps` (after `shareId?: string;`).

Add `numberingSettings` to the destructured props in the function signature.

Inside the component body, near the top (after the existing `useRef`/`useAtom` hook calls), add:
```ts
  useNumberingStyle(numberingSettings);
```

- [ ] **Step 6: Pass the prop through the PDF render page**

In `apps/client/src/ee/pdf-export/pdf-render-page.tsx`:

Add `numberingSettings: import("@docmost/editor-ext").NumberingSettings | null;` to the `PdfRenderData` type.

Add `numberingSettings={data.numberingSettings}` to the `<ReadonlyPageEditor>` props (alongside `title`, `content`, `pageId`, `printMode`).

- [ ] **Step 7: Manually verify PDF export**

With numbering enabled and configured on a page containing nested ordered lists and (if `linkHeadingsToNumbering` is on) headings, use the page's "Export → PDF" action, download the result, and confirm the rendered numbers match what's shown in the editor.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/ee/pdf-export/pdf-export.service.ts \
  apps/server/src/ee/pdf-export/pdf-export.service.spec.ts \
  apps/client/src/features/editor/readonly-page-editor.tsx \
  apps/client/src/ee/pdf-export/pdf-render-page.tsx
git commit -m "feat(numbering): carry numbering settings through to PDF export"
```

---

## Final verification

- [ ] Run the full server test suite: `pnpm --filter ./apps/server run test`
- [ ] Run the full client test suite: `pnpm --filter ./apps/client run test`
- [ ] Run the editor-ext package tests: `pnpm --filter ./packages/editor-ext exec vitest run`
- [ ] Run `pnpm --filter ./apps/server run lint` and `pnpm --filter ./apps/client run lint`
- [ ] Manual end-to-end pass: enable numbering on a page, build nested ordered lists to 10 levels using Tab, enable heading linking, restart numbering partway through, export to PDF, confirm parity with the editor.
