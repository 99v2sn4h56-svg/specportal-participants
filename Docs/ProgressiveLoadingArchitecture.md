# SpecCentral progressive loading — Step 3

**Implemented locally:** 15 July 2026  
**Deployment:** none

## Traced dependency flow

SpecCentral is an Apps Script HTML Service application, not React. `SpecCentral.html` includes the shell, page templates and client scripts in one HTML response; there are no React providers, query-client initialisers or JavaScript module imports with startup side effects. Module *initialisation and data* can be lazy, but true route bundle splitting is not available without changing the delivery architecture.

The traced startup path is:

1. `SpecCentralBootstrap.html` calls `App.init()`.
2. `App.init()` creates browser state, event handlers, the secure-image intersection observer and performance helpers.
3. `portalBootstrap()` resolves identity, permissions and platform configuration only.
4. The requested route shell is rendered.
5. `portalGetDashboardProjection()` reads a permission-scoped 60-second Dashboard projection.
6. `DashboardService` reads Timeline summary data and a cache/durable-snapshot-only participant summary. It does not call the full participant loader, Attendance summary/events, or a headshot resolver.
7. After the Dashboard is rendered and marked usable, the idle preload queue may run.

The administrator “Viewing As” permission model is deferred until that control receives focus, so it does not compete with Dashboard startup. Client timing telemetry is queued and sent as a batch only after Dashboard usability rather than adding a blocking-path RPC.

Indirect full participant consumers remain in Participants, platform search, communications audiences, relationships, administration diagnostics and form-response matching. None is invoked by bootstrap or the Dashboard projection. Attendance event/summary calls remain in the Attendance route, Event Manager, project/administration tools and explicit Data Sync. The Dashboard exposes Attendance as lazy and does not call those methods.

The secure-image observer is global but inert until a visible `data-secure-image` element intersects. Participant avatars are emitted by visible Participant rows and profile views only. The Dashboard does not render participant avatars.

## Dashboard request flow

```text
Open SpecCentral
  -> portalBootstrap (identity, permissions, flags, epochs)
  -> render shell/requested route
  -> portalGetDashboardProjection (60-second user cache)
       -> Timeline dashboard summary
       -> participant summary cache/snapshot peek only
       -> no Attendance event/summary request
       -> no participant records or headshots
  -> render Dashboard and record dashboard-usable
  -> browser idle queue (permission/flag/network guarded)
       -> participant first page (maximum 50 safe rows)
       -> cache-only Attendance summary peek
```

The idle queue is not started when the current route is not Dashboard, the Dashboard has not been marked usable, maintenance is active, permissions/feature flags deny the module, reduced-data mode is active, the reported connection is 2G/slow-2G, or reported device memory is 2 GB or lower. Hover, keyboard focus and touch intent use the same preload functions and in-flight deduplication.

## Participants request flow

```text
Open Participants
  -> use in-memory/session first page when present
     OR portalGetParticipantListPage({page:1,pageSize:50})
  -> render the first safe page
  -> load the complete slim list projection in the module only
  -> reuse its five-minute server cache for filters/full explorer

Open one participant
  -> portalGetParticipantDetail(stable studentKey)
  -> re-check Participants.View and user scope
  -> render permitted detail
  -> visible avatar enters observer
  -> request small headshot through HeadshotAssetService
```

Direct `#participants/profile/{stableId}` entry requests detail by stable ID and does not need to search a complete list first. Returning to Participants reuses the permission-scoped browser query cache.

## Query keys

The canonical first-page request is fixed in one client constructor:

```text
client: participantListPage:v2:page=1:pageSize=50
server: participant-list-page-v2:page=1:pageSize=50
args:   { page: 1, pageSize: 50 }
```

Idle preload, navigation intent and route entry all use that client key and those parameters. The server adds the user's permission/scope signature through `PerformanceCacheService.userProjectionKey`. Identical in-flight requests are shared.

## Cache layers and lifetimes

| Projection | Fresh | Retained | Scope | Behaviour |
|---|---:|---:|---|---|
| Bootstrap | no client persistence | request only | authenticated user | Always validated; no participant dependency. |
| Dashboard | 60 seconds | visible stale client value | permission-scoped user | Cached server projection; participant component is snapshot/cache-only. |
| Participant first page | 5 minutes | 30 minutes server; 15 minutes session | permission/scope user | Server stale-while-revalidate envelope and safe session copy. |
| Complete slim participant list | 5 minutes | current browser session memory only | permission/scope user | Loaded only inside Participants; not persisted. |
| Attendance summary preload | existing cached value only | 60 seconds in browser if present | authorised user | `peekSummary()` never contacts Attendance or scans event sheets. |
| Participant detail | 2 minutes browser memory | none persistent | permission/scope user + stable ID | Loaded only on record open. |
| Headshots | visible-view memory/current asset cache | provider-defined | permission/scope user + stable ID | Intersection-observed; no all-headshot preload. |

All server projection keys include the schema/cache epoch namespace. Cache chunks are written before the complete manifest is published, cache misses use a script lock, and failed stale refreshes preserve the previous complete value. A stale first page is displayed immediately and a forced refresh runs without replacing the visible page with a loader.

## Browser persistence policy

Only an allow-listed first page is persisted in `sessionStorage`, for at most 15 minutes. It contains display/list identity, school/year/program classification, status, stable ID and `hasPhoto`. It excludes contact details, parent data, notes, medical/support flags, full forms, attendance history, raw Drive IDs/URLs and image data.

The complete participant list remains in memory only. Participant search text and recently viewed participant names are no longer written to local or session storage, and legacy stored values are removed during startup. Safe display preferences and non-sensitive filter selections may remain session/local state.

## Warming and invalidation

- `portalWarmStartupProjections()` and participant Data Sync warm the Dashboard summary and current authorised user's first page.
- `warmSpecCentralSharedProjections()` warms the shared canonical participant cache and Dashboard summary for an optional 30-minute trigger.
- No trigger is installed by this package.
- Participant sync/invalidation clears canonical/list, first-page, Dashboard summary and dependent projections.
- `SC_SCHEMA_VERSION` or `SC_CACHE_EPOCH` changes every derived cache key.
- Attendance Data Sync remains the explicit network refresh. Idle preload is cache-only and cannot cause event-sheet scanning.

## Instrumentation and measurement

Metrics cover bootstrap, Dashboard projection/usable time, participant page/list/detail requests, cache status, stale state, preload start/completion/failure, trigger, payload size and route cache behaviour. Telemetry dimensions are allow-listed and contain no names, emails, queries or image references.

No production or non-production deployment was permitted, so live before/after milliseconds are not available and are not fabricated. The verified structural comparison is:

| Startup property | Before first package | Step 3 |
|---|---:|---:|
| Blocking requests before Dashboard data | identity + participant collection + Dashboard dependencies | bootstrap + slim Dashboard projection |
| Blocking application-data RPCs before Dashboard usability | at least 3 | 2 |
| Complete participant requests before Dashboard usable | 1 | 0 |
| Participant source-sheet scans before Dashboard usable | up to 3 | 0 |
| Attendance summary/event requests before Dashboard usable | possible through shared work | 0 |
| Headshot requests before Dashboard usable | possible through participant path | 0 participant headshots |
| Background requests after Dashboard usable | uncontrolled/none | at most 2 guarded requests |

The visible signed-in staff avatar may independently request its authorised image once it intersects; it is not a participant headshot and does not block Dashboard rendering. Client telemetry is batched after usability.

Collect at least 30 cold and warm runs on Chrome, Safari and a managed phone after a reviewed test deployment. Compare `client.dashboard-usable`, `client.participant-page-route`, `client.participant-page-preload-idle`, `participants.page.request`, `participants.list.request`, cache hit/miss/stale metrics and measured payload bytes. Record both direct Participants entry and successful-preload entry.

## Known limitations and next package

- HTML Service still sends and parses all module scripts/templates initially. A separate deployment or fetched HTML fragment architecture is required for real code-bundle splitting.
- The rich Participant explorer still upgrades from the first page to the complete slim list after its first paint because existing client-side facets and exports require the collection. Server-side filtering/pagination is the recommended next participant package.
- A cold first-page preload may still build the slim canonical participant projection after Dashboard usability. It never blocks Dashboard rendering.
- Apps Script cannot continue arbitrary server work after returning a response. Stale data is returned first, then the browser issues an explicit refresh request.
- The durable Dashboard participant snapshot is global; restricted-scope users receive no unrestricted snapshot.
- Attendance cache-only preload improves route readiness only when an approved summary already exists; it deliberately does not warm by scanning event sheets.
- True private cross-browser headshot reliability still requires the planned stable asset index/private Cloud Storage migration.

Recommended next package: implement server-side Participant explorer filtering/pagination and durable materialised lookup tables, then measure whether splitting the Forms/Communications workspaces into separately loaded HTML is justified.

The final package has now added the server page/search/filter contracts and generation-based shared cache. The rich explorer still upgrades to the complete slim list for compatibility; completing its remote-pagination conversion remains recommended. See `Docs/ProjectionCacheAssetArchitecture.md`.
