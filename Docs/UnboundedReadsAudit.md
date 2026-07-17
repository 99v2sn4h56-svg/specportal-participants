# Unbounded full-sheet reads — audit and ranking

Date: 17 July 2026 (overnight autonomous session)
Scope: the six services named in `OptimisationStatusAndNextSteps.md` as additional unbounded `getDataRange()` users beyond Attendance/Timeline/Participants (already checked separately — `ParticipantProjectionService.js` and `TimelineService.js` currently show **zero** `getDataRange()` full-sheet reads, consistent with the pagination maturity found in Phase 4).

**This phase corrects the source docs' implied priority** after actually reading the code — most of these are already meaningfully mitigated by caching, not naive per-request full scans as the flagging alone might suggest. No code was changed this phase.

## Findings, ranked by actual user-facing impact (not just presence of `getDataRange()`)

| Service | Full-sheet read? | Already cached? | Real call frequency | Actual impact |
|---|---|---|---|---|
| `StaffService.js` | Yes (`readStaffSheet_`, `findStaffSource_`) | **Yes** — `PerformanceCacheService.getOrLoad("staff:all", 5 * 60, ...)` | Called from `UserContextService.js` (likely near-every authenticated request) but served from a 5-minute cache, not a live read per call | **Lower than expected** — the full read only actually runs once per 5 minutes platform-wide, not per-request. Real cost is the *size* of that periodic read, not its frequency. |
| `ShowRunService.js` | Yes (`load_`) | **Yes** — `PerformanceCacheService.getOrLoad(CACHE_KEY, CACHE_SECONDS, load_)` | Called from `AdministrationService`, `DataSyncService`, `PlatformSearchService`, `SpecPortal.js` | Already cached; same "periodic full read" cost profile as above, not per-request. |
| `RehearsalService.js` | Yes (`loadTimeline_`) | **Yes** — `PerformanceCacheService.getOrLoad`, with an explicit comment about a prior 80 KB `CacheService` single-value limit already having been worked around | Called from `DataSyncService`, `TimelineService`, `SpecPortal.js` | Already cached and already has evidence of a prior size-limit fix having been made — the most mature of the six. |
| `StaffAccessService.js` | Yes (line 48) | **No** — no `CacheService`/`PerformanceCacheService` reference found | Called only from `SpecPortal.js`'s `updateRole` gateway — a role-management admin action, not a hot path | Low impact: infrequent action, but genuinely uncached — every role update triggers a full re-read. |
| `StaffProfileService.js` | Yes (line 78) | **No** — no caching found | Called only from `getMyProfile`/`updateMyProfile` — a per-user "my profile" view, not a platform-wide hot path | Low-to-moderate: hit whenever a user opens their own profile, not on every page load platform-wide. |
| `StableIdMigrationService.js` | Yes | Not checked in depth | Migration-only service by name | Lowest priority — a one-time/rare migration utility is not a user-facing performance concern. |

## Why the "top 1-2 low-risk fixes" were not implemented tonight

None of the six presents a case that's simultaneously (a) genuinely high real-world impact and (b) safe to change unattended:
- The three cached services (`StaffService`, `ShowRunService`, `RehearsalService`) already have the *expensive* problem (repeated re-reads) solved. Reducing the *size* of their periodic full read (e.g. via a column projection instead of `getDataRange()`) is a real, valid improvement, but changing a working, cached, multi-caller data-loading function without any way to execute and observe the result carries meaningful regression risk for a comparatively modest gain (the read already only happens every few minutes, not per-request).
- `StaffAccessService`/`StaffProfileService` are genuinely uncached, but their low call frequency (admin role changes, individual profile views) means the realistic user-facing benefit of fixing them is smaller than it might appear from "uncached full-sheet read" framing alone.
- Same constraint as Phases 2 and 4: no headless script execution available for this project tonight, and the one dormant Participants staging environment was never actually deployed to. Making any of these changes without a live-execution verification path risks a silent regression in already-working, multi-caller code.

## Recommended next step (not done tonight)
If one fix must be picked first once a verified staging path exists: **add a lightweight cache layer to `StaffProfileService.getMyProfile`** (keyed per-user-email, short TTL e.g. 2-5 minutes) — it's the lowest-risk of the uncached pair (single-record lookup, not a role-mutation path), and would close the one genuine "uncached + real caller" gap found without touching any of the three already-cached, more architecturally central services.
