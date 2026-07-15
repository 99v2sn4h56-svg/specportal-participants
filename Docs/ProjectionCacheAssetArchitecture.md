# Projection, cache and headshot architecture

**Implemented locally:** 15 July 2026  
**Production deployment:** none

## Outcome

SpecCentral now builds explicit permission-aware read models, validates them before publication, and publishes compressed cache generations through an active pointer. Dashboard, participant list/page/filter/detail, and active Attendance responses have named schema contracts. Headshots are requested by stable participant ID through one canonical SpecCentral asset boundary; Attendance authorises event scope and calls that boundary through a server-to-server adapter.

The current storage provider remains private Google Drive behind a server-side proxy. Private Cloud Storage has not been provisioned or claimed as deployed.

## Request flows

### Audited screens and data dependencies

| Consumer | Previous blocking/expensive dependency | Current response boundary | Sensitive handling |
|---|---|---|---|
| Dashboard | Historically coupled to complete participant data; Step 1–3 removed that dependency | Timeline/staff/workflow summaries plus cache/snapshot-only participant counts | No participant/group/school records or headshots |
| Participant first page | Complete portal dataset transformed before slicing | Shared scope projection, then a maximum 50-row server page | Safe display/status fields only; raw source rows never returned |
| Participant filters | Derived in the browser from the complete list | `participant-filter-v1` distinct approved strings | No records or free-text notes |
| Participant detail | Complete participant collection searched after authorisation | One stable-ID lookup on profile open | Full permitted detail only to the authorised caller; storage references removed |
| School lookup | Previously bundled with the complete portal dataset | Safe school ID/name/region/directorate records within the participant scope | School email/contact details excluded |
| SpecCentral headshots | Participant/staff lookup, photo index and Drive fetch | Canonical stable-ID asset service after capability/scope checks | Raw IDs/URLs remain server-side |
| Attendance manager roll | Complete selected event sheet; enhancement pass could scan a headshot folder | Selected roll remains operational; images are separate visible-only requests | Roll JSON no longer contains Photo ID/URL; manager/event scope is checked |
| Attendance public check-in | Reused manager roll records, including more fields than the selector needed | Explicit name/school/year/category stable-key projection | Contact, support and photo fields excluded; public check-in shows initials only |
| Active Attendance in SpecCentral | Summary/events API could scan multiple event sheets on a cold call | Cached `attendance-active-v1` event/count projection | No participant rows or history |

Unstable identifiers found in legacy paths included row numbers, names and filename-normalised headshot keys. Row numbers remain only as an internal Attendance mutation address for a selected authorised sheet; public projections, cross-project calls and assets use `studentKey`. Filename matching remains an interim SpecCentral storage-index concern and is not an API identity.

### Projection generation and consumption

```text
Authoritative Sheet / approved API
  -> canonical service record
  -> permission scope filter
  -> deterministic projection builder
  -> ProjectionContractService validation
  -> temporary cache generation (compressed chunks + manifest)
  -> active pointer published last
  -> permissioned gateway
  -> route UI

Cache hit                 -> return immediately
Stale valid generation    -> return immediately; client/warmer requests refresh
Cold miss                 -> acquire projection lease; build once
Concurrent cold miss      -> wait briefly for the active generation
Failed build/validation   -> release lease; retain the previous active generation
```

### Headshot delivery

```text
Visible image intersects
  -> browser batches stableId + small/medium/large
  -> module authorisation
     SpecCentral: current capability + participant scope
     Attendance: current manager + authorised event sheet scope
  -> HeadshotAssetService (headshot-asset-v2)
  -> DriveAssetAdapter (temporary) or future CloudStorageAssetAdapter
  -> MIME/size/access validation
  -> ephemeral data URL + expiry metadata
  -> short-lived in-memory browser cache
  -> consistent initials fallback on missing/failure
```

Attendance's preferred path is a POST from its server to the SpecCentral service using `SPEC_CENTRAL_ASSET_SERVICE_URL` and `SPEC_CENTRAL_ASSET_SERVICE_SECRET`; SpecCentral stores the matching value as `SC_ASSET_SERVICE_SECRET`. The secret must be at least 32 characters and is never accepted in a query string or returned to the browser. A feature-flagged local Drive adapter can read an already-synchronised Photo ID from the authorised event row during staged rollout. It does not maintain a separate folder scan or asset index.

## Projection contracts

| Contract | Schema | Purpose | Explicit exclusions |
|---|---|---|---|
| Dashboard | `dashboard-v2` | Staff-safe status, counts, events, workflow and service health | Participant/group/school collections and headshots |
| Participant list | `participant-list-v2` | Shared scope-specific safe index | Email, phone, parent/teacher contacts, notes, medical/support fields, forms, audit data, raw photo/Drive references |
| Participant page | `participant-list-page-v2` | Server-filtered/page-bounded list results | All participant-list exclusions; no detail embedding |
| Participant filters | `participant-filter-v1` | Approved distinct values for list controls | Records, counts tied to individuals and free-text source rows |
| Participant detail | `participant-detail-v2` | One authorised participant fetched by stable ID | Raw photo ID/URL/Drive reference; list embedding |
| Active Attendance | `attendance-active-v1` | Active event summaries and roll counts | Participant rows, complete history and historical sheet collections |

Participant-list records may contain only the fields allow-listed in `ProjectionContractService.LIST_FIELDS`. `hasPhoto`, an opaque `assetKey`, and `assetVersion` describe availability; they do not deliver an asset or reveal its storage location.

Validation rejects missing/duplicate stable IDs, unknown list fields, malformed generated dates, invalid status types/content, malformed asset keys, storage references in detail, record collections in Dashboard, records/history in the active Attendance projection, and schema mismatches. Validation runs before cache publication.

## Stable identifier strategy

The canonical key remains `studentKey`, generated by the existing cross-project `EntityModelService.participant()` / `ParticipantService.makeStudentKey()` convention. It prefers an existing source `studentKey`; otherwise it deterministically combines available application ID, student ID, name and school. Attendance reads the synchronised Student Key and never uses a row number or name as an asset owner key.

Known migration risk: the fallback changes if a participant without an application/student identifier changes both name or school. Duplicate deterministic keys are rejected during projection construction rather than silently overwritten. The recommended data migration is to persist an immutable student key for every canonical record after duplicate review; this package does not mutate source rows.

## Cache keys

Central logical keys are built by `ProjectionContractService.cacheKey()`:

```text
speccentral:{projection}:{contract-version}:
schema={SC_SCHEMA_VERSION}:
epoch={SC_CACHE_EPOCH}:
mapping={SC_SOURCE_MAPPING_VERSION}:
domain={domain projection epoch}:
scope={hashed effective data scope}:
query={hashed canonical query}
```

The physical CacheService key is a SHA-256 digest under `SC_PERF_V3`. Browser first-page keys correspond to the server contract: `participantListPage:v2:page=1:pageSize=50` and `participant-list-page-v2:page=1:pageSize=50`.

Participant list/page/filter caches are shared between users who have the same effective participant data scope. Gateways still check `Participants.View` on every request. User-specific Dashboard, staff and search caches continue to include a hashed user/permission signature and use User Cache where applicable.

## Cache lifetimes and stale policy

| Projection | Fresh | Retained stale | Cold failure |
|---|---:|---:|---|
| Dashboard participant summary | 5 min | 30 min plus validated Script Properties snapshot | Return controlled `Not warmed` when no snapshot exists |
| Participant list | 5 min | 30 min | Controlled cache/build error |
| Participant page | 5 min | 30 min | Controlled cache/build error |
| Participant filters | 15 min | 60 min | Controlled cache/build error |
| Active Attendance | 2 min | 15 min | Controlled degraded/unavailable response |
| Headshot response metadata/data URL | 30 min maximum | none beyond expiry | Initials/missing fallback |

Responses expose safe metadata including cache status, stale state, generation time, expiry, schema/cache epoch, duration and payload bytes. They do not expose physical keys, leases, secrets or storage paths. Apps Script cannot perform arbitrary work after returning, so stale route data is refreshed by a subsequent explicit browser request or scheduled warmer.

## Locking and atomic publication

Apps Script provides one project-wide Script Lock rather than named distributed locks. The cache therefore uses the Script Lock only for a short lease claim/release operation. Each logical projection has its own expiring CacheService lease (45 seconds by default), so expensive unrelated builders do not hold one global lock while reading Sheets.

Publication uses immutable generations:

1. Generate a random generation ID.
2. Write all compressed generation chunks.
3. Write the complete generation manifest.
4. Write the active pointer last.
5. Retain the previous generation until natural expiry.

Readers resolve the active pointer, verify the matching complete manifest, require every chunk, and only then decode JSON. Partial or rejected builds cannot change the active pointer. CacheService is best-effort and may evict a lease early; the short Script Lock makes the claim atomic within Apps Script, but this is still an approximation rather than a managed distributed lock.

## Invalidation and warming

Targeted epochs are stored in Script Properties:

- `SC_PARTICIPANT_PROJECTION_EPOCH`
- `SC_ATTENDANCE_PROJECTION_EPOCH`
- `SC_DASHBOARD_PROJECTION_EPOCH`
- `SC_SOURCE_MAPPING_VERSION`

Participant sync advances the participant epoch and rebuilds Dashboard, the production-scope first page and filter projection through the same public builders. Attendance sync advances the Attendance epoch and rebuilds the active projection. Global schema changes use `SC_SCHEMA_VERSION`; emergency/global invalidation uses `SC_CACHE_EPOCH`.

Opt-in schedules exposed by `installSpecCentralProjectionWarmer()` are:

- shared canonical participants, Dashboard summary, production first page and filters: every 10 minutes;
- active Attendance summary: every 5 minutes.

No trigger was installed. The 5-minute Attendance schedule intentionally uses the existing bounded public projection/cache and does not introduce a 20-second scan of every event sheet. A future Attendance transaction/revision index is still needed for 15–60-second active-roll deltas.

Warming records trigger path, projection, cache outcome, build duration, record count, payload size, stale state and lock wait through the existing PII-free performance telemetry.

## Headshot security and browser caching

- Browser callers cannot construct storage URLs.
- SpecCentral rechecks authentication, `Participants.View`, effective participant scope and stable ID.
- Attendance rechecks the signed-in manager and event/student scope before forwarding an allow-listed stable ID.
- The server-to-server endpoint requires a separate long secret and returns generic failure categories.
- Raw Drive IDs/URLs and source filenames are absent from list, detail and asset responses.
- MIME type is restricted to JPEG, PNG, WebP and GIF; source/output size limits remain enforced.
- List/roll views request `small`; profile/passport views request `medium`; `large` is reserved for authorised administration.
- Both clients use IntersectionObserver, batches of at most 12 and an in-memory expiry-aware cache. Asset responses are not written to localStorage/sessionStorage.
- Session/permission cache clearing removes the SpecCentral in-memory service state; a full page/session change creates a new image cache.

## Current Drive adapter limitations

- Drive thumbnail generation and Apps Script base64 transport are slower and more quota-sensitive than object delivery.
- Data URLs add transfer overhead and cannot be independently cached by the browser as efficiently as private object responses.
- The canonical service still builds its temporary filename-based photo index when the participant source lacks a Photo ID. That index belongs to SpecCentral; Attendance no longer scans the folder independently.
- The remote Attendance adapter requires reviewed deployment configuration before it becomes the live primary path. Until then, the local compatibility adapter can resolve only Photo IDs already synchronised into event rows.
- Safari/mobile reliability is structurally improved because the browser no longer authenticates directly to Drive, but cross-browser success must be measured on a reviewed test deployment.

## Cloud Storage migration prerequisites

1. Approved organisation cloud project, region/data-residency decision and cost owner.
2. Private bucket with uniform access; no public-read objects or bucket.
3. Service identity/IAM design and secret-management approval.
4. Stable object layout such as `participants/{stableId}/headshot/{assetVersion}/{small|medium|large}.webp`.
5. Durable Asset Index with owner ID, version/generation, MIME, dimensions, consent/retention metadata and update time.
6. Controlled migration/reconciliation from Drive references, including duplicates and missing stable IDs.
7. Upload-time MIME/content/dimension/orientation validation and variant generation.
8. Short-lived signed URLs or an approved authenticated proxy with private cache headers.
9. Audit, lifecycle, replacement and invalidation policies.
10. Chrome, Safari, iOS and Android testing with non-deployer accounts.

`HeadshotAssetService` and both clients require no UI contract change when `DriveAssetAdapter` is replaced by `CloudStorageAssetAdapter`.

## Verification and measurements

Local deterministic harness results on 15 July 2026:

- SpecCentral performance contracts: 35/35 passed.
- Progressive-loading client checks: passed.
- Performance client behaviour checks: passed.
- Static parsing/gateway checks: 35 HTML files, 35 gateways and 87 JavaScript files passed.
- Attendance shared-headshot contract: 6/6 passed.

The synthetic fixture observed approximately 1,482 bytes for Dashboard, 767 bytes for the participant first page, 291 bytes for filters, 203 bytes for one detail, and 681 bytes for active Attendance. These values verify field shape and regression budgets only; they are not production payload measurements.

Structural before/after evidence:

| Property | Before the first package | Final local architecture |
|---|---:|---:|
| Complete participant scans on Dashboard blocking path | Up to 3 | 0 |
| Participant records in Dashboard response | Complete portal dependency possible | 0 by validation |
| Participant first-page source | Complete per-user browser payload | Shared scope projection, server page ≤100 (default 50) |
| Filter source | Complete browser list | Dedicated cached filter projection |
| Cache publication | Same physical chunk names plus manifest-last | Immutable generation chunks/manifest plus active-pointer-last |
| Expensive-build lock | One Script Lock held through the build | Short Script Lock for per-projection lease claim; build outside global lock |
| Attendance browser headshot URL | Direct Drive thumbnail | Batched stable-ID service response |
| Attendance headshot folder cache | Independent folder scan/cache | Removed from the active image path |

No reviewed deployment or representative production dataset was available, so p50/p95 Dashboard/Participants/Attendance latency, thumbnail byte size, headshot success/time-to-visible and Safari/mobile behaviour are not fabricated. The production measurement procedure remains the one in `ProgressiveLoadingArchitecture.md`: at least 30 cold and warm runs per supported browser/device after a reviewed test deployment, with cache/source-scan metrics collected from Performance Diagnostics.

## Rollback

1. Revert this package's contract/cache/asset files as one change set.
2. Set `SC_SCHEMA_VERSION` and `SC_CACHE_EPOCH` to a new reviewed value rather than reusing possibly incompatible cached entries.
3. Remove only the two warming handlers if an administrator installed them; do not clear unrelated project triggers.
4. Remove the two cross-project asset-service properties from Attendance and the matching secret from SpecCentral.
5. If temporarily restoring the old Attendance image path, treat it as a time-boxed rollback because it relies on browser Drive access and reintroduces cross-browser/privacy risk.
6. Source spreadsheets require no rollback because this package made no source-data changes.

## Known risks and next package

- CacheService is not durable and per-projection leases are the safest available Apps Script approximation, not Redis-grade distributed locks.
- The rich Participants module still upgrades to the complete slim shared list after first paint for existing client-side exports and navigation. Server-side page/filter APIs now exist; the next package should finish converting the explorer to remote pagination/search throughout.
- Attendance still needs a transaction/revision index and delta polling to eliminate complete active-sheet reads.
- Stable keys should be persisted for source rows currently relying on deterministic fallback identity.
- Cloud Storage governance and infrastructure remain outstanding.

Recommended next package: Attendance transaction/revision projections plus full remote pagination for the Participants explorer, followed by a governed private Cloud Storage migration.
