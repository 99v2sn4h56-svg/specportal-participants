# SpecCentral Performance and Scalability Audit

**Review date:** 16 July 2026  
**Review level:** Principal Software Architect / Performance Engineering  
**Scope:** SpecCentral in the `Participants` Apps Script project, including its browser shell, service gateways, projections, caches, spreadsheet/Drive adapters, workflow stores, and current observability.

## Executive assessment

SpecCentral has moved beyond a simple spreadsheet UI. It now has sensible service boundaries, capability checks, route-specific projections, compressed cache publication, first-page participant paging, cache-only dashboard dependencies, lazy operational modules, and secure headshot delivery. Those changes directly address the recent 30-second Dashboard timeout, `CACHE_REBUILD_BUSY`, 50-row participant truncation, and browser-dependent Drive image failures.

The platform is nevertheless still a prototype architecture. Its principal limits are not visual design or a missing React optimisation. They are:

1. a 687,723-byte unminified, inline application shell in which every route's code, styles, and templates are delivered on first load;
2. Apps Script RPC and cold-start latency, with two sequential blocking startup calls before background preloading begins;
3. whole-sheet canonical reads and in-memory filtering on cache misses;
4. best-effort `CacheService` being treated as a shared projection store despite eviction, size, and concurrency constraints;
5. Script Properties being used for tasks, audit, workflows, forms, and communications, which is incompatible with the stated long-term volumes;
6. a filename/Drive-scan fallback in the headshot pipeline;
7. insufficient production telemetry retention to prove p50/p95 performance over time.

The existing architecture can support a controlled prototype and moderate internal use if projections remain warm. It cannot safely support 8,000 participants, 10,000 accounts, 50 concurrent administrators, 100,000 attendance records, millions of audit entries, and multiple programs without moving authoritative transactional workloads out of Apps Script/Sheets/Properties.

This is not a recommendation to redesign the UI or immediately rewrite everything. The recommended path is to retain the current frontend and projection contracts, make the Apps Script version fast and observable, then progressively replace storage and high-cost adapters behind those contracts.

## Evidence and limitations

### Direct measurements from the repository

| Measure | Observed result | Significance |
|---|---:|---|
| Files in the delivered SpecCentral shell | 25 included HTML/style/script/template files | All route code is included at startup. |
| Raw delivered source represented by those includes | 687,723 bytes | Large for an Apps Script HTML response before runtime data. |
| Approximate gzip size of the concatenated source | 137,317 bytes | Network transfer may be acceptable on desktop, but parse/compile and Apps Script HTML generation still occur. |
| Complete `Portal` HTML source | 787,731 bytes | The shipped application is already substantial and growing. |
| Largest browser source files | `SpecCentralApp.html` 220,971 bytes; CSS 147,198 bytes; Form Builder 54,536 bytes; Participants 46,255 bytes; Profiles 44,657 bytes; Communications 38,031 bytes | Route splitting has high potential value. |
| App service-wrapper call sites | 41 | A central request layer exists and should become the only RPC boundary. |
| Direct `google.script.run` call sites under `Portal` | 12 | Some paths still bypass consistent timeout, dedupe, cache, and telemetry behaviour. |
| External font configuration | Poppins, six weights | Avoidable font transfer and rendering cost. |
| Participant page size | default 50; server maximum 100 | Correct bounded response pattern. |
| Canonical participant cache | 30 minutes | Useful, but a cold miss still reads the whole Individuals sheet. |
| Participant page/list freshness and retention | 5 minutes / 30 minutes | Good stale-first basis. |
| Participant filters/groups freshness and retention | 15 minutes / 60 minutes | Appropriate for slowly changing reference projections. |
| Attendance active projection | 2 minutes / 15 minutes | Too stale for live roll state, but reasonable for landing-page summaries. |
| Timeline canonical cache | 30 minutes, compressed | Fixes the previous single-entry cache failure. |
| Staff canonical cache | 5 minutes | Short relative to source volatility and read cost. |
| Identity/permission cache | 8 minutes | Sensible if explicit invalidation is reliable. |
| Headshot index cache | 6 hours | Reduces Drive scans, but first build is still expensive. |
| Performance telemetry retention | 240 samples total, six hours, in Script Cache | Not sufficient for production baselines or trend analysis. |

The gzip figure is a local approximation over the included files, not a captured browser transfer. Actual transfer size depends on Apps Script response generation, HTTP compression, headers, and the Google Fonts response.

### Existing deterministic evidence

The performance package documentation records 35/35 contract checks passing on 15 July 2026, plus progressive-loading/static parsing checks. Its synthetic payloads were approximately 1,482 bytes for Dashboard, 767 bytes for the participant first page, 291 bytes for filters, 203 bytes for one detail, and 681 bytes for active Attendance. Those are useful schema regression budgets, not production latency or payload measurements.

### Live evidence unavailable in this audit

The code records `SC_PERF` events and exposes `portalGetPerformanceDiagnostics()`. I attempted to retrieve recent execution telemetry with `clasp logs`, but the project has no linked GCP project ID, so Cloud Logging could not be queried. The diagnostic UI also renders identity/cache text but does not render the returned timing summaries.

No production p50/p95 number is therefore invented in this report. A prerequisite action is to link the Apps Script project to an approved standard Google Cloud project and persist performance metrics outside `CacheService`.

## Current request and cache architecture

### Startup path

The browser currently:

1. receives and parses the complete shell, including all routes;
2. calls the lightweight bootstrap endpoint;
3. after bootstrap succeeds, navigates and calls the Dashboard/config projection;
4. only after Dashboard/config completion, starts idle preload;
5. preloads Participants and Attendance sequentially rather than concurrently;
6. sends buffered client telemetry back through another Apps Script RPC.

This is a meaningful improvement over loading all participant data during startup, but the two initial server round trips are serial. On an Apps Script cold start, each can include container start, identity/permission resolution, service execution, serialization, and iframe/RPC overhead.

### Shared projection cache

`PerformanceCacheService` is a thoughtful Apps Script implementation:

- gzip/base64 compression;
- 80 KB chunks, up to 12 chunks;
- generation-specific immutable chunks;
- manifest plus active pointer written last;
- previous-generation fallback;
- short per-projection leases rather than holding a global lock throughout a build;
- cache outcome and lock-wait telemetry;
- Script and User cache variants;
- stale envelopes with freshness and retention windows.

This reduces partial publication and stampedes. It does not turn Apps Script CacheService into Redis. Entries can be evicted before TTL, the encoded projection ceiling is roughly 960 KB, leases are best effort, and a refresh execution still performs the rebuild synchronously. The UI can show stale data while a separate client request refreshes it, but there is no true server-side background refresh unless a trigger is installed.

### Current cache hierarchy

| Layer | Current use | Assessment |
|---|---|---|
| Browser memory | permission-scoped service responses and in-flight request dedupe | Good; lost on reload by design. |
| Browser session storage | small participant first-page snapshot and UI state | Useful for perceived speed; must remain permission/version scoped. |
| Apps Script User Cache | Dashboard/calendar/administration projections | Useful, but expiry/invalidation must share typed keys. |
| Apps Script Script Cache | canonical rows, shared projections, image data, telemetry | Overloaded; application data and telemetry compete for best-effort cache. |
| Script Properties | durable snapshots and platform module records | Acceptable only for bounded configuration/prototype state. |
| Sheets | authoritative participant, timeline, staff, form/attendance data | Familiar and auditable, but not a scalable transactional database. |
| Drive | headshot and upload assets | Viable as a source repository, not an efficient application CDN/object delivery tier. |

## Findings by review area

### 1. Initial load performance

**Finding A — the application has no route-level code splitting.** `SpecCentral.html` includes all main application files and all page templates. Opening Dashboard downloads and parses Form Builder, Communications, Participants, Profiles, Operations, Attendance, Staff, Calendar, and their shared logic.

**Recommendation:** split the shell into a minimal bootstrap/runtime plus route manifests. In Apps Script, true dynamic module hosting is awkward; a practical interim solution is separate HTML payload endpoints or template fragments fetched on first route entry, cached in memory thereafter. Longer term, compile a TypeScript frontend into hashed, minified route bundles hosted on an approved static origin. **Impact: High. Complexity: Medium interim / High compiled frontend.**

**Finding B — startup RPCs are sequential.** Bootstrap is followed by Dashboard/config. Some identity and permission work is repeated through service boundaries even when locally cached.

**Recommendation:** return the smallest safe Dashboard shell projection in the bootstrap response or run independent bootstrap/config requests concurrently when security permits. Keep participant, timeline, attendance, and staff payloads out. **Impact: High. Complexity: Medium.**

**Finding C — six font weights are requested.** The UI uses Poppins weights 400–900.

**Recommendation:** reduce to the two or three actually used above the fold, use `font-display: swap`, preconnect only if measurement shows value, or adopt a system-font stack for the shell. **Impact: Low–Medium. Complexity: Low.**

**Finding D — the sidebar logo is a direct Drive thumbnail.** It can fail or stall in Safari/private sessions and adds a Drive dependency to initial rendering.

**Recommendation:** package the small approved logo as a local/static asset or inline optimised SVG/AVIF where governance permits. **Impact: Medium perceived reliability. Complexity: Low.**

**Performance mechanics to add:** minification, dead-code elimination, compression verification, bundle budgets in CI, long-task measurement, resource timing, LCP/FCP/INP collection, and a no-JavaScript shell loading state.

### 2. Navigation speed

Persistent page containers and client service caching make revisits fast. Route activation itself is mostly DOM cloning/rendering, and the request layer deduplicates in-flight work. The remaining problems are large synchronous `innerHTML` renderers and route functions that sometimes upgrade from the first-page projection to complete participant data.

**Module observations:**

- **Dashboard:** now correctly uses cache-only Timeline and participant snapshots. It still reads several bounded Properties-backed services (tasks, notifications, workflow summary, audit) per projection. Those become slower as storage grows.
- **Participants:** first paint is bounded to 50 records, but rich profiles/export/browse paths can still load the complete slim list. Full remote pagination is unfinished.
- **Participant Passport/Profile:** detail is isolated, but related school/item/teacher views can generate large HTML lists. Headshots are lazy and batched, which is good.
- **Attendance:** landing data is projected, but operational roll freshness requires a revision/delta model rather than repeatedly reading complete sheets.
- **Communications:** the workspace resolves lists from a prototype repository and can materialise recipient sets. This must not synchronously resolve thousands of recipients on route entry.
- **Forms:** all editor code ships initially; large definitions are repeatedly rendered as HTML strings and bind listeners after rendering.
- **Operations/Event Manager:** landing and detail separation is positive. Global search or relationship resolution can cause Timeline/Attendance loads unexpectedly.
- **Administration:** appropriately route-lazy, but aggregates should come from materialised counters rather than scanning stores.

**Recommendation:** define a route data contract with `critical`, `visible`, and `deferred` fields. Render the route frame immediately, fetch visible data, then incrementally render secondary panels. Never load a complete entity collection to open a single detail record. **Impact: High. Complexity: Medium.**

### 3. API/RPC optimisation

Apps Script `google.script.run` is the present RPC transport; this is not a conventional REST or React Query application. The central `App.services.request()` wrapper provides timeouts, caching, dedupe, and events, but 12 direct call sites still exist under `Portal`.

**Specific issues:**

- Bootstrap and Dashboard/config are separate serial calls.
- Idle preloads for Participants and Attendance are sequenced with `reduce`, increasing time until both are warm.
- `PlatformSearchService` wraps `participants:all` in a cache call whose loader calls `ParticipantService.getAll()`, which itself uses the same cache key. On a miss this produces nested publication/compression work even though it avoids a second sheet scan.
- Global search can load participants, groups, Timeline, Staff, Show Run, and Attendance for one query.
- Refresh endpoints invalidate broad families and then synchronously rebuild the selected module.
- The performance diagnostic response already contains timing summaries, but the UI discards them.

**Recommendations:**

1. make the wrapper the sole browser RPC boundary;
2. remove nested same-key caching and let canonical services own their caches;
3. split global search into a dedicated index/projection instead of invoking every source adapter;
4. preload only cache-peek endpoints during idle; run independent low-cost preloads concurrently with a limit of two;
5. add request IDs and server timings to every projection response;
6. consolidate bootstrap plus minimal Dashboard where it removes a round trip without enlarging the payload materially;
7. keep command/write endpoints separate from read projections and invalidate by entity revision.

GraphQL is not presently an advantage. It would add parsing, authorization, and resolver complexity without removing Apps Script/spreadsheet costs. A typed REST/BFF or RPC projection API is better for the known screens. GraphQL may be reconsidered after PostgreSQL exists and multiple independently developed clients need flexible composition.

### 4. Database and storage optimisation

The current system does not use PostgreSQL. It uses Google Sheets, Script Properties, CacheService, and Drive. The requested enterprise volumes require an authoritative database.

**Immediate spreadsheet improvements:**

- replace `getDataRange()` with bounded last-row/known-column reads;
- read source tabs once per request and pass arrays through transformers;
- store durable stable IDs and updated/revision timestamps in source rows;
- project only required columns rather than full rows;
- maintain append-only change/revision sheets for incremental sync;
- batch writes and avoid per-row formatting/Drive calls;
- archive inactive years/programs away from active operational tabs.

**PostgreSQL target model:**

- tenant/program, event, participant, staff, school, venue, item, participation, rehearsal, attendance session, attendance mark, form, form version, question, response, file asset, communication campaign, recipient snapshot, task, workflow execution, and audit event tables;
- immutable IDs and explicit foreign keys rather than name matching;
- `program_id`/`tenant_id` on every scoped entity;
- `created_at`, `updated_at`, revision/version, soft-delete/archive fields;
- row-level authorization strategy separate from UI permissions.

**Priority indexes:**

- participants: `(program_id, status)`, `(program_id, school_id)`, normalized name, email, stable student ID;
- participations: `(program_id, participant_id)`, `(event_id, participant_id)`, `(item_id, participant_id)`;
- events/rehearsals: `(program_id, starts_at)`, `(venue_id, starts_at)`, `(status, starts_at)`;
- attendance: unique `(session_id, participant_id)` plus `(participant_id, marked_at)` and `(session_id, status)`;
- tasks: `(assignee_id, status, due_at)`;
- form responses: `(form_version_id, submitted_at)`, `(respondent_id, submitted_at)`;
- communications: `(campaign_id, status)`, `(recipient_id, created_at)`;
- audit: partition by month/program and index `(entity_type, entity_id, occurred_at)` and `(actor_id, occurred_at)`;
- search: PostgreSQL full-text/trigram indexes initially, dedicated search service only when measured demand requires it.

**Critical capacity mismatch:** `PlatformStoreService` rewrites whole JSON collections under a script lock; normal records are constrained to about 8,000 characters, tasks are capped at 100, and audit at 120. Chunked collections still rewrite the complete collection. This is unsuitable for millions of audit events, hundreds of forms, high-volume responses, or concurrent workflows. Migrate these first to PostgreSQL or an approved managed store behind repository interfaces. **Impact: Critical. Complexity: High.**

### 5. Frontend architecture

The current frontend is vanilla HTML/CSS/JavaScript, not React. React-specific advice such as `React.memo`, Suspense, and React Query cannot be applied directly. Equivalent current concerns are repeated full-template replacement, large global mutable `App.state`, extensive HTML-string rendering, and event listener lifecycle.

**Recommendations for the current frontend:**

- isolate route state rather than retaining every module in one global object;
- use event delegation for repeated form/list controls;
- patch changed rows/cards rather than replacing large containers;
- virtualise participant, audit, response, recipient, and attendance tables;
- use `DocumentFragment` or keyed DOM patching for large lists;
- disconnect observers and cancel timers/requests when route scopes are destroyed;
- add `AbortController` semantics in the future API layer so superseded searches cannot render late;
- move editor modules to route-loaded code;
- centralise selectors and prevent duplicate handlers after rerender.

If the frontend is migrated to React/TypeScript, use route-based `lazy()`/dynamic imports, TanStack Query with permission/program-aware query keys, memoised row components, a virtualisation library, error boundaries, and transitions/Suspense for non-blocking navigation. React is not itself a performance fix; the storage/API and payload boundaries matter more.

### 6. Large dataset handling

| Dataset | Current position | Required enterprise pattern |
|---|---|---|
| Participants | server first page, but complete list remains for some workflows | cursor pagination, server filtering/sorting, virtual rows, field projections |
| School groups | separate projection after recent fix | server pagination and aggregate counts by program/item |
| Events/rehearsals | complete cached Timeline transformed in memory | date-window queries, indexed filters, summary/detail split |
| Attendance | bounded landing projection; source adapter still expensive | session revision, delta polling, indexed marks, offline queue |
| Communications | bounded prototype repository | async audience resolution, immutable recipient snapshot, queued delivery |
| Forms/responses | Sheets/Drive-oriented | versioned definitions, paged response query, async exports/uploads |
| Projects/tasks | bounded Properties records | relational task/workflow tables with indexed assignee/status |
| Administration/audit | bounded store | precomputed counters and partitioned append-only audit store |

Prefer cursor pagination over large offset pagination once tables exceed tens of thousands of rows. Infinite scrolling is appropriate for exploratory lists; explicit pages are better for audit/export workflows. Filtering and sorting must happen server-side against indexed fields, not after downloading all rows.

### 7. Search optimisation

The current global search is a fan-out scan over cached source arrays and may trigger cold Timeline, Attendance, Staff, Show Run, participant, and group loads. It ranks using substring rules and returns up to 100 items. This will not feel like Spotlight/Linear at enterprise scale.

**Target search architecture:**

- one denormalised, permission-safe search document per entity;
- fields: entity type, stable ID, program, title, aliases, keywords, navigation route, updated revision, visibility scope;
- incremental index updates from entity changes;
- local cache of recent queries and recently opened commands;
- immediate local command/navigation results, followed by remote entity results;
- 120–180 ms debounce, query cancellation, stale-result suppression;
- typo-tolerant prefix/trigram matching and weighted fields;
- grouped top results rather than loading every source;
- never include restricted fields in the index response.

Start with a PostgreSQL materialized search table plus `pg_trgm`/full text. Do not introduce Elasticsearch/OpenSearch until query volume and relevance requirements justify its operational cost. **Impact: High. Complexity: Medium after database migration.**

### 8. Background loading

The current idle preload is conservative about Save Data, slow connections, and low-memory devices, which is good. It currently preloads Participants and Attendance sequentially.

**Recommended priority model:**

- **Blocking:** identity, permissions, feature flags, route shell;
- **Immediately visible:** Dashboard summary and user's task/notification counts;
- **Idle cache-only:** participant first page, active Attendance summary, today/upcoming event summary;
- **Intent preload:** route code and first query when navigation receives pointer/focus/touch intent;
- **Never speculative:** full participant list, Drive index build, complete Timeline, communication audiences, audit history, form responses.

Install and monitor the existing projection warmer only after ownership and quotas are agreed. Warm shared participant/dashboard/filter projections every 10 minutes and active Attendance summary every 2–5 minutes. Do not have 50 administrators independently rebuild the same projection.

### 9. Cache invalidation

The platform has epochs, typed projection keys, and source refresh commands, but invalidation is not yet one consistent registry. `DataSyncService` removes generic names such as `dashboard`, `timeline`, and `search`, while several real keys include versions, scopes, epochs, or contract-generated digests. User projections are cleared for only the current user when a user object is supplied.

**Recommendation:** create one cache-key registry owned by each domain. Mutations should publish an entity/domain revision; cache keys include that revision, making old values unreachable without enumerating every user cache. Use:

- long-lived immutable reference caches for regions/categories/venues;
- program revision for participant/event reference projections;
- session revision for Attendance;
- form version for forms;
- user-permission revision for scoped projections;
- event-driven deletion only for a small number of stable hot keys.

Expose `cacheStatus`, age, revision, payload bytes, source rows, and refresh owner in diagnostics. Alert on rebuild-busy rate and repeated uncached publication.

### 10. Live updates

Apps Script HTML Service does not provide a robust WebSocket/SSE backend. Do not simulate real time with aggressive full-payload polling.

**Interim:** poll small revision/ETag endpoints, back off when hidden/offline, fetch deltas only after revision changes, and optimistically update the initiating browser while the write is confirmed.

**After backend migration:**

- Attendance: WebSocket/realtime subscription or 5–15 second deltas;
- notifications/task queue: SSE or subscription;
- operational dashboard/timeline: event-driven projection updates;
- communications: queued job status events;
- forms: submission count updates, not full response pushes.

Use a message/event layer (for example Pub/Sub plus a realtime delivery service) behind transactional writes. Preserve an append-only event ID so clients can resume after disconnects.

### 11. Memory and resource usage

The global `App.state` retains data for all modules for the life of the page. Persistent page containers improve revisits but can retain DOM, response arrays, and listeners. Secure images are data URLs, which increase transfer and JS heap compared with browser-cacheable object URLs. Mutation and Intersection observers are long lived. Several recursive timeout loops wait for route data without an explicit maximum.

**Recommendations:**

- set per-module memory budgets and evict inactive heavy route state;
- cap secure image cache by count/bytes and revoke Blob URLs if adopted;
- prefer short-lived signed image URLs or authenticated object responses over base64 data URLs;
- cancel polling, recursive waits, and pending search requests on navigation;
- ensure listener registration is idempotent (Form Builder currently attaches listeners during renders);
- profile heap snapshots after repeatedly opening Profiles, Forms, Communications, and Event drawers;
- instrument long tasks over 50 ms and list render duration.

### 12. UX/perceived performance

SpecCentral already has skeleton/empty states, persistent pages, optimistic route frames, stale first-page restoration, lazy images, and status chips. These are strong foundations.

The largest perceived-speed improvements are:

1. render the navigation shell before font/logo completion;
2. preserve last successful safe projection and label it “Updating” rather than blanking the page;
3. use content-shaped skeletons rather than a central spinner;
4. show first 20–50 rows immediately, then virtualise/stream the remainder;
5. optimistically update task, attendance, and simple status commands with rollback;
6. prefetch on intent rather than after click;
7. keep refresh non-destructive and never replace usable data with an error panel;
8. distinguish “cached”, “updating”, “offline”, and “source unavailable” in diagnostics without exposing internal errors to ordinary users.

### 13. Scalability and multi-program readiness

The service/projection contracts can support multiple programs, but many source names, production assumptions, cache keys, UI labels, and scope checks remain Schools Spectacular-specific. A multi-program system needs program/tenant identity as an explicit input to every query, cache key, asset path, permission, audit event, and background job.

**The current stack is not adequate for:**

- 50 concurrent cache misses rebuilding large projections;
- 100,000 live attendance rows with low-latency updates;
- millions of audit records;
- durable message queues and communication delivery state;
- reliable offline attendance conflict resolution;
- independent teacher/parent/public portals with least-privilege APIs;
- predictable mobile/Safari asset delivery from Drive.

**Target separation:**

- static frontend/CDN;
- authenticated API/BFF;
- PostgreSQL transactional store;
- Cloud Storage private assets with variants and signed/authenticated delivery;
- background job queue/workers for imports, exports, communications, headshots, and projection refresh;
- append-only audit/event store;
- program-aware identity/authorization service;
- observability stack with traces, logs, metrics, and alerts;
- Apps Script/Sheets retained as controlled import/export and administrator integration tools, not the high-concurrency runtime database.

### 14. Headshots and media

The secure proxy removes the browser's direct dependency on Drive authentication for participant/staff headshots, and lazy batches of up to 12 are appropriate. The remaining cold path can recursively scan up to thousands of Drive files when explicit Photo IDs are absent. Data URLs prevent independent browser/CDN caching and increase payload size.

**Recommendation:** make stable asset IDs mandatory after reconciliation, maintain a durable Asset Index, generate small/medium/large WebP variants on upload, and serve private objects through short-lived signed URLs or an authenticated image proxy. Run filename/name matching only as an offline reconciliation job. **Impact: High reliability and mobile performance. Complexity: High due to governance/storage migration.**

## Performance budgets

These targets should be measured at p50 and p95 with cold/warm cache labels, on managed Chrome desktop, Safari desktop, and a managed phone over representative networks.

| Journey | p50 target | p95 target | Additional budget |
|---|---:|---:|---|
| Shell FCP | < 0.8 s | < 1.5 s | critical JS/CSS compressed < 100 KB |
| Dashboard usable, warm | < 1.0 s | < 2.0 s | no source spreadsheet scan |
| Dashboard usable, cold container | < 2.0 s | < 4.0 s | graceful cached/snapshot fallback |
| Navigation to cached route frame | < 100 ms | < 200 ms | no blank page |
| Participant first page, warm | < 0.7 s | < 1.5 s | <= 50 rows, payload < 100 KB |
| Participant first page, cold source | < 3.0 s | < 8.0 s | no `CACHE_REBUILD_BUSY` shown to user |
| Participant search response | < 150 ms | < 400 ms | remote result payload < 50 KB |
| Participant passport/detail | < 0.8 s | < 2.0 s | headshot loads independently |
| First visible headshot batch | < 1.5 s | < 3.0 s | >= 99% authorised-browser success |
| Calendar/Event search | < 250 ms | < 700 ms | indexed date-window query |
| Active Attendance summary | < 0.5 s | < 1.2 s | summary age <= 60 s |
| Attendance mark acknowledgement | < 250 ms | < 700 ms | optimistic UI; durable write confirmed |
| Forms/Communications dashboard | < 0.8 s | < 2.0 s | summaries only, paged records |
| Administration summary | < 1.0 s | < 2.5 s | materialised counts, no global scan |

Platform SLOs:

- cache/projection hit or safe-snapshot rate >= 95% for Dashboard and participant first page;
- `CACHE_REBUILD_BUSY` visible error rate < 0.1%;
- server error rate < 0.5% excluding authorization denials;
- p95 Apps Script RPC count before Dashboard usable <= 1 after bootstrap consolidation;
- no main-thread task > 200 ms during normal navigation;
- stale projection served within budget even when refresh fails;
- image success >= 99% across Chrome/Safari/iOS for authorised accounts.

## Prioritised recommendations

### Phase 1 — quick wins and measurement (approximately 2–4 weeks)

| Priority | Change | Impact | Complexity |
|---|---|---|---|
| P0 | Link an approved GCP project; persist timing samples; display p50/p95/cache outcomes already returned by diagnostics | Makes every later optimisation verifiable | Medium |
| P0 | Install/own monitored projection warmers after quota review | Prevents cold participant/dashboard stampedes | Low–Medium |
| P0 | Complete remote pagination/search/export for Participants; stop background upgrade to complete lists | Removes the largest browser/server collection path | Medium |
| P0 | Fix nested `participants:all` cache ownership in global search | Removes duplicate cache publication/compression | Low |
| P0 | Build a dedicated cached search projection; never fan out to all modules per keystroke | Protects Timeline/Attendance and improves search latency | Medium |
| P1 | Render telemetry summaries in Performance Diagnostics and include sample count/cold-warm labels | Operational visibility | Low |
| P1 | Consolidate bootstrap/minimal Dashboard or parallelise independent startup work | Removes one blocking round trip | Medium |
| P1 | Route-load Form Builder, Communications, Profiles, and Administration code/templates | Reduces startup parse/HTML size materially | Medium |
| P1 | Reduce font weights and package the logo as an approved local/static asset | Faster, more reliable first paint | Low |
| P1 | Increase Staff cache to 30–60 minutes with explicit revision invalidation | Avoids repeated whole-sheet reads | Low |
| P1 | Replace generic invalidation lists with domain key/revision owners | Prevents stale or unintentionally warm data | Medium |
| P1 | Parallelise only cache-peek idle preloads, concurrency limit two | Faster intent readiness without stampede | Low |

Phase 1 exit criteria: 30 cold and 30 warm runs per priority browser/device; Dashboard and Participants meet their p95 targets; no unexplained rebuild-busy errors; measured cache/snapshot rate >= 90%; production telemetry retained for at least 30 days.

### Phase 2 — durable read models and operational scale (approximately 6–12 weeks)

| Change | Impact | Complexity |
|---|---|---|
| Introduce PostgreSQL for stable IDs, participants, programs, events, participations, Attendance, tasks, and workflows behind current service contracts | Removes whole-sheet runtime scans and enables indexed queries | High |
| Add change-data/revision sync from Sheets during transition | Preserves current operational ownership while database becomes the read model | High |
| Move tasks, audit, workflow versions, form definitions/responses, and communications out of Script Properties | Removes severe capacity/concurrency limit | High |
| Add Attendance transaction/revision index and delta API | Enables fast live roll updates and offline reconciliation | High |
| Implement cursor pagination and virtual tables across all large modules | Stable browser performance at 8,000+ records | Medium |
| Add async jobs for imports, exports, audience resolution, email, and asset processing | Removes long user-blocking executions | High |
| Build Asset Index and Cloud Storage headshot variants | Reliable, cacheable mobile/Safari media | High |
| Compile/minify frontend with TypeScript and route bundles while preserving current visual design | Smaller delivery and safer module boundaries | Medium–High |

### Phase 3 — enterprise optimisation (approximately 3–9 months, incremental)

| Change | Outcome | Complexity |
|---|---|---|
| Move public runtime API from Apps Script to an approved autoscaling service | Predictable concurrency, tracing, streaming, longer jobs | High |
| Add program/tenant-aware authorization and row-level policies | Multiple Arts Unit programs and external portals | High |
| Event-driven projections with queue/pub-sub workers | Near-real-time Dashboard, Attendance, notifications, and communications | High |
| Realtime gateway for Attendance/operations; resumable event IDs | Responsive multi-admin collaboration | High |
| Partitioned audit/event store and retention/export policy | Millions of auditable events | High |
| Offline-first Attendance client with conflict rules and encrypted local queue | Venue resilience | High |
| CI performance budgets, synthetic journeys, load tests, SLO dashboards and alerts | Prevents regression and supports operational ownership | Medium–High |

## Scorecard

Scores reflect the repository as reviewed, not the intended future architecture.

| Area | Score | Rationale |
|---|---:|---|
| Performance | **63/100** | Good projection/cache fixes and lazy data paths; large all-route shell, Apps Script cold starts, and cold whole-sheet reads remain. |
| Scalability | **38/100** | Bounded paging helps, but Sheets, Properties, CacheService, and Drive scans cannot meet stated enterprise volumes/concurrency. |
| Frontend architecture | **58/100** | Central request layer, persistent routes, stateful modules, and lazy images are positive; monolithic global runtime and no route code splitting are material debt. |
| Backend architecture | **52/100** | Clear services/contracts/capabilities and cache generation design; persistence and invalidation remain prototype-grade. |
| UX performance | **70/100** | Strong visual continuity, skeletons, stale restoration, and first-page strategy; blank/error states and delayed cold projections still occur. |
| Enterprise readiness | **41/100** | Security boundaries and contracts are emerging, but durable storage, observability, concurrency, audit scale, environments, and operational SLOs are incomplete. |

**Overall enterprise readiness: 54/100.**

This is a healthy score for a rapidly evolving internal prototype, but not a production enterprise platform score. The most important positive is that current service/projection contracts create seams for migration. The most important risk is allowing prototype storage to become permanent while UI features and record volume continue to grow.

## Recommended immediate decision

Approve a measured Phase 1 performance package before adding more high-volume modules. In parallel, begin a small architecture spike that places PostgreSQL and private object storage behind the existing participant/attendance/headshot contracts. Do not wait for a complete rewrite: migrate one hot read model at a time, validate it against the spreadsheet source, and retain Sheets as an integration/operational input during transition.

