# Script Properties capacity plan (Participants / SpecCentral)

Date: 17 July 2026 (overnight autonomous session)
Scope: read-only inventory of operational data stored in Apps Script `PropertiesService.getScriptProperties()` for the Participants project. **No production data was read, migrated, or modified** — this is a static-code inventory (grep + reading the storage adapters), not a live query of actual stored values.

Relevant platform quotas (Apps Script, as documented by Google): **9 KB per individual property value**, **500 KB total per script project** across all properties combined.

## What's actually there today

Two storage patterns exist, both already chunking-aware and already bounded — this is a more mature design than "unbounded growth risk" implies; the real question is headroom within the existing bounds, not an emergency.

### 1. `PlatformStoreService.js` — the general operational-record adapter
A small, already-well-designed abstraction (`Services/PlatformStoreService.js`) with two modes:
- **Bounded mode** (`put`/`list`/`update`): stores one JSON array per collection under a single property (`SPEC_PLATFORM_V1_<COLLECTION>`), capped at `MAX_PROPERTY_CHARS = 8000` — the list self-truncates (drops oldest records) if it would exceed that, in addition to a `maxRecords` argument.
- **Chunked mode** (`putLarge`/`listLarge`, 7500-char chunks): available for collections that could legitimately exceed one property, not currently used by any of the five callers found (see below).

**Collections currently in use, and their caps:**

| Collection | Used by | Cap (`maxRecords`) | Storage key |
|---|---|---|---|
| `audit` | `AuditService.js` | not explicitly capped at `put()` call site — defaults to `put()`'s own `maxRecords \|\| 100` | `SPEC_PLATFORM_V1_AUDIT` |
| `tasks` | `TaskService.js` | 100 | `SPEC_PLATFORM_V1_TASKS` |
| `notifications` | `NotificationService.js` | 100 | `SPEC_PLATFORM_V1_NOTIFICATIONS` |
| `jobs` | `JobService.js` | 80 | `SPEC_PLATFORM_V1_JOBS` |
| `workflow_queue` | `OperationsQueueService.js` | 80 | `SPEC_PLATFORM_V1_WORKFLOW_QUEUE` |

All five are self-truncating JSON arrays under one property key each, each hard-capped under 8000 characters. **Combined worst case: ~40 KB** — well within the 500 KB total quota on its own. `safeData()` already redacts sensitive-looking keys (`secret|token|password|medical|support.?plan|parent|mobile|headshot|photo`) before anything is stored, which is good existing practice worth preserving in any future migration.

### 2. `FormResponseService.js` — its own, separate chunked pattern
Two large, growing stores, using an equivalent (but independently implemented, not shared with `PlatformStoreService`) chunking scheme:
- **`SC_SHARED_FORM_DEFINITIONS_V2`** — form definitions (questions, schedule, logistics), each bounded per-form (200 questions max, 5000-char description max, 50 schedule items max, etc.) but the *number* of published forms over time is not capped in the code read so far.
- **`SC_FORM_RESPONSE_PROFILE_INDEX_V1`** — the response index, explicitly capped at **1500 items** (`items.slice(0, 1500)`, `FormResponseService.js` line 542). This is the one genuinely growing operational record store in the codebase: every form submission adds an entry, and once the cap is hit, oldest responses roll off — which matters if anyone assumes historical form responses are retained indefinitely (they are not, past 1500).

Observed already-existing seen keys (from the live Participants Script Properties, viewed read-only earlier this session): `SC_ATTENDANCE_PROJECTION_EPOCH`, `SC_PARTICIPANT_PROJECTION_EPOCH`, `SC_DASHBOARD_PARTICIPANT_SUMMARY_...`, `SC_FORM_RESPONSE_PROFILE_INDEX_V1_...` (chunked), `SC_SHARED_FORM_DEFINITIONS_V2__0`/`__chunks`, `SPEC_PLATFORM_V1_AUDIT`, `SPEC_PLATFORM_V1_PARTICIPANT_PAGE_...` — consistent with the code-level inventory above, giving reasonable confidence this analysis reflects what's actually deployed, not just what the code intends.

## Growth risk assessment

- **Low risk, self-bounded**: all five `PlatformStoreService` collections (task/audit/notification/job/queue storage) — hard record caps, small total footprint, no code path that could exceed them.
- **Moderate risk, worth monitoring**: `SC_FORM_RESPONSE_PROFILE_INDEX_V1` — bounded at 1500 responses, but each response can carry a nontrivial number of mapped answer fields; as the number of active forms and submission volume grows, 1500 total (not per-form) could become a tighter ceiling than expected, silently dropping older response history sooner than assumed.
- **Needs a direct check, not estimated here**: `SC_SHARED_FORM_DEFINITIONS_V2`'s growth is bounded per-form but not in form *count* — if forms are rarely archived/deleted, this could grow over years. A live read of the actual current chunk count (`SC_SHARED_FORM_DEFINITIONS_V2__chunks`) would give a real current-size answer; not done here since it requires script execution, not just code reading.
- **Aggregate 500 KB ceiling**: the two `FormResponseService` stores are the ones that could plausibly approach a meaningful fraction of the total quota over multi-year use; the five `PlatformStoreService` collections cannot on their own.

## Migration strategy (designed, not executed)

Recommended in ascending order of complexity — **do not skip a tier "for future-proofing" if the lower one is sufficient**, per SpecCentral's existing bias toward small, bounded, dependency-free adapters:

### Tier 1 — Sheet-backed structured storage (recommended first step, lowest risk)
For `SC_FORM_RESPONSE_PROFILE_INDEX_V1` specifically: move to a native Google Sheet (one row per response, one tab), keeping `PropertiesService` only for a small pointer/epoch value (mirroring the existing `SC_PARTICIPANT_PROJECTION_EPOCH` pattern already used elsewhere in this codebase for cache invalidation). This is the lowest-risk option because:
- It reuses a pattern (`SpreadsheetApp` reads/writes) already proven throughout this codebase (Attendance, Timeline, Participants all already read/write Sheets extensively).
- It removes the 1500-record ceiling entirely — a Sheet can hold hundreds of thousands of rows.
- It keeps data human-inspectable for support/debugging, consistent with how the rest of SpecCentral's operational data is already stored.
- Query patterns used today (`responsesForProfile`, filtering by profile/form) translate directly to a filtered Sheet read.

### Tier 2 — Drive-backed storage (only if Tier 1 proves insufficient)
For `SC_SHARED_FORM_DEFINITIONS_V2` if form *count* growth ever becomes a real problem: one JSON file per form definition in a dedicated Drive folder, with `PropertiesService` holding only an index (id → file ID) — similar in spirit to the existing headshot/support-plan Drive-folder patterns already used in Attendance. Only worth doing if a live check confirms form-definition growth is actually approaching the quota; speculative otherwise.

### Tier 3 — A proper database (future option, not recommended now)
Firestore or a similar managed database would remove all Apps Script storage quotas entirely, but introduces a new external dependency, new credentials to manage, and a genuinely different operational model than anything else in this codebase. Not recommended unless SpecCentral's data volume or query complexity outgrows what Sheets can reasonably serve — no evidence of that today.

### Migration mechanics (for whichever tier is chosen)
- **Dual-read/dual-write transition**: read from the new store first, fall back to the old `PropertiesService` value if the new store is empty/missing (mirrors the existing `STALE_WEB_APP_URLS`-style fallback pattern already used in `AttendanceService.js`) — write to both during a transition window, cut over once the new store is confirmed populated and correct.
- **Rollback**: since the old `PropertiesService` data is never deleted during the transition window, rollback is simply reverting the read path to prefer the old store again — no data loss risk as long as the old properties aren't cleared until the new store has been running successfully for an agreed period.
- **Integrity verification**: before cutover, compare record counts and a sample of individual records between old and new stores; after cutover, spot-check that new writes appear in both during the dual-write window.
- **Retention**: moving off a hard 1500-record cap is itself a retention *policy* decision, not just a technical one — recommend deciding an explicit retention period (e.g. "keep 3 years of form responses") rather than defaulting to "keep everything forever" just because the new store technically can.

## What was not done tonight
- No live read of actual current property sizes/chunk counts (would need script execution — not available headlessly this session).
- No migration was executed; no production data was touched, read in bulk, or moved.
