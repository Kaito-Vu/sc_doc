# Admin Statistics Dashboard — Design

Status: approved
Date: 2026-08-05

## Purpose

Give workspace admins and space admins a statistics view of their
workspace/space: current counts, growth trends, and top contributors.
Today there is no aggregated view — admins have no way to see how many
pages/users exist, how active the workspace is, or who is contributing,
without manually paging through lists.

## Scope

- Workspace admin: statistics for the whole workspace.
- Space admin: statistics for a single space they administer.
- Snapshot metrics (current counts) + time-series trend charts (weekly
  buckets, derived from existing `createdAt` columns — no new snapshot
  table or cron job needed) + a top-contributor leaderboard with a
  week/month/year period toggle.
- Out of scope for this iteration (explicitly deferred): "top N most
  active spaces" ranking, tracking active-users-over-time (would require
  a periodic snapshot job since it can't be reconstructed retroactively).

## Architecture

New EE module, following the `ee/personal-space` and `ee/audit` pattern
exactly — all logic in `ee/`, core files only get a 1-import/1-line
wire-in.

- Server: `apps/server/src/ee/statistics/`
  - `statistics.module.ts`
  - `statistics.controller.ts`
  - `statistics.service.ts`
- Client: `apps/client/src/ee/statistics/`
  - `services/statistics-service.ts`
  - `queries/statistics-query.ts`
  - `types/statistics.types.ts`
  - `components/stat-card.tsx`
  - `components/trend-chart.tsx`
  - `components/top-contributors.tsx`
  - `pages/workspace-statistics.tsx`
  - `pages/space-statistics.tsx`

Gated behind a new `Feature.STATISTICS` flag (`common/features.ts` on
the server, `ee/features.ts` on the client), same mechanism as
`Feature.PERSONAL_SPACES` — `@RequireFeature` on the controller routes,
`useHasFeature` to conditionally render the nav tab on the client.

New client dependency: `@mantine/charts` (wraps Recharts, matches the
installed Mantine 9.3.2, themes automatically with light/dark) — no
charting library exists in the project today.

Core file touch points (mechanical only):
- `apps/client/src/pages/settings/workspace/workspace-settings.tsx` (or
  the workspace settings nav list) — add a "Statistics" tab entry.
- Space settings nav — add a "Statistics" tab entry, visible only to
  space admins of that space.
- `apps/client/src/App.tsx` — register the two new routes.

## Backend

### `StatisticsService.getWorkspaceStats(workspaceId)`

Snapshot counts:
- `totalPages` — count `pages` where `workspaceId = X AND deletedAt IS NULL`
- `totalUsers` — count `users` where `workspaceId = X AND deletedAt IS NULL`
- `totalActiveUsers` — same, plus `deactivatedAt IS NULL` (active = not
  deactivated, evaluated right now — no time window)
- `totalSpaces` — count `spaces` where `workspaceId = X AND deletedAt IS NULL`
- `usersByRole` — count grouped by `users.role` (reuses the existing
  `roleCountByWorkspaceId` query pattern)
- `storageUsedBytes` — `SUM(attachments.fileSize)` where `workspaceId = X`
- `usersNeverLoggedIn` — count `users` where `lastLoginAt IS NULL`

Trend (weekly buckets, last 12 weeks, `date_trunc('week', createdAt)`):
- `pagesCreatedByWeek` — from `pages.createdAt`
- `usersJoinedByWeek` — from `users.createdAt`

### `StatisticsService.getSpaceStats(spaceId, workspaceId)`

- `totalPages` — count `pages` where `spaceId = X AND deletedAt IS NULL`
- `totalMembers` — reuses `SpaceRepo.withMemberCount` (direct + via
  group membership, already implemented)
- `pagesUpdatedLast7Days` — count `pages` where `spaceId = X AND
  updatedAt >= now() - interval '7 days'`

### `StatisticsService.getTopContributors(scope, period)`

`scope` is `{ workspaceId }` or `{ spaceId, workspaceId }`.
`period` is `'week' | 'month' | 'year'` → rolling window of 7 / 30 / 365
days from now (not calendar-aligned).

Per user in scope + period:
- `createdCount` — count `pages` where `creatorId = user` (+ `spaceId`
  filter if space-scoped), `createdAt` within window
- `editCount` — count `pageHistory` rows where `lastUpdatedById = user`
  (+ `spaceId` filter), `createdAt` within window — each row is one
  saved version, so this directly counts edit events without needing
  new schema
- `contributionScore = createdCount + editCount`

Returns top 10 users sorted by `contributionScore` desc, joined with
`users` for name/avatar, each entry carrying the `createdCount` /
`editCount` breakdown alongside the total.

### Controller

- `GET /statistics/workspace` — `@RequireFeature(Feature.STATISTICS)`,
  workspace admin/owner only.
- `GET /statistics/workspace/top-contributors?period=week|month|year`
- `GET /statistics/space/:spaceId` — `@RequireFeature(Feature.STATISTICS)`,
  space admin only (reuse the existing space-admin ability check used by
  other space-admin-only endpoints).
- `GET /statistics/space/:spaceId/top-contributors?period=week|month|year`

Exact guard/ability wiring is an implementation detail to confirm
against the existing space permission checks during planning.

## Frontend

- `StatCard` — reusable label + big number + icon, used for all
  snapshot metrics in a responsive grid.
- `TrendChart` — thin wrapper around `@mantine/charts`' `LineChart` (or
  `BarChart`), takes `{ date, count }[]`, used for both the
  pages-created and users-joined trends.
- `TopContributors` — leaderboard table/list with a `SegmentedControl`
  for week/month/year, each row shows avatar, name, total score, and
  the created/edited breakdown as secondary text.
- `pages/workspace-statistics.tsx` — assembles stat cards
  (`totalPages`, `totalUsers`, `totalActiveUsers`, `totalSpaces`,
  `usersByRole` as a small pie/donut, `storageUsedBytes`,
  `usersNeverLoggedIn`), the two trend charts, and `TopContributors`
  scoped to the workspace.
- `pages/space-statistics.tsx` — assembles `totalPages`,
  `totalMembers`, `pagesUpdatedLast7Days`, and `TopContributors` scoped
  to the space.
- Data fetching via TanStack Query, same pattern as
  `personal-space-query.ts` — one query hook per endpoint, workspace
  page fetched only when `useHasFeature(Feature.STATISTICS)` is true.

## Error handling

- All count/aggregate queries return `0` for empty results (not
  null/undefined) so the UI never has to special-case "no data yet".
- Feature-gated routes return the existing 403 (via `RequireFeature`)
  when the license doesn't include `Feature.STATISTICS`; the client tab
  is hidden entirely in that case (consistent with Personal Spaces).
- Space statistics endpoint 403s for a non-admin of that space (existing
  space ability guard), independent of workspace-level role.

## Testing

- Server: unit tests for `StatisticsService` covering each count query
  and the top-contributor scoring (created + edited weighting, period
  windowing, workspace vs space scoping) against a seeded test DB.
- Client: no new testing infra needed; existing Vitest setup covers
  component rendering if added.

## Open questions for planning phase

- Exact space-admin ability/guard to reuse for the space statistics
  endpoint (needs a quick look at `space.controller.ts`'s existing
  admin-only routes during implementation).
- Where exactly "Statistics" nav entries slot into the workspace and
  space settings navigation lists (file paths to be confirmed while
  implementing the core wiring).
