# SpecCentral Performance Optimisation Implementation Roadmap

**Status:** Proposed — no implementation authorised  
**Owner perspective:** Lead Software Architect  
**Input:** `SpecCentralPerformanceScalabilityAudit.md`  
**Objective:** Deliver the smallest stable change set that produces the largest measurable improvement while feature development continues.

## 1. Executive summary

The audit's strategic direction remains valid, but implementing it wholesale would be a mistake. SpecCentral does not need a React rewrite, GraphQL, WebSockets, Kubernetes, microservices, distributed cache, or an immediate full PostgreSQL migration to become materially faster.

The performance evidence points to four dominant causes:

1. **cold shared data paths:** participant and Timeline source reads can still be expensive after cache eviction;
2. **collection overreach:** some Participant and global-search workflows still load or scan complete collections;
3. **startup serialization:** lightweight bootstrap and Dashboard are separate blocking RPCs;
4. **all-route delivery:** approximately 687,723 raw bytes of UI code/templates/styles are delivered at initial load.

The highest-ROI sequence is therefore:

1. establish durable measurements and a repeatable baseline;
2. finish server-side Participant pagination and remove complete-list upgrades;
3. replace global-search fan-out with one bounded search projection;
4. operate the existing shared projection warmers and fix cache ownership/invalidation;
5. reduce startup from two serial calls to one safe composite projection;
6. route-load the three largest non-dashboard modules;
7. only then pilot durable storage for the workloads that actually exceed Apps Script limits.

The first four items are expected to remove most visible timeout/cache-busy failures without changing the platform's visual design or authoritative spreadsheets. They are the 20% of work most likely to deliver 80% of the near-term gain.

## 2. Critical reassessment of the audit

### Recommendations that should be done now

| Recommendation | Why it survives reassessment |
|---|---|
| Durable performance telemetry and test journeys | The system already emits useful metrics, but the six-hour/240-sample cache cannot prove improvement and `clasp logs` is unavailable without a linked GCP project. |
| Complete Participant server pagination | Recent `CACHE_REBUILD_BUSY` and 50-row behaviour directly involved this path. Some rich workflows still upgrade to complete collections. |
| Dedicated search projection | One search can currently touch Participants, Groups, Timeline, Staff, Show Run, and Attendance. This is a concentrated latency and cache-stampede risk. |
| Projection warmer ownership | The code exists and is independently deployable, but an installed/monitored schedule is not established. Warm shared reads prevent many cold-path failures. |
| Remove nested cache ownership | `PlatformSearchService` and `ParticipantService` both claim `participants:all`; a miss causes redundant publication/compression work. |
| Startup projection consolidation | It removes a whole serial Apps Script round trip from the most important journey without requiring a new backend. |
| Targeted route loading | Form Builder, Communications, Profiles, and Participants account for a large share of initial source despite not being needed on Dashboard. |

### Valid recommendations that should be postponed

| Recommendation | Decision | Trigger for reconsideration |
|---|---|---|
| Broad PostgreSQL migration | Pilot, do not migrate everything | Participant/Attendance load tests fail targets after projection work, or production volume/concurrency is approved. |
| Cloud Storage media migration | Postpone implementation; complete design/governance | Headshot success remains below 99%, Drive quotas become limiting, or asset governance is approved. |
| Attendance realtime transport | Postpone WebSockets; design revision/delta endpoint first | Multiple concurrent roll managers require <5-second consistency. |
| Full TypeScript/React rewrite | Postpone | Feature velocity, defect rate, or route-splitting constraints justify migration independently of performance. |
| Dedicated external search engine | Postpone | PostgreSQL trigram/full-text cannot meet relevance/latency at measured volume. |
| CDN/static hosting migration | Postpone until route bundles exist | Static frontend is approved outside Apps Script and initial transfer remains over budget. |

### Premature or low-value optimisations

| Recommendation | Why it is low ROI now |
|---|---|
| GraphQL | Does not remove spreadsheet reads, Apps Script cold starts, or fan-out unless resolver/storage architecture also changes. |
| React memoisation | The application is not React; introducing React solely for memoisation increases scope and regression risk. |
| Virtualise every table | Participant pages are currently bounded to 50. Virtualisation matters only where a route intentionally renders hundreds of rows. |
| Reduce font weights | Easy and worthwhile housekeeping, but unlikely to address current multi-second/time-out failures. |
| Optimise the logo | Improves reliability and a small asset request, not the dominant server latency. |
| WebSockets/SSE | Apps Script is not a suitable persistent-connection backend; revision polling produces more value first. |
| Distributed cache/Redis | Valuable only with a new backend. It cannot be cleanly inserted into the current Apps Script runtime. |
| Microservices/Kubernetes/global scaling | No present operational justification; would multiply deployment and observability overhead. |
| Aggressive speculative prefetch | Can worsen cache rebuild contention and quotas. Only cache-peek or intent-based prefetch should be used. |

### Assumptions challenged

1. **The 688 KB shell is not automatically the biggest latency problem.** Its approximate compressed size is 137 KB, which may be acceptable on desktop. Route splitting remains useful for parse/maintenance, but cold spreadsheet/RPC latency is more likely to dominate. It belongs in Sprint 2, not first.
2. **More caching is not automatically better.** The platform already has many overlapping caches. Clear ownership, warming, revisions, and durable fallback matter more than adding another cache layer.
3. **API batching can increase overfetch.** Only Bootstrap and the minimal Dashboard should be combined. Participants, Timeline, Attendance, Communications, and Staff must stay route-lazy.
4. **PostgreSQL is not a quick speed fix.** Without indexed query contracts, synchronisation, authorization, operations, and migration controls, it introduces two sources of truth. A bounded read-model pilot is the correct first step.
5. **“Instant search” does not require an external search product.** A compact precomputed projection is sufficient at current scale and PostgreSQL trigram/full-text is likely sufficient at the stated first enterprise scale.
6. **A cache hit rate alone is not success.** Payload size, stale age, error rate, lock waits, source scans, and user-perceived timing must be measured together.

## 3. ROI priority table

Expected gains are planning hypotheses to validate, not production measurements.

| Recommendation | Expected performance gain | User impact | Complexity | Risk | Priority |
|---|---|---|---|---|---|
| Production telemetry + repeatable journeys | No direct speed gain; prevents misdirected work and proves every later gain | Indirect but critical | Medium | Low | **P0** |
| Complete Participant remote paging/search | 60–90% less participant data transferred/processed in affected workflows | Faster Participants and Passport; fewer cache errors | Medium | Medium | **P0** |
| Dedicated global-search projection | 70–95% less source work per search; removes multi-module cold fan-out | Search results feel consistent and fast | Medium | Medium | **P0** |
| Operate shared projection warmers | Converts most business-hours cold requests to warm/snapshot paths | Fewer 30-second waits and rebuild-busy errors | Low–Medium | Medium (quotas) | **P0** |
| Fix canonical cache ownership | Avoids duplicate compression/publication on search misses | Small direct improvement; lower contention | Low | Low | **P0** |
| Typed revision/invalidation registry | Reduces stale data and unnecessary rebuilds | More reliable refresh behaviour | Medium | Medium | **P1** |
| Composite Bootstrap + minimal Dashboard | Removes one serial startup RPC; estimated 20–40% warm Dashboard improvement | Faster first usable screen | Medium | Medium | **P1** |
| Route-load large feature modules | Estimated 35–50% reduction in raw initial UI source and parse work | Faster shell, especially mobile | Medium–High in HtmlService | Medium | **P1** |
| Attendance revision/delta projection | 70–95% less data per refresh on active rolls | Faster and fresher Attendance | High | High | **P2** |
| Durable read-model pilot | Indexed queries and predictable concurrency for one domain | Removes selected Apps Script/Sheet ceiling | High | High | **P2** |
| Staff cache TTL adjustment | Avoids some staff-sheet reads | Minor improvement outside Staff/Admin | Low | Low | P3 |
| Font/logo optimisation | Small FCP/reliability gain | Slightly smoother shell | Low | Low | P3 |
| React/GraphQL/WebSockets/Kubernetes | Unproven or negative near-term ROI | Little immediate benefit | High | High | **Defer** |

## 4. Top 10 optimisations

1. Establish durable, queryable performance telemetry and baseline journeys.
2. Remove every automatic complete-participant-list upgrade from interactive paths.
3. Make Participant filtering, sorting, search, paging, export, and detail server-bounded.
4. Replace global search's multi-source fan-out with a compact search projection.
5. Install, monitor, and document the existing shared projection warmers.
6. Give canonical caches one owner and remove nested same-key publication.
7. Replace ad hoc cache deletion with domain revision keys and durable safe snapshots.
8. Combine lightweight Bootstrap with only the minimal Dashboard projection.
9. Route-load Form Builder, Communications, Profiles, and Participant editor code.
10. Pilot PostgreSQL only for the first proven high-volume domain—likely Attendance/audit or participant read models—behind existing contracts.

## 5. Sprint roadmap

### Sprint 0 — measurement gate (2–4 engineering days plus governance)

This is a prerequisite, not an open-ended observability project.

1. Link the Apps Script deployment to an approved standard GCP project so execution logs are available.
2. Persist `SC_PERF` samples for at least 30 days in an approved append/query store rather than Script Cache.
3. Extend Performance Diagnostics to render the existing `samples` array with count, p50, p95, max, cache status, and cold/warm label.
4. Define scripted journeys: Dashboard cold/warm, Participants direct entry cold/warm, participant page 2, search, Passport, Calendar/Event, Communications.
5. Collect 30 cold and 30 warm runs on Chrome, Safari, and one managed mobile device.

**Exit:** a versioned baseline report exists; missing/evicted samples are visible; every following sprint has before/after metrics.

### Sprint 1 — remove the expensive interactive paths (8–12 engineering days)

#### S1.1 Complete Participant server-side paging

- Retain `portalGetParticipantListPage()` as the standard list API.
- Ensure search/filter/sort/page are always included in the server query.
- Remove calls that load `portalGetParticipantListProjection()` merely to enable browse, export, profiles, or related views.
- Add bounded server export jobs or explicit downloadable projection rather than loading all rows into the browser.
- Load detail with `portalGetParticipantDetail()` and related paged endpoints.

#### S1.2 Add a dedicated search projection

- Create a permission-safe compact record: entity type, stable ID, title, short metadata, normalized tokens, route, program/scope.
- Build once from canonical sources during warm/sync, not per keystroke.
- Cache by program/source revision.
- Query one projection with a hard result limit and no raw PII fields.
- Return navigation-safe references only.

#### S1.3 Correct cache ownership and operate warmers

- Remove outer `participants:all`/`participants:groups` caches from `PlatformSearchService`; canonical services remain owners.
- Install one shared warmer trigger at the already implemented 10-minute/5-minute schedules after quota review.
- Reconcile documentation that still says 30 minutes.
- Add a health diagnostic for last successful warm, duration, records, payload bytes, failure, and next schedule.
- Make stale/durable snapshot the user-facing fallback; never display `CACHE_REBUILD_BUSY` when a safe prior page exists.

#### S1.4 Typed invalidation minimum slice

- Centralise participant, search, and Dashboard revision changes.
- Ensure refresh advances the relevant revision once rather than trying to enumerate unknown hashed keys.
- Do not redesign every domain in this sprint.

**Sprint 1 exit:** participant navigation no longer downloads a complete participant collection; a search query cannot cold-load Timeline/Attendance/Staff; warmed first page is available throughout business hours; rebuild-busy visible errors are below 0.1%.

### Sprint 2 — startup and browser delivery (8–15 engineering days)

#### S2.1 Composite startup projection

- Extend Bootstrap with an optional, strictly validated minimal Dashboard block or create one composite gateway.
- Reuse the identity/permission context inside the same execution.
- Include only Dashboard-visible counts/cards/tasks required for first render.
- Keep participant records, complete Timeline, Staff directory, Attendance events, form responses, and communications out.
- Preserve the old two-call path behind a feature flag for rollback.

#### S2.2 Route-load heavy modules

- Start with Form Builder and Communications because they are large and not required for Dashboard.
- Then isolate Participant Profiles/editor logic.
- Keep shared navigation, request layer, permissions, utilities, Dashboard, and small route templates in the shell.
- Cache loaded module source/templates in memory and dedupe concurrent route loads.
- If Apps Script fragment delivery is unreliable or provides little measured benefit, stop and move this work to the future compiled-frontend track.

#### S2.3 Incremental DOM work

- Add event delegation to Form Builder instead of rebinding listeners on render.
- Page or virtualise only views that measured profiling shows render more than 100 visible rows.
- Cancel recursive waits and superseded search/detail requests on navigation.

**Sprint 2 exit:** one blocking startup RPC; raw initial shell reduced by at least 35%; no feature data added to Bootstrap; cached route navigation remains below 200 ms p95.

### Sprint 3 — durable hot-domain pilot (15–30 engineering days plus platform approval)

This is a pilot, not a whole-platform migration.

1. Select the domain with the strongest measured pain and clearest ownership. Preferred order: Attendance transactions/revisions, append-only audit, then participant read model.
2. Define PostgreSQL schema, keys, indexes, authorization boundary, and reconciliation rules.
3. Implement a repository adapter behind the existing service/projection contract.
4. Run spreadsheet/source and database projections in shadow comparison mode.
5. Add a feature flag to switch reads while retaining spreadsheet write/integration flow.
6. Load test at 8,000 participants, 50 administrators, and 100,000 Attendance records where applicable.
7. Document recovery, replay, drift detection, and source-of-truth ownership before cutover.

In the same phase, design an Attendance revision/delta endpoint and background jobs for expensive imports/exports. Do not introduce microservices; one modular backend/service is sufficient.

**Sprint 3 exit:** one hot domain meets targets under representative load with documented reconciliation and rollback; no dual-write ambiguity.

### Future enterprise phase

Only begin these when business scale and operational ownership justify them:

- private Cloud Storage variants and signed/authenticated media delivery;
- realtime Attendance/operations gateway after revision APIs exist;
- multi-program/tenant row-level policies;
- async communications delivery workers and immutable recipient snapshots;
- partitioned long-term audit/event store;
- teacher/parent/public/mobile API surfaces;
- CDN/static frontend hosting;
- dedicated search service if PostgreSQL search fails measured requirements;
- distributed cache only after an external runtime needs it.

Explicitly excluded without a new architecture decision: Kubernetes, microservice decomposition, GraphQL, global multi-region deployment.

## 6. Engineering task specifications

### Task PERF-001 — production measurement foundation

- **Why now:** no p50/p95 baseline can currently be retrieved; optimisation ROI cannot be proven.
- **Effort:** 2–4 days engineering; governance lead time separate.
- **Dependencies:** approved GCP project/log access and a metric retention destination.
- **Likely files:** `Services/PerformanceTelemetryService.js`, `Portal/App/SpecCentralPerformance.html`, `SpecPortal.js`, `Docs/ProgressiveLoadingArchitecture.md`, new performance test/runbook documentation.
- **Functions:** `PerformanceTelemetryService.record/recordClientBatch/getDiagnostics`, `portalGetPerformanceDiagnostics`, `App.loadPerformanceDiagnostics`, `App.recordClientPerformance`, `App.flushClientPerformance`.
- **Expected change:** durable sink adapter; metric dimensions for build version, cold/warm, route, cache outcome; diagnostics table; baseline runner instructions.
- **Risks:** metrics containing PII, write quota, telemetry increasing latency.
- **Controls:** allow-listed dimensions only, batched/asynchronous writes, sampling, failure-isolated telemetry.
- **Rollback:** disable durable sink feature flag; retain Logger and bounded cache summary.
- **Acceptance:** >=95% expected journey samples retained for 30 days; p50/p95 available by build/route/cache status; telemetry adds <25 ms p95 to server requests.

### Task PERF-002 — finish Participant remote pagination

- **Why now:** directly addresses recent partial-list/cache-busy symptoms and scales to 8,000 participants.
- **Effort:** 4–6 days.
- **Dependencies:** PERF-001 baseline; projection contract tests.
- **Likely files:** `Portal/App/SpecCentralApp.html`, `Portal/Pages/Participants.html`, `Portal/App/SpecCentralProfiles.html`, `Portal/App/SpecCentralExperience.html`, `Services/ParticipantProjectionService.js`, `Services/ProjectionContractService.js`, `SpecPortal.js`, `Tests/PerformancePackageTests.js`.
- **Functions:** `App.loadParticipantExplorerPage`, `App.loadParticipantFirstPage`, `App.ensurePortalDataLoaded`, complete-list browse/profile/export helpers; `ParticipantProjectionService.getPage/buildPage_/getDetail`.
- **Expected change:** all list state becomes server query state; page/filter/sort/search calls are bounded; profiles load detail; exports use an explicit bounded job/endpoint.
- **Potential regressions:** school/item/teacher profiles relying on `App.state.participants`; export parity; browser back/forward state; scoped permissions.
- **Rollback:** feature flag to the existing list projection; keep projection contract unchanged during one release.
- **Acceptance:** no automatic `portalGetParticipantListProjection()` request during normal Participants/Passport navigation; <=100 participant rows per list response; warm first page p95 <1.5 s; cold p95 <8 s; complete-list browser payload eliminated.

### Task PERF-003 — dedicated search projection

- **Why now:** current fan-out can load nearly every major domain for one query.
- **Effort:** 4–6 days.
- **Dependencies:** stable IDs, permission/scope contract, PERF-001.
- **Likely files:** `Services/PlatformSearchService.js`, new `Services/SearchProjectionService.js`, `Services/DataSyncService.js`, `Services/ProjectionContractService.js`, `Portal/App/SpecCentralSearch.html`, `Portal/App/SpecCentralExperience.html`, `SpecPortal.js`, new tests.
- **Functions:** `PlatformSearchService.search`, `DataSyncService.invalidate/load_`, global search request/render functions.
- **Expected change:** precompute compact records; revision-keyed projection; one query path; navigation-safe results; strict result cap.
- **Potential regressions:** result ranking/order, missing entity types, permission leakage, stale labels.
- **Rollback:** feature flag to current provider registry; retain old search for administrators in diagnostic mode only.
- **Acceptance:** one server projection consulted per remote query; no Timeline/Attendance/Staff adapter invocation per keystroke; warm p95 <400 ms; cold p95 <2 s; payload <50 KB; authorization tests for every entity type.

### Task PERF-004 — projection warmer operations

- **Why now:** implementation already exists and cold rebuilds are the dominant stability risk.
- **Effort:** 1–2 days plus quota observation.
- **Dependencies:** administrator approval and PERF-001.
- **Likely files:** `SpecPortal.js`, `Services/ParticipantProjectionService.js`, `Services/AttendanceProjectionService.js`, `Portal/App/SpecCentralPerformance.html`, relevant Docs.
- **Functions:** `installSpecCentralProjectionWarmer`, `warmSpecCentralSharedProjections`, `warmSpecCentralActiveAttendanceProjection`, `ParticipantProjectionService.warmShared`.
- **Expected change:** idempotent installer/status/uninstaller; last-run health; aligned schedules/docs; alerts for consecutive failures.
- **Potential regressions:** Apps Script quotas, overlapping builds, source load during busy periods.
- **Rollback:** remove only named triggers; caches continue lazy loading and durable snapshot fallback.
- **Acceptance:** >=95% Dashboard/first-page requests served from warm cache/snapshot during business hours; no overlapping warm executions; warmer quota use within agreed budget.

### Task PERF-005 — canonical cache ownership cleanup

- **Why now:** low-risk removal of redundant cache publication and confusing ownership.
- **Effort:** 0.5–1 day.
- **Dependencies:** PERF-003 can absorb this, but it may ship independently.
- **Likely files:** `Services/PlatformSearchService.js`, `ParticipantService.js`, tests/docs.
- **Functions:** `PlatformSearchService.search`, `ParticipantService.getAll/getGroups`.
- **Expected change:** call canonical service directly; only canonical service owns key/TTL/publication.
- **Potential regressions:** none if service contract is preserved; verify scope filtering remains after retrieval.
- **Rollback:** restore outer wrappers.
- **Acceptance:** one cache publication and one compression per canonical miss; identical search results in regression fixtures.

### Task PERF-006 — participant/search revision invalidation

- **Why now:** warming is unreliable if invalidation misses hashed/versioned keys or rebuilds unnecessarily.
- **Effort:** 2–4 days for the participant/search slice.
- **Dependencies:** PERF-003/004.
- **Likely files:** `Services/DataSyncService.js`, `Services/ParticipantProjectionService.js`, `Services/ProjectionContractService.js`, `Services/PerformanceCacheService.js`, `ParticipantService.js`.
- **Functions:** `DataSyncService.invalidate`, `ParticipantProjectionService.invalidate`, projection cache-key builders.
- **Expected change:** a domain revision becomes part of all participant/search keys; one revision advance invalidates shared and user projections without key enumeration.
- **Potential regressions:** inconsistent revision reads within a request; accidental cache storms after every minor update.
- **Rollback:** retain existing epoch/property and deletion paths for one release.
- **Acceptance:** mutation/refresh makes every affected projection unreachable immediately; unrelated domains retain cache; one rebuild owner per new revision.

### Task PERF-007 — composite Bootstrap/Dashboard

- **Why now:** after collection paths are safe, this is the clearest first-load improvement.
- **Effort:** 3–5 days.
- **Dependencies:** PERF-001; stable Dashboard projection; feature flags.
- **Likely files:** `Services/BootstrapService.js`, `Services/DashboardService.js`, `SpecPortal.js`, `Portal/App/SpecCentralApp.html`, `Services/ProjectionContractService.js`, `Tests/PerformancePackageTests.js`.
- **Functions:** `BootstrapService.getContext/validate_`, `DashboardService.getContext`, `portalGetSpecCentralConfig`, `App.init/loadBootstrap/loadConfig`.
- **Expected change:** one authenticated execution returns bootstrap plus minimal Dashboard; shared user context; old config call suppressed when composite data validates.
- **Potential regressions:** oversized bootstrap, permission leakage, Dashboard failure blocking shell access, stale task counts.
- **Controls:** Dashboard section must be optional/failure-isolated and contract-limited; no participants or headshots.
- **Rollback:** feature flag returns to current two-call sequence.
- **Acceptance:** one blocking RPC before Dashboard usable; warm Dashboard p95 <1.5–2.0 s; composite payload <50 KB; bootstrap still succeeds when optional Dashboard projection degrades.

### Task PERF-008 — route-load large UI modules

- **Why now:** reduces parse/delivery cost after server bottlenecks are controlled.
- **Effort:** 5–10 days depending on Apps Script fragment strategy.
- **Dependencies:** PERF-001; module manifest and CSP/HtmlService feasibility spike.
- **Likely files:** `SpecCentral.html`, `Portal/App/SpecCentralApp.html`, `Portal/App/SpecCentralFormBuilder.html`, `Portal/App/SpecCentralCommunications.html`, `Portal/App/SpecCentralProfiles.html`, route page templates, Styles.
- **Functions:** route registration/activation, module render entry points, new module loader.
- **Expected change:** exclude heavy modules from initial includes; fetch/initialise once on intent or route entry; cache in memory.
- **Potential regressions:** race on first navigation, missing functions, duplicate event registration, Apps Script fragment escaping/CSP.
- **Rollback:** build flag restores static includes.
- **Acceptance:** raw initial source <=450 KB and approximate compressed source <=90 KB; Dashboard functions without loading deferred modules; first deferred route p95 <2.5 s and subsequent route <200 ms.

### Task PERF-009 — Attendance revision/delta design and implementation

- **Why now:** only after measurements confirm live roll reads are a top bottleneck.
- **Effort:** 8–15 days.
- **Dependencies:** authoritative Attendance write semantics; stable session/participant IDs; durable transaction/revision store decision.
- **Likely files:** `Services/AttendanceService.js`, `Services/AttendanceProjectionService.js`, Attendance project sync/API files, `SpecPortal.js`, Attendance UI client.
- **Expected change:** session revision endpoint, changes-since API, idempotent mark command, client merge and backoff.
- **Potential regressions:** lost/duplicated marks, stale totals, clock/order conflicts, offline reconciliation.
- **Rollback:** feature flag to complete-session refresh; transaction log remains append-only.
- **Acceptance:** normal refresh transfers only revision/no-change or changed marks; mark acknowledgement p95 <700 ms; 50-concurrent-admin load has no lost updates.

### Task PERF-010 — PostgreSQL read-model pilot

- **Why now:** Sprint 3 only, after a domain demonstrably exceeds Apps Script limits.
- **Effort:** 15–30 days engineering plus security/platform lead time.
- **Dependencies:** approved cloud project, database, networking, secrets, backup, privacy, operations owner, data model ADR.
- **Likely modules:** new repository/adapter and sync service; existing `ParticipantService`, `AttendanceService`, `AuditService`, or `PlatformStoreService` boundary depending on selected pilot; projection contracts remain.
- **Expected change:** one domain uses indexed durable queries with shadow comparison and feature-flagged read cutover.
- **Potential regressions:** source drift, dual-write ambiguity, access-policy mismatch, operational dependency.
- **Rollback:** read switch returns to spreadsheet adapter; no destructive source migration; replayable sync cursor retained.
- **Acceptance:** representative load meets domain p95/SLO; 100% reconciliation for required fields; documented RPO/RTO; rollback tested.

## 7. Expected performance progression

The “current” column contains known evidence and planning ranges, not a fabricated baseline. Sprint forecasts are hypotheses that PERF-001 must validate.

| Metric | Current evidence / planning range | After Sprint 1 target | After Sprint 2 target | After Sprint 3 target |
|---|---|---|---|---|
| Dashboard usable | Historical failure >30 s; current warm/cold p95 unmeasured | warm <2.0 s; cold <5.0 s; safe snapshot on failure | warm <1.5 s; cold <4.0 s; one blocking RPC | warm <1.2 s where durable summaries used |
| Participant first page | 50-row projection exists; cache-busy previously visible; latency unmeasured | warm <1.5 s; cold <8 s; no complete-list upgrade | warm <1.2 s | warm <700 ms with indexed read model if piloted |
| Global search | Can fan out to six domains; latency unmeasured | warm <400 ms; cold <2 s; one projection | warm <300 ms | p95 <250 ms with indexed store |
| Participant Passport | Detail endpoint exists; related complete-list dependencies possible | p95 <2.0 s excluding image | p95 <1.5 s | p95 <800 ms with indexed detail/relationships |
| Event/Calendar loading | complete Timeline cache on miss; latency unmeasured | no search-triggered cold Timeline; route target <3 s warm | p95 <2.0 s warm | p95 <1.0 s if event read model selected later |
| Communications loading | bounded Properties repository; latency unmeasured | unchanged; measured baseline established | p95 <2.0 s via route loading/summaries | p95 <1.0 s after durable repository if selected |
| Raw initial UI source | 687,723 bytes | approximately unchanged | <=450,000 bytes | <=350,000 bytes with compiled/static frontend if justified |
| Approx. compressed UI source | 137,317 bytes | approximately unchanged | <=90,000 bytes | <=75,000 bytes if compiled/minified |
| Blocking startup RPCs | 2 serial (Bootstrap, Dashboard) | 2, but warm and measured | 1 composite | 1 |
| Idle preload RPCs | 2 sequential modules | cache-peek only; controlled/monitored | max 2 concurrent cache-peeks | API-prefetch governed by query client |
| Search source adapters/request | up to Participants, Groups, Timeline, Staff, Show Run, Attendance | 1 search projection | 1 | 1 indexed query |
| Source-sheet reads | cache-miss dependent; unmeasured | >=90–95% hot paths avoid source scan | >=95% | selected pilot domain runtime reads reduced to zero |

## 8. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Optimising without reliable baseline | High today | High | Sprint 0 is a gate; no claimed win without before/after distributions. |
| Warmers exhaust Apps Script quotas or overlap | Medium | High | Instrument duration/quota, idempotent trigger ownership, lease, alert, easy uninstall. |
| Remote paging breaks profiles/exports that assume a full array | High | Medium–High | Inventory all consumers, feature flag, contract fixtures, explicit related/export endpoints. |
| Search projection leaks scoped entity metadata | Medium | Critical | Construct permission-safe documents, scope-key cache, authorization tests, never index restricted fields. |
| Composite bootstrap becomes another oversized endpoint | Medium | High | Strict schema/payload budget, optional failure-isolated Dashboard block, no collections. |
| HtmlService route splitting creates brittle loading races | Medium | Medium | Feasibility spike, idempotent module registration, static-include rollback flag. |
| Revision invalidation causes rebuild stampede | Medium | High | Shared warmer, per-revision lease, stale previous snapshot, no per-user eager rebuild. |
| PostgreSQL pilot creates two sources of truth | Medium | Critical | One authoritative owner per field, shadow reads, reconciliation, read-only cutover first. |
| New feature work reintroduces full collection reads | High | High | Projection contract tests, code review checklist, payload/source-scan budgets in CI. |

## 9. Overall readiness after implementation

| State | Enterprise readiness estimate | Interpretation |
|---|---:|---|
| Current audit | **54/100** | Strong prototype foundations; storage/observability and cold paths remain limiting. |
| After Sprint 1 | **63/100** | Major interactive collection and cache-stampede risks controlled; measurements trustworthy. |
| After Sprint 2 | **70/100** | Faster startup, smaller shell, clearer cache lifecycle, stable browser behaviour. |
| After Sprint 3 pilot | **78/100** | One proven durable domain and migration pattern; not yet full enterprise migration. |
| Future enterprise phase | **85–90/100** | Requires operational ownership, durable data/media, load-tested authorization, DR, and SLOs—not just code changes. |

Scores are conditional on meeting acceptance criteria. Completing tasks without achieving measured targets does not increase readiness.

## 10. Recommended approval boundary

Approve Sprint 0 and Sprint 1 as one performance programme with separate deployable tasks. Require a checkpoint before Sprint 2 using measured results. Approve Sprint 3 only through a domain-specific ADR, platform/security review, cost estimate, migration plan, and tested rollback.

No feature freeze is required. New work should follow three guardrails immediately:

1. no complete collection in Bootstrap or Dashboard;
2. no interactive endpoint may scan more than one authoritative source collection;
3. every new list/search endpoint must be bounded, permission-scoped, measured, and revision-keyed.
