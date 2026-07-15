# TAU Central and SpecCentral whole-platform status and performance review

**Review date:** 15 July 2026  
**Scope:** TAU Central, SpecCentral/Participants, Attendance, Forms, Timeline, Show Run, staff and school data, caching, deployment boundaries, and headshot delivery.

This is a static architecture and code-path review of the workspace as it exists on the review date, supplemented by current official Google platform guidance. It identifies likely bottlenecks from the actual execution paths; it is not a production load test. Phase 0 below turns those findings into measured p50/p95 baselines before major storage decisions are made.

## Executive assessment

The project is a strong and unusually broad prototype. It already has a coherent portal shell, permissions, participant and staff models, program and form workflows, event and attendance operations, multiple cache layers, source registries, and deployment automation. The main constraint is no longer missing capability. It is that the platform has grown across several Apps Script projects and spreadsheets faster than its data ownership and loading model have been consolidated.

The highest-value finding is that the current SpecCentral start-up path waits on the complete participant, group and school payload after resolving the signed-in user. This happens even on the Dashboard. A cold request can therefore read three spreadsheet datasets, build models, filter them for the current user, compress and cache the result, transfer the result to the browser, save it into `sessionStorage`, and rebuild client-side search before secondary Dashboard data starts. That is the opposite of the lightweight start-up described in parts of the existing documentation and is the most likely cause of variable, sometimes long loading times.

The second major finding is that headshots have two delivery strategies:

- SpecCentral resolves authorised images server-side and sends base64 data URLs in batches of up to 12.
- Attendance scans the same Drive folder into its own cache and emits `drive.google.com/thumbnail` URLs.

Drive thumbnail links are authentication- and browser-session-sensitive. Google documents that Drive `thumbnailLink` values are short-lived, are not intended for direct use by web apps because of CORS, and require credentialed requests for non-public files. This fits the reported behaviour: Chrome works while logged into the right Google account, but Safari or a phone may not. [Google Drive Files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files?hl=en)

### Overall status

| Area | Status | Assessment |
|---|---|---|
| Product coverage | Strong prototype | The platform covers most operational domains and has a clear TAU/SpecCentral direction. |
| UI architecture | Good, becoming large | Shared shells and modules are coherent, but SpecCentral serves most page markup and client code in one initial HTML document. |
| Data ownership | Functional but fragmented | Sources are known, but ownership, projections and duplicated caches need formal boundaries. |
| Permissions | Strong foundation | SpecCentral has capability and scope checks. Deployment access differs between projects and needs a formal security review. |
| Caching | Substantial but inconsistent | Several good caches exist, but they are project-local, independently versioned, and do not remove the largest cold-start work. |
| Performance | Warm can be good; cold is unpredictable | Full-sheet reads, Drive scans, large initial payloads and serial start-up dependencies dominate cold paths. |
| Headshots | Not cross-browser reliable | Direct Drive thumbnail use should be retired for private student photos. |
| Maintainability | Moderate | 31,000+ lines across 198 Apps Script/HTML files; shared contracts and observability now matter more than further feature expansion. |

## Current platform map

There are three deployable Apps Script applications:

| Application | Script project | Access configuration | Primary responsibility |
|---|---|---|---|
| SpecCentral / Participants | `1rbiomvSfdnPop9gQhuFF0N_mWiQp-6TrxPbVemP7lvcec_sHMjThlhp5` | Domain users; executes as deployer | Portal, identity, participants, staff, Timeline projections, Forms, operations and cross-source views |
| Attendance | `1Jn4eQnnfX1aLyFcbrCkneqOFnZlwf38g43Gb1s9KPJwKb0LyE7lcq_Au` | Currently anonymous-capable; executes as deployer | Event rolls, attendance mutations, check-in and attendance history |
| TAU Central | `1DvbvoBxQao54_qvIRMaVS8r3P9Zp0YLq5HyWeSJgJav4rT_2RZ4imrkP` | Any signed-in user; executes as deployer | Whole-of-Arts-Unit program, form and workflow prototype |

The current source landscape includes:

| Source | Current role | Recommended authority |
|---|---|---|
| Participants workbook | Individuals, groups and schools | Canonical participant, application outcome, group and school-participation records |
| Staff workbook | Staff List, SpecCentral access overrides, event allocation | Canonical staff directory and staff-to-program/event allocation |
| Timeline workbook | Rehearsals, dates, venues and operational events | Canonical operational schedule until a dedicated event store exists |
| Show Run workbook | Numbered production items and running order | Canonical show-item/running-order source |
| Attendance workbook | Event Index and one sheet per roll | Canonical attendance transactions while Sheets remains the operational store |
| TAU database workbook | Programs, forms and prototype platform data | Canonical whole-of-unit program catalogue and workflow metadata |
| Drive headshot folder | Student image binaries matched mainly by filename | Temporary source only; migrate to stable-ID asset storage |
| Drive support-plan folder | Restricted support documents matched by filename | Restricted document source; add a stable document index |

### Important clarification about the empty SpecCentral spreadsheet

Apps Script source should not be moved into spreadsheet cells. The repository plus `clasp` should remain the code source of truth because it provides version history, review, rollback and deployment discipline. A spreadsheet-bound script is still an Apps Script project; placing code beside an otherwise empty sheet does not make execution faster or more cohesive.

The underused SpecCentral workbook can, however, become a useful **platform control plane**. It is an appropriate home for small, operationally editable tables:

- `Source Registry`: logical source name, spreadsheet ID, sheet ID/name, owner and schema version.
- `Roles` and `Role Grants`: role-to-capability definitions.
- `User Overrides`: exceptional access with owner, reason and expiry.
- `Feature Flags`: module, environment, enabled state and rollout notes.
- `Cache Epochs`: source version numbers changed after imports or writes.
- `Integration Health`: source, last success, duration, row count and last error.
- `Schema Registry`: expected columns and migration status.
- `Announcements`: small platform-wide operational messages.
- `Import Log`: job ID, source version, rows accepted/rejected and error report link.

It should not hold secrets, image binaries, large participant projections, raw audit logs, or duplicated copies of every operational dataset. Secrets belong in Script Properties or a proper secret manager. Large data remains with its domain owner.

## Recommended responsibility model

Use one authoritative owner per record type and treat everything else as a read model or projection.

| Domain | Authoritative owner now | Consumers | Recommended boundary |
|---|---|---|---|
| Programs and approvals | TAU workbook | TAU Central, future SpecCentral program selector | TAU owns program identity/status; other apps reference `programId`. |
| Forms and workflows | TAU/Spec form services | TAU and SpecCentral | One shared form schema and workflow contract; program applications reference `formId` and version. |
| Students and applications | Participants workbook | SpecCentral, Attendance, forms | Participants owns stable `studentKey`; consumers do not create alternate identities. |
| Staff | Staff workbook | All apps | Staff owns stable `staffId`, login mapping and assignments. Access policy can be projected into the control plane. |
| Schools | Participants school master or an agreed directory | TAU and SpecCentral | One stable `schoolId`; do not rely on display-name joins. |
| Venues | Dedicated TAU directory | Timeline and events | TAU owns `venueId`; Timeline stores the ID and display snapshot. |
| Schedule/events | Timeline | SpecCentral, Attendance, shared calendar | Timeline owns `eventId`; Attendance references it rather than matching date/name/location. |
| Show items | Show Run | SpecCentral, Timeline, Attendance | Show Run owns `itemId`/item number; projections retain the stable ID. |
| Attendance | Attendance store | SpecCentral profiles and reporting | Attendance owns append/update transactions plus a materialised history index. |
| Headshots | Recommended private object store | SpecCentral, Attendance, TAU | Asset service owns `studentId -> object key/version`; apps never expose Drive IDs. |

This produces a simple rule: **write to the owner; read from a fit-for-purpose projection**. It prevents two modules from silently editing competing copies of the same fact.

## Performance and loading review

### 1. SpecCentral critical path

The current client sequence is:

1. Build client state, handlers and secure-image observer.
2. Call the server for identity.
3. Restore a participant payload from `sessionStorage`, if available.
4. If the user has `Participants.View`, call `portalGetPortalData` regardless of the initial page.
5. Navigate and render the route.
6. Start config, Dashboard production overview and calendar prefetch after the participant request settles, with a 2.5-second fallback.

`portalGetPortalData` obtains participants, groups and active schools. On a cache miss, those operations perform full `getDataRange().getDisplayValues()` reads. Participant records include contact and operational fields well beyond what the Dashboard requires. The payload is filtered and projected server-side, then cached for 30 minutes in the browser and copied into `sessionStorage`.

**Required change:** the initial page must not depend on the participant collection.

Create one `portalBootstrap()` call returning only:

- signed-in identity and permission signature;
- visible navigation;
- feature flags;
- source/cache version manifest;
- current date and a minimal Dashboard summary;
- a small list of actionable notifications.

Render the shell and Dashboard from that response. Load the participant index only when the Participants module or global search is used, or during browser idle time after the current page is interactive.

### 2. Split participant index from participant profiles

The browser does not need complete family contact, medical/support flags and notes for every participant to display a list.

Introduce:

- `ParticipantIndex`: stable ID, display name, school ID/name, year, category/item, status and `hasPhoto`.
- `ParticipantProfile`: detailed contact, parent/teacher, support and application fields, fetched by stable ID on demand.
- `ParticipantSearchIndex`: pre-normalised searchable tokens and only the result-summary fields.

This reduces serialisation, transfer, JavaScript parsing, memory use and risk of unnecessarily exposing sensitive fields. Paginate or virtualise large lists and fetch a profile only when opened.

### 3. Stop using full-sheet reads in interactive paths

Full-range reads are acceptable in scheduled imports and cache rebuild jobs, but not repeatedly in user interactions. Google recommends minimising service calls and batching spreadsheet reads/writes because remote service calls dominate Apps Script execution time. [Apps Script performance best practices](https://developers.google.com/apps-script/guides/support/best-practices)

Priority examples:

- Participant, group and school services use `getDataRange()` on cold cache.
- Timeline reads the entire operation sheet.
- Attendance session refresh reads the complete event sheet every 20 seconds.
- Attendance history reads the Event Index and then every event sheet.
- Attendance Dashboard totals scan every event sheet.
- Cold headshot/support-plan indexes scan complete Drive folders.
- TAU repository reads whole tables for generic list operations.

Replace interactive scans with bounded ranges, stable indexes and materialised views. It is fine for a trigger to do one larger batch read periodically; the user-facing request should read the prepared result.

### 4. Attendance needs a transaction/index model

Attendance currently refreshes the selected roll every 20 seconds by re-reading the entire event sheet. It also computes a student's history by scanning all event sheets.

Recommended near-term Sheet model:

- Keep event sheets as human-operable roll views.
- Add an `Attendance Transactions` table: `eventId`, `studentKey`, status, note, marked time, marked by and revision.
- Add a `Participant Attendance Index` table maintained on every mark or scheduled reconciliation.
- Add an `Attendance Summary` table maintained incrementally for Dashboard totals.
- Return a session `revision` or `updatedAt` from the API.
- Poll with `sinceRevision`; return only changed rows.
- Pause polling when the tab is hidden; use 5–10 seconds after a user action and 30–60 seconds while idle.
- Render optimistic updates immediately, then reconcile with the server response.

This preserves the spreadsheet workflow while eliminating repeated N-sheet scans.

### 5. Static application size

SpecCentral includes all major module pages and client application files in the initial HTML response. This makes navigation instant after load, but increases first-load parsing and transfer even for modules the user cannot access or will not visit.

Apps Script HTML Service does not provide modern route chunking automatically. Near-term options are:

- keep the shell, common styles and current route in the initial document;
- defer expensive module initialisation until navigation;
- avoid creating large option lists or tables before visible;
- split unusually heavy tools, such as the Forms editor, into a separately loaded workspace or deployment if measurement shows initial HTML is material;
- remove backup/legacy files from deployed Apps Script projects when they are not required at runtime.

Do this after the participant critical path is fixed; the large data request is the more important issue.

## Cache review

### Existing strengths

- SpecCentral has permission-scoped client cache keys.
- It deduplicates identical in-flight requests.
- It can return stale visible data when a refresh fails.
- Server data can be gzip-compressed and split across Cache Service entries.
- Identity is cached at memory, user-cache and script-cache levels.
- Participant/group/school data is cached for 30 minutes.
- Timeline is cached for 5 minutes; Show Run for 10 minutes; photos for 6 hours.
- Manual sync and cache invalidation paths exist.

These are good foundations. Cache Service supports entries up to 100 KB and a maximum of 1,000 entries, but cached data is temporary and can disappear before its requested expiry. It must remain an acceleration layer, never the durable system of record. [Apps Script Cache reference](https://developers.google.com/apps-script/reference/cache/cache)

### Current weaknesses

| Issue | Effect | Recommendation |
|---|---|---|
| Caches are project-local | SpecCentral and Attendance independently scan/cache the same photos and source data | Give one service responsibility for an expensive projection, or publish a shared materialised index. |
| Cache misses block users | The first user after eviction pays all sheet/Drive read costs | Prewarm during operating hours and use stale-while-revalidate snapshots. |
| No single-flight server lock | Concurrent misses can all rebuild the same large cache | Use `LockService` around expensive rebuilds; recheck cache after taking the lock. |
| Mixed key/epoch conventions | A source refresh may invalidate one projection but leave dependent projections stale | Central cache manifest with source epochs and explicit dependency invalidation. |
| Large participant payload in session storage | Mobile memory/quota pressure and expensive JSON parse | Store only a slim index; use IndexedDB if durable client data is truly required. |
| In-process staff cache | Apps Script executions are short-lived, so it adds little beyond Cache Service | Keep for same-execution reuse but do not count on it across requests. |
| Properties used for growing structured data | Apps Script Properties are designed for small configuration, not an application database | Move forms/responses/jobs to Sheets or a database before volume grows. |
| Long TTLs without versioned assets | Updates can remain invisible or require broad cache clearing | Use stable IDs plus content version/hash in cache and asset URLs. |

Apps Script Properties are project-specific string stores with limited value and total storage sizes. They are suitable for source IDs, secrets and a few flags, not unbounded forms, responses, notifications or audit records. [Properties Service guide](https://developers.google.com/apps-script/guides/properties) and [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas?authuser=01&hl=en)

### Recommended cache hierarchy

1. **Durable authoritative data:** the owning Sheet or database.
2. **Durable materialised views:** compact `ParticipantIndex`, `DashboardSummary`, `AttendanceHistoryIndex` and `AssetIndex` tables or database collections.
3. **Apps Script Cache:** compressed results keyed by source version and permission scope.
4. **Browser memory:** current route data and small recent profiles.
5. **Browser persistent cache:** only non-sensitive, versioned indexes; prefer IndexedDB over large `sessionStorage` JSON.

Every response should include `dataVersion`, `generatedAt` and `stale` metadata. The browser can display a warm snapshot immediately and refresh silently when its version is behind.

### Cache warming and invalidation

- A scheduled trigger refreshes high-value projections shortly before and during active operating hours.
- Every write increments the relevant source epoch in the control plane.
- Cache keys include that epoch, so old entries naturally stop being selected.
- Imports rebuild projections once at the end, not once per imported row.
- Manual Sync becomes an observable job returning rows, duration, warnings and new version.
- Keep a last-known-good durable snapshot so Cache Service eviction never forces the Dashboard to wait on all raw sources.

## Headshot and private-file strategy

### Root cause

Direct `https://drive.google.com/thumbnail?id=...` URLs rely on the browser being able to authenticate to Drive and being allowed to fetch that private object. They can therefore work in the owner's Chrome session and fail in Safari, an incognito context, or a phone. Making student photos publicly shared would remove the login dependency but is not an acceptable default for child images.

SpecCentral's `SecureImageService` avoids exposing Drive IDs and validates the requesting user's scope. It is safer, but each uncached request can still:

- load participants or staff;
- load/rebuild the photo index;
- call Drive metadata;
- download or generate a thumbnail;
- base64-encode it, adding roughly one-third transfer overhead;
- return it through `google.script.run`.

Its user-cache only stores responses below a size threshold, so many images may not be cached. Attendance bypasses this service entirely.

### Preferred production option: private Cloud Storage assets

Use a private Google Cloud Storage bucket, ideally in the organisation's approved project and region, with:

- object keys based on stable IDs, not names: `students/{studentKey}/headshot/{version}/thumb-180.webp`;
- upload-time validation, cropping and generated sizes such as 64, 180 and 640 pixels;
- an `AssetIndex` containing owner ID, object key, version, MIME type, dimensions, consent/retention metadata and updated time;
- server-side permission checks before issuing access;
- short-lived signed read URLs or a controlled authenticated proxy;
- private caching headers appropriate to the chosen delivery approach;
- no public bucket or public object ACLs.

Cloud Storage signed URLs give time-limited access to one object without relying on the viewer's Google browser session. Anyone possessing the URL can use it until expiry, so URLs should be short-lived and only issued after an application permission check. [Cloud Storage signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls?hl=en)

This is the most reliable cross-browser option and removes image bytes from Apps Script responses. It does require cloud project ownership, IAM/service-account setup, privacy review, data residency confirmation, lifecycle/retention rules and cost monitoring.

### Safe interim option while remaining on Drive

Unify both applications behind one permission-checked photo resolver:

1. Build a durable `AssetIndex` once, using `studentKey` and Drive file ID. Stop matching filenames on every cold cache.
2. Have Attendance request images through the same authorised resolver instead of emitting Drive thumbnail URLs.
3. Request only visible images using lazy loading and small batches.
4. Generate and store small thumbnail derivatives rather than downloading multi-megabyte originals.
5. Cache by `studentKey + assetVersion + size + permissionSignature`.
6. Never return the Drive ID or source URL to the browser.

This will be slower and more quota-sensitive than Cloud Storage because Apps Script still transports base64 data, but it will behave consistently across browsers while preserving privacy.

### Options not recommended

- **Anyone-with-link Drive sharing:** reliable rendering at the cost of making child images accessible to anyone who obtains the link.
- **Embedding complete photo maps in participant payloads:** excessive transfer, memory and privacy exposure.
- **Filename-only matching:** breaks on duplicate names, renamed files and punctuation differences.
- **Using the empty SpecCentral sheet to hold base64 images:** creates very large sheets and slow reads without solving delivery or access control.

## Security and operational observations

1. Attendance is configured as `ANYONE_ANONYMOUS` and executes as the deploying user. Its public API deliberately limits participant data and its internal history endpoint uses a secret, which is good, but the whole deployment should be reviewed because it sits beside student check-in, Drive photos and support-plan logic.
2. TAU Central is configured for `ANYONE`, while SpecCentral is domain-only. Agree a platform access policy and document why each public surface exists.
3. The three projects execute as the deployer, so service calls use broad deployment identity. Server-side capability checks are mandatory for every data endpoint; hiding a menu item is not authorisation.
4. Source IDs are hard-coded in several services. Move operational IDs to the control-plane registry or Script Properties. Keep secrets only in protected properties/secret storage.
5. TAU Central uses the Adelaide timezone while SpecCentral and Attendance use Sydney. Align them or store all timestamps in UTC with an explicit display timezone to prevent schedule and deadline errors.
6. Sensitive support-plan and contact data should be excluded from bulk indexes and logged only by stable ID, not full content.
7. Add data retention, consent and access-audit requirements before centralising student images.

## Storage evolution options

### Option A — optimised Apps Script and Sheets

Best for the next stage. Keep the three deployments, formalise ownership, add materialised indexes, improve start-up and unify assets.

**Advantages:** lowest migration risk, familiar operations, retains human-editable Sheets.  
**Limits:** per-project caches, Apps Script execution ceilings, increasing complexity as concurrency and data volume grow.

### Option B — TAU Central control plane with specialised services

Make TAU Central the whole-of-unit shell and program registry. SpecCentral becomes the Schools Spectacular program workspace. Attendance remains a specialised, high-write service. Shared contracts cover identity, programs, forms, events and assets.

**Advantages:** cohesive user experience without forcing all operational code into one project.  
**Limits:** requires disciplined APIs and stable identifiers.

### Option C — managed application backend

Move high-volume indexes, forms/workflows, attendance transactions and asset delivery to a managed backend such as Cloud Run/Functions with Firestore or Cloud SQL; use Cloud Storage for assets and BigQuery for analytics. Retain Apps Script for import/export and staff automation around Sheets.

**Advantages:** predictable queries, stronger concurrency, proper asset delivery, event-driven workflows and observability.  
**Limits:** cloud governance, engineering ownership, cost, IAM and migration effort.

Do not begin with a wholesale rewrite. Option A creates the contracts and measurements needed to decide when individual domains should move to Option C.

## Prioritised delivery roadmap

### Phase 0 — measure and stabilise (1–2 weeks)

- Add a correlation ID and server timings to bootstrap, participant index, Timeline, Attendance and image calls.
- Record cache hit/miss, payload bytes, sheet rows read, duration and source version.
- Establish performance budgets and capture Chrome, Safari and phone results.
- Align timezones and review Attendance/TAU deployment access.
- Document canonical IDs for program, student, staff, school, venue, event and show item.

**Exit criteria:** a dashboard or diagnostic report shows p50/p95 duration and cache hit rate for each critical call.

### Phase 1 — near-instant shell and Dashboard (1–3 weeks)

- Add one minimal `portalBootstrap()` endpoint.
- Remove `portalGetPortalData()` from the initial Dashboard critical path.
- Load Dashboard summary and calendar concurrently after identity/bootstrap.
- Create a durable, precomputed Dashboard summary.
- Split participant index from participant profile.
- Add server-side locking and stale-while-revalidate behaviour to expensive loaders.

**Exit criteria:** warm Dashboard interactive in under 1.5 seconds on a managed desktop and under 2.5 seconds on a typical phone; no full participant payload before user interaction.

### Phase 2 — cache and Attendance redesign (2–4 weeks)

- Introduce the control-plane workbook tabs and source epochs.
- Add scheduled projection warming.
- Add Attendance transaction, participant-history and summary indexes.
- Implement revision/delta roll refresh and adaptive polling.
- Remove N-event-sheet history and Dashboard scans from interactive requests.

**Exit criteria:** attendance refresh transfers only changed rows; participant history performs one indexed read; a cold cache does not blank the Dashboard.

### Phase 3 — headshot migration (2–5 weeks, governance dependent)

- Create `AssetIndex` keyed by student/staff ID.
- Fix duplicate/missing mappings and generate thumbnail variants.
- Route Attendance through the current secure resolver as an interim fix.
- Approve and implement private Cloud Storage plus short-lived access.
- Test with Chrome, Safari, iOS and Android using accounts other than the deployer.

**Exit criteria:** authorised images render consistently in all supported browsers; no Drive IDs/public links reach the client; list thumbnails load lazily.

### Phase 4 — platform consolidation (ongoing)

- Adopt shared form, program, event and asset contracts.
- Make SpecCentral a TAU program workspace while keeping service boundaries.
- Move Properties-backed growing stores into Sheets or a managed database.
- Migrate the first scaling bottleneck—not every module at once—to a managed backend.

## Performance targets

| Interaction | Target p50 | Target p95 | Notes |
|---|---:|---:|---|
| Shell visible | < 0.8 s | < 1.5 s | Excludes Google sign-in redirects. |
| Dashboard interactive, warm | < 1.2 s | < 2.5 s | Must not wait for participant collection. |
| Dashboard interactive, cold | < 2.5 s | < 5 s | Show last-known-good summary while refreshing. |
| Participant search | < 150 ms | < 400 ms | Against a prepared slim search index. |
| Participant profile open | < 300 ms | < 1 s | One stable-ID lookup; photo may complete separately. |
| Attendance mark feedback | < 100 ms | < 250 ms | Optimistic UI; server confirmation target < 1 s p50. |
| Attendance delta refresh | < 500 ms | < 1.5 s | No complete-sheet transfer when unchanged. |
| Visible headshot | < 300 ms cached | < 1.5 s uncached | Small derivative, lazy and cross-browser. |

## Immediate decisions requested

1. Approve the SpecCentral workbook as the platform control plane, or nominate a dedicated new workbook for that purpose.
2. Confirm that TAU Central will become the program registry and shell while SpecCentral remains a specialised program workspace.
3. Approve a security review of the anonymous Attendance deployment before broader rollout.
4. Choose a headshot path:
   - interim Drive proxy plus stable asset index; then Cloud Storage, or
   - direct Cloud Storage migration.
5. Agree the performance targets above so changes can be assessed objectively.

## Recommended first implementation package

The first package should be deliberately narrow:

1. Instrument current timings.
2. Add `portalBootstrap()`.
3. Stop initial participant loading on Dashboard.
4. Create slim participant/search and Dashboard summary projections.
5. Add cache-miss locking and scheduled warm-up.
6. Build a stable-ID `AssetIndex` and route both portals through one secure image contract.

That package directly addresses the observed loading and headshot problems without a disruptive rewrite, and it establishes the architecture needed for TAU Central and SpecCentral to become one cohesive platform.

## Implementation status — first performance package

**Implemented locally on 15 July 2026; not deployed.**

- Added the authenticated, participant-free `spec-central-bootstrap-v2` contract with explicit module/action permissions and nested platform control metadata.
- Removed participant restoration/loading and headshot work from full-page Dashboard startup.
- Added cache/snapshot-only Dashboard participant summaries.
- Added slim participant-list and stable-ID, permission-scoped participant-detail contracts.
- Added PII-free startup, projection, payload and cache instrumentation with p50/p95 aggregation.
- Added versioned, atomic, single-flight cache rebuild behaviour and explicit epoch support.
- Added opt-in shared projection warming; no trigger was installed.
- Added the storage-agnostic `headshot-asset-v1` facade in SpecCentral and a matching Attendance contract. Attendance client migration and Cloud Storage remain outstanding.
- Added focused Apps Script regression harnesses.

The architecture-level Dashboard path now performs zero complete participant requests and zero participant source-sheet scans. Live before/after milliseconds require a reviewed non-production deployment and are intentionally not claimed here. Full contracts, collection instructions, limitations and test entry points are documented in `Docs/FirstPerformancePackage.md`.

## Implementation status — progressive loading Step 3

**Implemented locally on 15 July 2026; not deployed.**

- Added a stable, permission-scoped first-page participant query shared by idle preload, navigation intent and Participants route entry.
- Added five-minute freshness/30-minute retained server stale-while-revalidate behaviour that preserves the last complete value when refresh fails.
- Limited participant browser persistence to an allow-listed first page for 15 minutes in `sessionStorage`; the complete slim list is memory-only.
- Removed persisted participant search history/recently viewed names and startup cleanup of legacy values.
- Added guarded post-Dashboard idle preloading and hover/focus/touch intent, with permission, feature, maintenance, reduced-data, slow-network and low-memory checks.
- Added cache-only Attendance summary preloading that cannot contact the Attendance web app or scan event sheets.
- Kept participant detail permission-scoped and stable-ID driven, with headshots separately intersection-loaded only for visible rows/details.
- Added preload/cache/stale instrumentation and regression coverage. The harness now verifies 24 server contracts.

The verified blocking Dashboard path remains zero participant dataset loads, zero participant source scans, zero Attendance summary/event calls and zero participant headshot calls. Live timing comparisons still require a reviewed test deployment; no milliseconds are claimed from static tests. The trace, request flows, cache lifetimes, persistence policy and measurement procedure are documented in `Docs/ProgressiveLoadingArchitecture.md`.

## Implementation status — final projection/cache/headshot phase

**Implemented locally on 15 July 2026; not deployed.**

- Formalised and validated `dashboard-v2`, `participant-list-v2`, `participant-list-page-v2`, `participant-filter-v1`, `participant-detail-v2` and `attendance-active-v1` read models.
- Added shared scope-specific participant projections, server-side page/search/filter parameters and an independently cached filter projection.
- Upgraded the cache to per-projection expiring leases and immutable generation publication with the active pointer written last; failed validation/refresh retains the prior generation.
- Added targeted participant/Attendance projection epochs, safe cache metadata, event-driven sync invalidation and opt-in 10-minute/5-minute warmers. No trigger was installed.
- Established `headshot-asset-v2` as the canonical SpecCentral permissioned service with stable IDs and small/medium/large variants.
- Migrated Attendance rendering away from client-built Drive thumbnail URLs to visible-only batched asset requests. Its preferred server adapter calls SpecCentral after local event-scope authorisation; a feature-flagged row-ID Drive adapter remains only for staged rollout.
- Removed the independent Attendance headshot folder scan/cache and several PII-bearing logs on the affected paths.
- Added projection, cache-generation, stale fallback, lease expiry, asset contract and client lazy-loading regressions.

The complete contracts, cache lifetimes, security model, test evidence, limitations, rollback and Cloud Storage prerequisites are documented in `Docs/ProjectionCacheAssetArchitecture.md`. Live latency/headshot p50/p95 and Safari/mobile results still require a reviewed test deployment and are not claimed.
