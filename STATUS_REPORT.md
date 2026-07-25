# Project Status Report

**Generated:** 2026-07-25
**Purpose:** Full context handoff for a new collaborator/agent with no prior exposure to this project.

## How this project is actually organized

What one person might call "the project" is really **three separate things**, two of which share one codebase and one of which is fully independent:

1. **SpecCentral** — a Google Apps Script web app for managing NSW DET's "Schools Spectacular" performing-arts event: participant/school/group registration, acceptances, costumes, attendance, calendar, event operations, communications, and staff administration. This is the primary, actively-developed, live-in-production system.
2. **Worksheet Functions** — a set of spreadsheet-bound automation tools (Google Sheets menu items) that live in the **exact same Apps Script project** as SpecCentral, sharing its codebase, but are a functionally distinct layer: sync tools, bulk-import tools, and report generators that staff run directly from the spreadsheet's custom menu, largely independent of the SpecCentral web app's own code paths.
3. **TAU Central** — a completely separate, standalone prototype Apps Script project (own scriptId, own spreadsheet, own git repo) exploring a different, broader product concept ("One Arts Unit identity, one dashboard, many program relationships"). It does not import or connect to SpecCentral. It lives on disk at `/Users/courtcassar/Documents/SpecPortal/TauCentral/`, a sibling directory to this one.

Directory locations:
- SpecCentral + Worksheet Functions: `/Users/courtcassar/Documents/SpecPortal/Participants/` (this repo)
- TAU Central: `/Users/courtcassar/Documents/SpecPortal/TauCentral/` (separate repo, separate Apps Script project)

Both Apps Script projects are on the `V8` runtime, no external npm dependencies, no build step — this is hand-written vanilla JS/HTML served directly by Apps Script's `HtmlService`.

---

# Part 1 — SpecCentral

## 1. Overview

SpecCentral is the primary web app for running "Schools Spectacular," a large NSW DET performing-arts event. It gives staff a single dashboard to manage individual student participants, school groups, event scheduling/rehearsals, attendance check-in, costume/T-shirt logistics, communications, and Forms — all backed by a set of live Google Sheets that remain the actual system of record. The goal is to replace scattered spreadsheet work with one coherent, permission-scoped web interface, without ever making the spreadsheets themselves less authoritative.

## 2. Current state — what's built

Entry point: `doGet()` in `SpecPortal.js:20` routes to one of three things based on the `app`/`form` query parameters:
- No params → the full SpecCentral app (`SpecCentral.html`, evaluated as an Apps Script template)
- `?app=mobile` → a lightweight mobile search tool (`Mobile Search.html` / `MobileSearch.js`)
- `?form=<id>` → a standalone public form-response page (`PublicForm.html`), for people filling out forms without any app access at all

**SpecCentral.html** (`SpecCentral.html`) is a server-side template that concatenates ~35 separate `Portal/*.html` files into one HTML document at render time via `<?!= HtmlService.createHtmlOutputFromFile(...).getContent(); ?>` includes. Raw payload is ~800KB, ~163KB gzip-compressed (measured this session — not a meaningful contributor to the app's actual latency, which was traced entirely to server-side caching, see Known Issues).

Major modules/pages, each a `Portal/Pages/*.html` template plus supporting `Portal/App/*.html` logic:

| Module | Page template | Key logic |
|---|---|---|
| Dashboard | `Portal/Pages/Dashboard.html` | `Services/DashboardService.js` |
| Participants (Individuals / School Groups / By School) | `Portal/Pages/Participants.html` (~64KB, largest page module) | `ParticipantService.js`, `Services/ParticipantProjectionService.js` |
| Participant/Group/Staff/School Profiles | `Portal/App/SpecCentralProfiles.html` | same services above |
| Calendar / Rehearsals | `Portal/Pages/Calendar.html`, `Portal/Pages/Rehearsals.html` | `Services/RehearsalService.js`, `Services/TimelineService.js` |
| Attendance (incl. QR check-in) | `Portal/Pages/Attendance.html` | `Services/AttendanceService.js`, `Services/AttendanceProjectionService.js` |
| Operations / Event Manager | `Portal/Pages/Operations.html` | `Services/OperationsConsoleService.js`, `Services/EventManagerService.js`, `Services/EventWorkflowService.js` |
| Communications | `Portal/Pages/Communications.html` | `Services/CommunicationService.js` + `CommunicationAudienceService.js`, `CommunicationEmailProviderService.js`, `CommunicationMergeService.js`, `CommunicationRepositoryService.js` |
| Forms builder + public responses | `Portal/Pages/FormBuilder.html`, `Portal/App/SpecCentralFormBuilder.html`, `PublicForm.html` | `Services/FormResponseService.js` |
| Staff directory + self-service profile | `Portal/Pages/Staff.html` | `Services/StaffService.js`, `Services/StaffDirectoryService.js`, `Services/StaffProfileService.js`, `Services/StaffAccessService.js` |
| Administration | `Portal/Pages/Settings.html` | `Services/AdministrationService.js` |
| Media Timeline | `Portal/Pages/MediaTimeline.html` | `Services/MediaTimelineService.js` |
| Global/platform search | (in-page command centre, `Portal/Components/CommandCentre.html`) | `Services/PlatformSearchService.js` |
| Project management | `Portal/Pages/ProjectManagement.html` | `Services/ProjectManagementService.js`, `Services/TaskService.js` |
| Production exceptions (data-quality register) | (surfaced in Operations/Administration) | `Services/ProductionExceptionService.js` |

**Two other, separate frontends exist in this same project**, easily confused with SpecCentral itself:
- **"Open Spec Portal" sidebar** — `Portal.html` + `Portal/Pages/Search.html` + `Portal/Pages/Profile.html`, triggered from the spreadsheet's own menu via `openSpecPortalHome()`. A simpler, standalone participant/school search+profile tool for spreadsheet editors, not the full app.
- **"Participant Search 🔍" sidebar** — `SearchSidebar.html` + `Participant Search.gs.js`. An older, even simpler search tool, kept alongside the newer one.

## 3. Architecture

**Server side** — `Services/*.js`, each a self-contained IIFE singleton module (`const XService = (() => {...})();`) exposing a small public API. `SpecPortal.js` is the thin gateway layer: every `portalGet*`/`portalSave*`/`portalExecute*` function client JS calls via `google.script.run` lives here and mostly just delegates into a `Services/*.js` module after a capability check (`requirePortalCapability_`).

**Client side** — one giant global `App` object, assembled by many files each calling `Object.assign(App, {...lots of methods...})`. There is no bundler/module system; load order in `SpecCentral.html` is the only thing that matters. Routing is a hand-rolled hash-based router (`App.navigate`, `App.navigateRoute`, `App.parseRoute` — all in `Portal/App/SpecCentralApp.html` / `Portal/App/SpecCentralPerformance.html`).

**Caching** — `Services/PerformanceCacheService.js` is the load-bearing piece of infrastructure almost everything else depends on. It wraps `CacheService` with:
- Chunking + gzip compression (CacheService has a hard per-value size limit)
- Generation-based atomic publish (readers never see a half-written value)
- Two access patterns: `getOrLoad`/`getOrLoadDetailed` (blocking rebuild — a losing concurrent request polls up to 10s, then falls back to its own uncached read) and `getOrLoadStaleWhileRevalidate` (serves stale data instantly, only ever rebuilds when a caller explicitly passes `{refresh:true}` — nothing currently does this proactively except the shared warmer, see Known Issues)
- `peek(key)` — read without triggering any rebuild

**Privacy boundary** — `Services/ProjectionContractService.js` defines `LIST_FIELDS` / `GROUP_FIELDS` whitelists (which fields are allowed into bulk list/group projections sent to the browser) plus a `FORBIDDEN_LIST_FIELD` regex that blocks obviously-PII field names (email, phone, medical, notes, etc.) even if someone adds them to a whitelist by mistake. Every projection is passed through `ProjectionContractService.validate(name, response)` before being returned — this is a hard runtime check, not just documentation (see Known Issues #1, this exact mechanism broke production once this session).

**Telemetry** — `Services/PerformanceTelemetryService.js`. Two independent sample pools: "journey" (`measureJourney()`, always sets outcome success/failure) and "legacy" (`record()`, ~20 call sites, never sets outcome, only ever fires on success paths). `getDiagnostics()` merges both for `adminLogParticipantPerformanceSummary`.

**Entity IDs** — `Services/EntityModelService.js` generates stable hash-based IDs (`stableId(prefix, value)`) so the same logical entity (a participant, a group, a school) gets the same ID across reads even though the underlying spreadsheet has no real primary key.

**External source registry** — `Services/SourceRegistryService.js` is the canonical map of "what spreadsheet/sheet does entity type X actually live in," used by anything that needs to open an external spreadsheet (Show Run, Staff, Timeline).

**Auth** — `Services/UserContextService.js` resolves the current user's identity/permissions (backed by `StaffService.getAll()`, i.e. the Staff Production Team spreadsheet is the permissions source of truth), `Services/AuthorizationService.js` does the actual capability checks.

**Deployment model** (important, non-obvious): `clasp push` updates the Apps Script project's HEAD (used by the editor, spreadsheet menu functions, and sidebars). It does **not** update the deployed web app. `clasp deploy -i <deploymentId>` updates the specific production deployment (the `/exec` URL users actually hit). These are separate, and forgetting the second step means live users see stale code while everything *looks* pushed. Production deployment ID: `AKfycbz5Fa4-G_RwiovF-WYhIrq8C0v1ZT_K-OCF2m5_4wULyvLlPVo1wxz0jTkinyAulKzdHQ`, currently at v144. ScriptId: `1rbiomvSfdnPop9gQhuFF0N_mWiQp-6TrxPbVemP7lvcec_sHMjThlhp5`.

## 4. In progress / incomplete

- A prior, separate engagement built two full release candidates (Candidate A: navigation/attendance-history integration; Candidate B: a Dashboard restructuring replacing "Today's Schedule" with "Today's Operations") through staging validation, but **these were deliberately abandoned and deleted** (all branches/worktrees removed 2026-07-25, at the project owner's explicit direction) rather than merged. If anyone asks "what happened to Candidate A/B," the answer is: reviewed, never deployed, intentionally discarded.
- `adminListSchoolCrestFiles` (`SpecPortal.js`) is still labeled a "TEMPORARY diagnostic" in its own comment but was explicitly kept ("stay") by the project owner rather than removed — it's de facto permanent now, comment is just stale.

## 5. Known issues

No `TODO`/`FIXME` markers exist anywhere in this codebase (not a style that's used here — issues get fixed or discussed, not marked and left). The following are real, currently-relevant risk points found through direct investigation, not comment-mining:

1. **Two whitelists must be kept in sync by hand, and nothing enforces it.** `Services/ParticipantProjectionService.js`'s `toGroupItem_()` function (~line 327) decides what fields actually go into a group projection; `Services/ProjectionContractService.js`'s `GROUP_FIELDS` constant (~line 22) decides what the validator will *allow* through. These are two separate arrays that must contain the same field names. This exact mismatch broke School Groups/By School in production on 2026-07-25 (adding `teacherEmail`/`teacherMobile`/`teacherRole`/`notes` to one list without the other) — fixed, but the underlying fragility (no single source of truth) remains. The same pattern likely exists for `LIST_FIELDS` vs. whatever builds participant list items — worth checking before adding new fields anywhere near this boundary.
2. **Cache key collisions are possible and hard to spot.** `Services/PlatformSearchService.js` was independently caching `ParticipantService.getAll()`/`getGroups()` under the literal strings `"participants:all"`/`"participants:groups"` — the exact same keys `ParticipantService.js` already uses for its own stale-while-revalidate caching. Two different code paths writing incompatible value shapes (plain array vs. an SWR envelope object) to the same physical cache slot meant global search would intermittently throw a `TypeError`. Fixed this session, but there's no structural guard against this recurring elsewhere — cache keys are just string literals scattered across the codebase.
3. **`participants:all`/`participants:groups`/`participants:schools`/`staff:all` now have a 3-hour hard-expiry safety net** (raised from 30 minutes this session) rather than being kept perpetually warm by force-refresh — a prior attempt to force frequent rebuilds via the periodic warmer made real-world contention *worse*, not better (measured: p95 latency went from ~10s to 75-90s). The current design relies on explicit invalidation (the in-app "Refresh" button, `DataSyncService.invalidate()`, or `adminRefreshParticipantData()`) actually being called whenever source data changes — if some future sync tool edits a sheet without calling one of these, that tool's changes could take up to 3 hours to appear.
4. **Production has drifted from git before, entirely outside any session's visibility.** A prior reconciliation effort (now-deleted branch, but documented in this report from having read it) found that deployed version 95 of this same web app contained real, shipped features (a Dashboard/notification restructuring, a `portalGetParticipantGroupsProjection` endpoint) that were never committed to git at all — deployed from an uncommitted working tree and never captured. That specific drift has been reconciled and is no longer a live problem, but it demonstrates this *can* happen: someone with local `clasp deploy` access can ship code that git has no record of. Always verify `develop` matches what's actually live before trusting git as the source of truth.
5. **SpecCentral runs inside Apps Script's sandboxed iframe (`*.googleusercontent.com`), which does not reliably preserve `sessionStorage` or `localStorage` across a real browser refresh.** Both were tried this session as a way to remember the user's last page and neither survived reload — confirmed live, not theoretical. The working fix uses server-side `PropertiesService` instead (`portalGetLastRoute`/`portalSaveLastRoute` in `SpecPortal.js`, rendered into `SpecCentral.html` directly). Any future "remember client state across reload" feature needs to use this same server-side pattern, not browser storage.
6. **Individuals tab's client-side pagination doesn't cover every filter.** Culture/medical/support-needs/LOTE/first-time filters (`Portal/Pages/Participants.html`, `piiFilterKeys` array) intentionally still hit the server per page, because those specific fields are excluded from the browser-safe projection by design (see privacy boundary above) — matching against them can only happen server-side. This is correct behavior, but means those specific filters are noticeably slower than everything else in the same UI, which can look like a bug to an end user.
7. Several server-side sheet reads were converted from `getDisplayValues()` to `getValues()` this session for speed (participants, staff, timeline, show run) — each required hand-written date/time reconstruction logic (`stringifyStaffCell_`, `stringifyTimelineCell_`, the inline helper in `ShowRunService.js`'s `cell_()`) to avoid raw `Date` objects leaking into what should be display strings. These were verified by re-deriving the exact display format from how each value is subsequently parsed/used, but any *new* date/time column added to one of these sheets in future needs the same care — it's an easy thing to get wrong silently (wrong-looking dates, not a crash).

## 6. Dependencies

No package manager, no build step — plain Apps Script V8 JS/HTML. External dependencies are all loaded via `<script src="...">`/`<link>` tags directly in HTML:
- **Poppins** (Google Fonts) — the app's typeface, loaded via `fonts.googleapis.com`
- **SheetJS** (`xlsx.full.min.js` via `cdn.sheetjs.com`) — client-side Excel export
- **kazuhikoarase/qrcode-generator** (`cdnjs.cloudflare.com`) — client-side QR code rendering for attendance check-in, deliberately chosen so no check-in URL/token is ever sent to a third party to render the code
- Apps Script built-ins used throughout: `SpreadsheetApp`, `CacheService`, `PropertiesService`, `LockService`, `HtmlService`, `DriveApp` (headshots/school crests), custom `GOOGLEMAPS_*` sheet functions (`Google Distance.js`)
- `Tests/*.cjs` files run under plain Node (not Apps Script) for local, environment-free testing of pure logic — not part of the deployed app.

## 7. Next steps

No formal roadmap/backlog file exists in this repo — the following is inferred from current state, not a committed plan:
- Let the Group Computed Columns Sync trigger (30-min cadence, `Group Computed Columns Sync.js`) and the background participant/groups prefetch (`Portal/App/SpecCentralPerformance.html`) run through a full normal-usage day to confirm they stay healthy under real (not session-testing) load.
- Spot-check Staff Directory, Show Run, and Operations Timeline pages given their underlying sheet reads changed read-mode this session (see Known Issues #7) — nothing indicated a problem, but they haven't been used in anger since.
- An `App is not defined` console error was observed once during unrelated debugging (from a context mentioning `AuthDialog`, possibly an OAuth-related script, possibly unrelated to the main app) — never reproduced deliberately or chased down. Worth a look if it recurs.
- Decide whether TAU Central and SpecCentral's Forms feature are ever meant to converge (see Part 3) — there's a stated intention from an earlier engagement to reuse SpecCentral's Forms contract in TAU rather than rebuild it, but no work has happened on this since.

## 8. Open questions

- Several other git worktrees exist alongside this one (`Participants-CalendarBounded`, `-DesignSystem`, `-EventDetail`, `-FeatureSprint1`, `-FeatureSprint2`, `-Forms`, `-FormsIdentity`, `-FormsWorkflow`, `-UXPolish`), all targeting a *different* Apps Script scriptId (`1emIScVRAk5rlVuFafmDplWI6mFXo6EzoNa6qWpSk-kGARsYz33H7LiZ8`) than this project's live one. These were deliberately left untouched this session (out of scope for the cleanup that removed the Candidate A/B pipeline) — their purpose, ownership, and whether they're still active is unconfirmed. They may relate to TAU Central or to something else entirely.
- Who or what has `clasp deploy` access to this project outside of sessions like this one, given production has drifted from git before without any session's knowledge? Not established.
- Is there a plan for the abandoned Candidate B Dashboard restructuring (Today's Operations replacing Today's Schedule)? It was staging-validated, reviewed, and technically sound before being discarded — if that product direction is still wanted, it would need to be rebuilt from scratch, not recovered (the branches are deleted).

---

# Part 2 — Worksheet Functions

## 1. Overview

A set of spreadsheet-bound automation tools, all triggered from a custom "Spec Tools" menu (`Menu.js`) added to the Participants Google Sheet on open. These exist to keep the spreadsheet itself — which remains the actual system of record — internally consistent, synced from source Google Forms, and free of manual-entry drift, without staff needing to touch SpecCentral or write formulas by hand.

## 2. Current state — what's built

Menu structure (`Menu.js:19-45`), grouped into submenus:

| Submenu | Tools | Backing file(s) |
|---|---|---|
| 📊 School Reports | Refresh School Summary, Refresh Email Validation, Generate School Map Export, Export to Excel | `By School Data.js` |
| ✅ Acceptances | Sync Individual/Group Acceptance Forms, Upload Acceptances / New Participant | `Acceptances - Individuals.js`, `Acceptances - Groups.js`, `ImportCentre.html` + `ImportService.js` |
| 💃 Dance Workbooks | Create/Update Dance Workbooks, Sync Existing Only | `Dance Workbooks.js` |
| 📏 Costume Measurement Sheets | Generate/Update sheets, Audit, Sync fill status to GROUPS(YES) | `Generate Measurment Sheets.js`, `Update Measurement Sheets.js`, `Costume Measurement Status Sync.js` |
| 👕 T-Shirt Orders | Sync Order Status from Form | `T-Shirt Order Sync.js` |
| 🧮 Group Computed Columns | Sync Now, Enable Auto-Sync (30 min) | `Group Computed Columns Sync.js` — **new this session** |
| 🎬 Show Run | Sync Now, Enable Auto-Sync (15 min) | `Show Run Sync.js` — **new this session** |
| 🔑 Stable ID Migration | Dry Run, Apply | `Services/StableIdMigrationService.js` |

Every menu action runs through a shared wrapper, `runSpecTool_()` (`Menu.js:61-75`), which gives a consistent "Working…" → "Done" toast and turns any uncaught error into a readable alert instead of Apps Script's default error dialog.

**`Group Computed Columns Sync.js`** (built this session) is the most structurally interesting of these: it converts six formula-derived columns on GROUPS(YES) (Region, Principal Network, Total, Calculation sentence, Shirt Category, All Teacher Emails) from live spreadsheet formulas into script-computed static values, because formula-heavy columns measurably slowed down every read of that sheet from SpecCentral. Its core safety rule — **a cell is only ever overwritten if it currently contains a live formula; anything already static (a manual staff override) is left completely untouched** — exists because an early version of this tool would have silently zeroed out real, manually-entered fee data on ~11 rows where staff had overridden a formula by hand. This is the single most important thing to understand before modifying this file.

**`Show Run Sync.js`** replaces a live `IMPORTRANGE` formula (which was adding latency to every read of the entire workbook, not just the Show Run tab) with a periodic static snapshot of the same source data `Services/ShowRunService.js` already reads directly.

## 3. Architecture

These tools are plain spreadsheet-bound Apps Script functions — no web UI beyond the occasional `SpreadsheetApp.getUi()` alert/prompt, no `doGet()` involvement. They read/write the same underlying Google Sheets that `ParticipantService.js` and `Services/ShowRunService.js` (SpecCentral's own data layer) also read — meaning any change here can have direct, immediate downstream effects on SpecCentral's data, and vice versa. There is no separation between "worksheet tooling" and "SpecCentral" at the data layer — they're two different *interfaces* onto the exact same spreadsheets.

Time-driven triggers (installed via the "Enable Auto-Sync" menu items) run these on a schedule independent of anyone having the spreadsheet open: `warmSpecCentralSharedProjections`/`warmSpecCentralActiveAttendanceProjection` (~10min/~5min), `syncShowRunSnapshot` (15min), `syncGroupComputedColumns` (30min, reduced from an initial 5min after it was found to cause real production contention — see SpecCentral Known Issues #2/#3, same root cause).

Column lookups across these tools are deliberately header-based (find a column by its header text), not position-based, so inserting/reordering spreadsheet columns doesn't silently break a sync tool.

## 4. In progress / incomplete

- `Acceptances - Groups.js` had a one-time reset tool (`ssResetAboriginalAdjustmentsFromForm`) added earlier in the project's history to fix a bug where a sync had been writing to the wrong blank columns instead of the headed Aboriginal students/Adjustments columns. It was run once, confirmed, and the function itself has since been removed from the file per its own "run once, then delete" instruction — no outstanding action here, noted only because it's exactly the kind of one-time tool that could reappear if anyone needs the same class of fix again.

## 5. Known issues

- Same caveat as SpecCentral Part 1, Known Issue #3: `Group Computed Columns Sync.js`'s auto-sync trigger was originally set to run every 5 minutes and this caused measurable, real contention for concurrent SpecCentral users (p95 latency spikes into the tens of seconds). It now runs every 30 minutes. **Do not reduce this interval without first confirming the sync's own Sheets API call volume has been reduced** (it currently does full-range reads/writes across GROUPS(YES) and Schools Master Dataset every run) — the interval alone isn't the root cause, the API call volume per run is.
- No automated tests exist for any of these tools; verification has historically been manual (run, inspect the resulting sheet, run a comparison diagnostic).

## 6. Dependencies

Same Apps Script project as SpecCentral (Part 1) — no separate dependencies. `ImportCentre.html`/`ImportService.js` (bulk acceptance import) is the only piece with its own dedicated UI (a modal dialog, not a full page).

## 7. Next steps

- No committed plan. The natural next candidate for the same "formula → script-computed value" treatment applied to `Group Computed Columns Sync.js` would be identifying any other formula-heavy sheet still slowing down a frequently-read SpecCentral data path, if one exists — none has been identified yet.

## 8. Open questions

- Whether `Group Computed Columns Sync.js`'s 30-minute interval is conservative enough, or whether it should be reduced further once/if its own per-run Sheets API footprint is optimized (e.g. only touching rows that actually changed instead of a full-sheet scan every time) — flagged as a possible follow-up, not started.

---

# Part 3 — TAU Central

## 1. Overview

TAU Central is a **separate, fictional** prototype for a different, broader Arts Unit product: "One Arts Unit identity, one dashboard, many program relationships" — i.e. one participant portal spanning many different programs, not just one event like SpecCentral. Per its own README: **"It does not import or connect to SpecCentral."** Everything in it — schools, people, transactions — is explicitly fictional seed data.

## 2. Current state — what's built

Location: `/Users/courtcassar/Documents/SpecPortal/TauCentral/` (separate git repo, separate Apps Script project — scriptId `1DvbvoBxQao54_qvIRMaVS8r3P9Zp0YLq5HyWeSJgJav4rT_2RZ4imrkP`, prototype spreadsheet `1W89UdKFLcgJW43DOhUOoevdoBjeUJQmLO1xjXRxiqkc`).

Backend: modular Apps Script services with a repository layer (`Repository.gs`), server-side permission checks (`PermissionService.gs`, `AuthService.gs`), locking, validation, uniform responses, and structured audit records (`AuditService.gs`). Domain services per program-management concept: `ApplicationService.gs`, `AssessmentService.gs`, `EndorsementService.gs`, `EnrolmentService.gs`, `EventService.gs`, `OfferService.gs`, `OpportunityService.gs`, `ProgramService.gs` (34KB, the largest domain service), `SchoolService.gs`, `DirectoryService.gs`, `TaskService.gs`, `ReportingService.gs`, `AnnouncementService.gs`.

Frontend: `HtmlService` + vanilla JS router/state (`ClientApp.html`, 66KB — the largest single file in the project), `AppShell.html`, a large shared `Styles.html` (69KB), a `FormBuilder.html` (56KB) that deliberately follows the same five-step editing journey as SpecCentral's Forms (Form Information → Questions → Preview → Workflow → Publish) while keeping TAU's own black/red visual identity.

Managed sheets (via `Schema.gs`/`Setup.gs`): `CONFIG, USERS, PEOPLE, STUDENTS, PARENTS, PARENT_LINKS, SCHOOLS, SCHOOL_ACCESS, PROGRAMS, PROGRAM_MODULES, PROGRAM_BLUEPRINTS, OPPORTUNITIES, APPLICATIONS, APPLICATION_PARTIES, APPLICATION_SECTIONS, ENDORSEMENTS, ASSESSMENTS, OFFERS, OFFER_RESPONSES, ENROLMENTS, PROGRAM_ROLES, EVENTS, TASKS, TASK_ASSIGNMENTS, ANNOUNCEMENTS, DOCUMENTS, DIRECTORY, AUDIT_LOG`.

Six fictional personas for testing every permission level: Alex Morgan (Student), Jordan Morgan (Parent/carer), Taylor Singh (Teacher), Casey Nguyen (Arts Unit staff), Morgan Lee (Program administrator), Sam Williams (Executive administrator). All emails use `.invalid`; no notification service actually sends mail.

Documentation lives in `docs/`: `ARCHITECTURE.md`, `DATA_MODEL.md`, `DEPLOYMENT.md`, `FORMS_UNIFIED_EDITOR.md`, `PERMISSIONS.md`, `TEST_PLAN.md`, `USER_JOURNEYS.md`.

## 3. Architecture

Same Apps Script V8 + HtmlService pattern as SpecCentral, but a fully independent codebase and data model — no shared code, no shared services, no shared spreadsheet. The only intentional point of *conceptual* connection is the Forms editor, which deliberately mirrors SpecCentral's five-step Forms journey (see `docs/FORMS_UNIFIED_EDITOR.md`) while remaining visually and technically native to TAU.

Setup is idempotent and non-destructive by design: `setupTauCentralPrototype()` can be run repeatedly, never clears existing sheets, only appends missing required headers. `resetTauCentralFictionalSeedData()` is **deliberately disabled** — resetting requires working from a copied spreadsheet or explicitly archiving TAU-managed rows, never clearing the workbook outright.

## 4. In progress / incomplete

Directly from the project's own README, under "Known limitations":
- Prototype personas replace real authentication entirely (no real login).
- Dashboards show fictional fixture summaries so the shell is demonstrable before full setup.
- **Complex uploads, fees, forms, attendance, travel, accommodation, and outbound communications are interfaces/placeholders only** — not functional.
- Spreadsheet tabs could not be pre-inspected during development because the local clasp OAuth client had the Sheets API disabled and no Drive-file grant — setup logic is consequently defensive/non-destructive rather than verified against real sheet structure.
- The original Apps Script project deployment remains untouched; dedicated TAU Central releases are expected to use a separately versioned web-app deployment (not yet set up, per the README's setup instructions which only reference "Test deployments").

## 5. Known issues

- Real authentication is not implemented. The README documents the intended replacement: swap `resolveActor_()` for trusted session identity (Department-approved identity for students/staff, an approved external identity provider for parents) while keeping `PermissionService.gs` and scoped repository queries as-is. Not started.
- No confirmed production deployment exists yet — everything so far is development/test-deployment only, per explicit instruction in the README not to update any existing deployment without approval.

## 6. Dependencies

No external CDN dependencies confirmed in the files reviewed, beyond Apps Script built-ins. The `Tau Black.png` logo is embedded directly as a static PNG data asset in `Logo.html` rather than referenced via a Drive URL, specifically so the interface doesn't depend on Drive sharing permissions. Font stack: `"Platform", "Public Sans", Arial, sans-serif` for display text (a placeholder — the README notes exactly where an authorised Platform webfont could be connected, but no font binary is bundled).

## 7. Next steps

Per the README's own manual checklist, the expected next validation pass is: switch through all six personas and confirm navigation/metrics/records change correctly per role; test keyboard navigation, focus rings, mobile menu, reduced motion, error states, and empty states; walk through specific cross-persona workflows (Jordan endorses Alex's application, Taylor completes Riley's teacher endorsement, Casey reviews an eligible application, Morgan creates a fictional program, Sam opens reporting/admin/audit log); and confirm no email was sent and no SpecCentral resource was ever touched during any of this.

## 8. Open questions

- Whether/when TAU Central is meant to converge with SpecCentral's Forms feature (an earlier engagement's stated intention was to reuse SpecCentral's Forms *contract* rather than rebuild Forms twice) is unresolved — no work has happened on this since that intention was recorded.
- Real-identity authentication design (which identity provider for parents specifically) is flagged as future work with no committed timeline.
- Relationship (if any) between TAU Central and the other `Participants-*` worktrees flagged as an open question in Part 1 (`-DesignSystem`, `-Forms`, `-FormsIdentity`, `-FormsWorkflow`, etc., all targeting a scriptId that is neither this project's live scriptId nor TAU Central's `1DvbvoBxQao54_qvIRMaVS8r3P9Zp0YLq5HyWeSJgJav4rT_2RZ4imrkP`) is unconfirmed — worth checking if a new collaborator has access to investigate that third scriptId.
