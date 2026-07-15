# SpecCentral first performance package

## Purpose

This package removes the complete participant dataset from the SpecCentral Dashboard critical path. It is an incremental Apps Script optimisation and does not change source spreadsheet data or deploy the application.

Step 3 progressive preloading, stale-while-revalidate behaviour and the revised browser-persistence policy are documented in `Docs/ProgressiveLoadingArchitecture.md`.

> Final-phase note (15 July 2026): `participant-list-v2`, `participant-list-page-v2`, `participant-filter-v1`, `participant-detail-v2` and `headshot-asset-v2` now supersede the v1 contracts described below. The historical v1 design is retained here for change traceability; current contracts are authoritative in `Docs/ProjectionCacheAssetArchitecture.md`.

## Request contracts

### `portalBootstrap()`

Contract: `spec-central-bootstrap-v2`.

Returns only:

- authenticated user identity and safe staff summary;
- explicit role, module and action permission maps;
- feature flags;
- nested platform metadata including environment, build/schema version, config/cache epochs and maintenance mode;
- generated time and PII-free timing metadata.

It rejects requests without an authenticated Workspace email. It must never call `ParticipantService`, read participant spreadsheets, warm participant caches or resolve headshots. `BootstrapService` deliberately has no participant dependency. The browser validates the response shape before applying it and shows an explicit sign-in, maintenance, permission or retry state when the shell cannot start.

### `portalGetDashboardProjection()`

Returns the existing staff-specific Dashboard context plus `participantSummary`. The participant summary is read from a cached or durable prebuilt snapshot through `ParticipantProjectionService.getDashboardSnapshot()`; it never rebuilds participant data in a Dashboard request.

If no snapshot exists, `participantSummary.status` is `Not warmed` and its categories are empty. A user with a restricted participant scope receives no unrestricted production summary.

### `portalGetParticipantListProjection()`

Contract: `participant-list-v1`.

Returns list/search fields for participants, lightweight group and school records, projection metadata and request cache timing. It excludes:

- student, parent and teacher contact details;
- student IDs/SRN used only in detail views;
- full notes, forms and audit histories;
- raw photo IDs, URLs and headshot binaries;
- school email addresses.

`portalGetPortalData()` remains as a compatibility alias to this slim projection.

### `portalGetParticipantDetail(studentKey)`

Contract: `participant-detail-v1`.

Requires `Participants.View`, applies the current user's scope, finds the participant using the stable `studentKey`, and returns the complete permitted record only when a profile is opened. Raw photo IDs and URLs are removed; image access remains a separate authorised request.

## Startup sequence

The full-page application now:

1. records the client startup start time;
2. requests `portalBootstrap()`;
3. validates the response, applies permissions and checks maintenance/Dashboard access;
4. requests `portalGetDashboardProjection()`;
5. marks Dashboard usable and records the client duration;
6. loads participant-list data only after the Participants route, participant search or a participant browse action requires it.

The Dashboard prefetch branch does not request participants, Attendance or headshots. The compact spreadsheet participant-search sidebar remains participant-oriented and is outside this full-page startup contract.

## Cache behaviour

`PerformanceCacheService` version 2 provides:

- cache keys namespaced by `SC_SCHEMA_VERSION` and `SC_CACHE_EPOCH`;
- gzip compression and chunking;
- an explicit `complete` manifest published after every data chunk;
- readers that reject missing chunks or incomplete manifests;
- one script lock around a top-level cache rebuild;
- a re-entrant same-execution path for nested cache loaders;
- cache hit/miss, rebuild and lock-wait telemetry;
- `peek()` for cache-only Dashboard reads.

Cache Service remains temporary. The small Dashboard participant summary is also stored in Script Properties as the last-known snapshot. Complete participant records are not stored there.

### Invalidation

- Existing Data Sync participant invalidation now clears list and Dashboard projection caches.
- An administrator can advance the whole cache namespace through `portalAdvanceCacheEpoch(reason)`.
- Direct property configuration uses `SC_ENVIRONMENT`, `SC_SCHEMA_VERSION`, `SC_BUILD_VERSION`, `SC_CONFIG_EPOCH`, `SC_CACHE_EPOCH`, `SC_FEATURE_FLAGS` and `SC_MAINTENANCE_MODE` (`SC_MAINTENANCE` remains a compatibility alias).
- No control-plane spreadsheet tabs are required by this package.

### Warming

- `portalWarmStartupProjections()` is an authenticated manual warm for a permitted user.
- `warmSpecCentralSharedProjections()` rebuilds shared canonical and Dashboard projections and is safe for a time-driven trigger.
- `installSpecCentralProjectionWarmer()` installs one 30-minute trigger after explicit administrator action.
- No trigger is installed by this change.

Thirty minutes is intentionally conservative. Rebuild frequency should be changed only after cache hit and source-scan metrics are reviewed.

## Performance telemetry

`PerformanceTelemetryService` emits `SC_PERF` structured log entries and keeps a bounded six-hour sample window for diagnostics. It records only approved dimensions such as cache status, record count, payload bytes, projection name and route. Cache labels remove permission-key identity components. Names, emails, image references and participant content are not recorded.

`portalGetPerformanceDiagnostics()` returns p50, p95, maximum and sample count by metric. Client timings are sent through `portalRecordClientPerformance()`.

Important metrics include:

- `startup.bootstrap.server` and `client.bootstrap`;
- `startup.identity.server`, `startup.staff-lookup.server` and `startup.permission-resolution.server`;
- `dashboard.projection.server` and `client.dashboard-usable`;
- `participants.list.request`, `participants.list.transform` and `client.participants-usable`;
- `participants.dataset.request` for canonical participant cache hit/miss and source-row volume;
- `participants.detail.request`;
- `cache.hit`, `cache.miss-published` and `cache.rebuild.busy`.

### Collecting p50/p95

1. Deploy to a non-production/test deployment after review.
2. Clear the telemetry sample cache from an authorised diagnostic action or wait for the six-hour window to roll.
3. Run at least 30 cold/warm Dashboard opens and 30 Participants opens across Chrome, Safari and a managed phone.
4. Include at least one deliberate cache invalidation to measure a cold rebuild.
5. Open Performance Diagnostics or call `portalGetPerformanceDiagnostics()` as an administrator.
6. Compare sample counts, p50 and p95 against the targets in the whole-platform review.

Do not compare a warm after result with only a cold before result.

## Headshot interface

Both projects now expose the `headshot-asset-v1` shape:

```text
request:  { entityType, stableId, size, context? }
response: { ok, entityType, stableId, requestedSize, dataUrl, storage, errorCategory }
```

SpecCentral's `HeadshotAssetService` wraps the current permission-safe `SecureImageService`. `portalResolveSecureImages()` remains compatible and `portalResolveHeadshots()` exposes the new name. The current provider returns proxied data URLs and does not expose raw Drive references.

Attendance has a matching stable-ID resolver requiring an authorised `sheetName` context. Existing Attendance image rendering has not yet been switched to it, so the current Attendance UI remains functional but direct Drive thumbnail behaviour is a known limitation. No second headshot cache was introduced.

The future private Cloud Storage provider must preserve this interface and can replace `dataUrl` with a short-lived authorised asset URL after the contract is versioned.

## Baseline and validation limits

No deployment was permitted, so live browser/server timing samples do not yet exist for the new code. It would be misleading to invent before-and-after milliseconds.

The architecture-level comparison is measurable from the call graph:

| Dashboard start property | Before | After |
|---|---:|---:|
| Complete participant projection requests | 1 | 0 |
| Possible participant source-sheet scans on cold Dashboard start | 3 (individuals, groups, school master) | 0 |
| Participant list transformation on Dashboard start | Yes | No |
| Participant payload copied to `sessionStorage` on Dashboard start | Yes | No |
| Headshot index/load requested by Dashboard start | Possible through participant path | No |
| Dashboard participant summary cold behaviour | Rebuild from participant source | Read snapshot or report `Not warmed` |

Actual milliseconds and payload bytes will be reported only after the non-production collection procedure above. Server and client instrumentation required for that measurement is included in this package.

## Known limitations

- The first participant-page preload can still perform full source reads on a cold cache; it runs only after Dashboard usability or explicit navigation intent and is never a startup dependency.
- The Dashboard summary can be stale until its next warm. Every response includes generation/cache status.
- Cache Service uses a project-wide script lock because Apps Script does not provide named locks. Expensive top-level rebuilds are deliberately serialised.
- The durable Dashboard summary is global. Restricted-scope users do not receive it; scoped prebuilt summaries are future work.
- Attendance still has existing direct Drive-thumbnail consumers. The shared resolver is available, but client migration needs a separate, tested Attendance package.
- Cloud Storage infrastructure and image derivative generation are not part of this package.

## Test entry points

- SpecCentral: `runPerformancePackageTests()`
- Attendance contract: `runAttendanceHeadshotAssetContractTests()`

Both are Apps Script manual/CI-safe harnesses and do not mutate source spreadsheet data.
