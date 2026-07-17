# Participant pagination — audit and implementation plan

Date: 17 July 2026 (overnight autonomous session)
Scope: audit only, plus a ready-to-implement plan. **No code was changed for this phase** — see "Why not implemented tonight" for the reasoning.

## What's already done (verified by reading the actual code, not assumed)

The main Participants list view is **already fully server-paginated**, and further along than the source performance docs' own framing ("Complete Participant remote pagination" as a P0 item) suggested going in:

- `Services/ParticipantProjectionService.js`'s `getPage(query, user, options)` → `buildPage_()`: normalises the query server-side (`normalisePageQuery_` clamps `pageSize` to 10–100, sanitises `search`/`sortKey`/`sortDirection`), **filters before paginating** (`applyQuery_` runs before the `.slice(start, start + pageSize)`), returns `pagination: { page, pageSize, total, totalPages }` (real total-count metadata), and is cached with stale-while-revalidate plus a snapshot fallback for cache-rebuild-busy conditions.
- Client side (`Portal/App/SpecCentralApp.html`'s `loadParticipantExplorerPage`/`loadParticipantFirstPage`): both call `portalGetParticipantListPage` (the gateway to `getPage`) with the actual page/pageSize/search/filter/sort parameters — not a full-list-then-slice pattern. Confirmed by reading the request construction directly, not inferred from naming.
- Backward compatibility: `getList`/`portalGetParticipantListProjection` (the older, non-paginated full projection) still exist and are still called from a few places in `SpecPortal.js` (lines 388, 468, 471–472) — these appear to be for non-paginated contexts (e.g. dashboard summaries, exports) rather than the main list view, which has fully moved to `getPage`.

## What's incomplete

### The Groups (school/ensemble breakdown) view has no server-side pagination at all
- `portalGetParticipantGroupsProjection` → `ParticipantProjectionService.getGroups()` returns the **entire** groups list, uncached-by-page, every time.
- Client (`Portal/App/SpecCentralApp.html`'s `loadParticipantGroups`): loads the full array into `App.state.groups` once, then `Portal/Pages/Participants.html`'s groups-rendering code (lines ~256–266) does `groups.slice((page - 1) * size, page * size)` — **client-side-only pagination over a fully-downloaded dataset**, exactly the pattern the task asked to eliminate.
- Severity: moderate, not critical — school/ensemble group counts are typically much smaller than the participant list itself (tens to low hundreds of groups vs. thousands of participants), so the actual payload-size impact is smaller than a full participant download would be. Still worth fixing for consistency and to avoid it becoming a real problem as the platform grows.

### The main Participants list has a minor, likely-transient full-list code path (not a systemic issue)
`Portal/Pages/Participants.html` line 247 has a ternary: `rows = serverPage ? participants : participants.slice(...)` — this only falls back to client-side slicing of `App.state.participants` (whatever was last loaded) when the server page's cached signature doesn't match the current query (e.g. mid-transition while a new page request is in flight). This is a rendering fallback for the brief window between a filter/page change and its server response landing, not a full-dataset download — confirmed by reading `loadParticipantExplorerPage`, which always requests the specific page/filter/sort combination, never the full list.

## Implementation plan for the Groups gap (ready to execute, not done tonight)

Mirror the exact `getPage`/`buildPage_` pattern already proven in this file:

1. Add `getGroupsPage(query, user, options)` to `ParticipantProjectionService.js`, following `getPage`'s structure: `normaliseGroupsPageQuery_` (page/pageSize/search/sortKey — reuse the same clamping logic as `normalisePageQuery_`), a cache key via `ProjectionContractService.cacheKey("groupsPage", request, actor)`, `buildGroupsPage_()` that filters the existing `buildList_`-equivalent groups array before slicing, and returns the same `pagination: { page, pageSize, total, totalPages }` shape for client consistency.
2. Add `portalGetParticipantGroupsPage(query, options)` to `SpecPortal.js`, mirroring `portalGetParticipantListPage`'s one-line gateway shape exactly.
3. Client: add a `loadParticipantGroupsPage` function mirroring `loadParticipantExplorerPage`, and switch `Portal/Pages/Participants.html`'s groups-rendering block to use `serverPage`-style logic identical to the participant list's existing pattern (it already has the right shape for the *other* view — this is copying an established, working pattern, not inventing a new one).
4. Test matrix once a verified execution path exists: first page, subsequent page, last page, empty results (a filter matching zero groups), search, sort, and — since groups are a smaller dataset — explicitly confirm the `totalPages`/`total` metadata is correct at the boundary (e.g. exactly `pageSize` groups, `pageSize + 1` groups).
5. Synthetic-scale test: if a staging environment is available, seed synthetic group records well beyond current production scale (matching the "8,000 participants" synthetic scale already used for the Task 1 telemetry staging work, so this test methodology has precedent in this codebase) to confirm the new pagination doesn't regress at larger scale.

## Why not implemented tonight

This is genuinely new feature code (a new function + a new client code path), not a security patch following an already-proven exact template line-for-line. Implementing it blind, with no way to execute it and observe the result, carries a materially different risk profile than the Attendance security fixes made earlier this session — those had a proven, live-tested staging path with your help at every step; this does not. The one dormant Participants staging environment referenced in earlier session history (`/private/tmp/speccentral-task1-staging`, a git worktree tied to a separate Apps Script project, `.speccentral-task1-appscript-create`) was scoped for a different task (performance-telemetry validation) and, per its own readiness doc, was **never actually pushed/deployed** — standing it up properly for this purpose would itself be a multi-step undertaking (re-verify isolation, first-time push, property configuration), not something to do as a side effect of one feature change. Recommend either reusing that environment properly, or standing up a dedicated Participants staging project (mirroring what was built for Attendance this session), as the first step of implementing this plan.
