# Spec Central Technical Architecture

## 1. Overall Platform Architecture

Spec Central should be treated as one Schools Spectacular platform with multiple owned data domains, not as a collection of unrelated Apps Script projects. The current repo already points in that direction: `SpecCentral.html` provides a full-page shell, `SpecPortal.js` acts as a gateway, `ParticipantService.js` owns participant access, `RehearsalService.js` reads Timeline data, and Attendance currently remains a separate source app with a documented migration path.

Spec Central is the staff-facing portal. Operations is the protected management module inside Spec Central for organisation-wide running of Schools Spectacular. Normal staff should see personalised Home content, their accessible modules, rehearsals, attendance, announcements, and search. Organisation-wide statistics, diagnostics, imports, integration settings, and administrative actions belong in Operations.

```text
                         +-----------------------------+
                         |      Spec Central Shell      |
                         | landing, nav, dashboard, UI  |
                         +--------------+--------------+
                                        |
              +-------------------------+-------------------------+
              |                         |                         |
              v                         v                         v
     +------------------+       +------------------+       +------------------+
     |   Participants   |       |     Timeline     |       | Staff Production |
     | students, groups |       | events, venues,  |       | permissions,     |
     | schools, photos  |       | rehearsals       |       | roles, payroll   |
     +---------+--------+       +---------+--------+       +---------+--------+
               |                          |                          |
               |                          v                          |
               |                 +------------------+                 |
               +---------------> |    Attendance    | <---------------+
                                 | rolls, check-in, |
                                 | passport, status |
                                 +------------------+
```

### Data Ownership Boundaries

- Spec Central owns the application shell, navigation, announcements, notifications, recent activity, user session display, and module orchestration.
- Participants owns student records, school records, group records, participant profiles, participant search, and headshot/photo metadata.
- Timeline owns events, rehearsals, venues, schedules, and run sheets.
- Attendance owns roll marking, attendance status, student check-in, attendance passport/history, and event attendance notes.
- Staff Production Team owns permissions, roles, payroll, event allocations, user accounts, and security policy.

Spec Central can display and coordinate data from the other modules, but it should not become the owner of their source records.

## 2. Single Source Of Truth

| Data Type | Owner | Current / Expected Source | Consumers |
| --- | --- | --- | --- |
| Participants | Participants | `INDIVIDUALS(YES)` via `ParticipantService.getAll()` | Spec Central, Attendance, Reports, Profiles |
| Schools | Participants | `Schools Master Dataset` via `ParticipantService.getSchoolsMasterData()` | Spec Central, Profiles, Reports |
| Groups | Participants | `GROUPS(YES)` via `ParticipantService.getGroups()` | Spec Central, Attendance sync, Profiles |
| Headshots / photo map | Participants | Headshot Drive folder via `ProfilePhotoService` | Spec Central, Attendance sync, Profiles |
| Items / disciplines | Participants | Derived from participant/group records | Spec Central, Attendance, Timeline matching |
| Events | Timeline | Timeline / Operation Schedule workbook | Spec Central, Attendance |
| Rehearsals | Timeline | Timeline / Operation Schedule via `RehearsalService` | Spec Central dashboard, Profiles |
| Venues | Timeline | Timeline / Operation Schedule | Spec Central, Attendance |
| Run sheets | Timeline | Timeline/run sheet source | Spec Central, Reports |
| Attendance sessions | Attendance | Attendance `Event Index` | Attendance UI, Spec Central summaries |
| Attendance records | Attendance | Per-event attendance sheets | Attendance UI, Profiles, Reports |
| Student check-in | Attendance | Attendance web app and event sheets | Attendance, Reports |
| Passport/history | Attendance | Event sheets / future attendance index | Attendance, Profiles |
| Permissions | Staff Production Team | Production Team spreadsheet/future service | Spec Central, Attendance, Reports |
| Roles | Staff Production Team | Production Team spreadsheet/future service | Navigation, module access |
| Payroll | Staff Production Team | Payroll/Production Team source | Staff module, Reports |
| Event allocation | Staff Production Team | Production Team allocation source | Timeline, Attendance, Dashboard |
| User accounts/security | Staff Production Team | Email/role mapping | All secured modules |
| Announcements | Spec Central | Future announcements service/sheet | Dashboard, Notifications |
| Notifications | Spec Central | Future notification service | Dashboard, module alerts |
| Recent activity | Spec Central | Future activity log | Dashboard, module summaries |
| App settings | Spec Central | Script/user properties or settings sheet | App shell and module configuration |

| Operations overview/actions | Operations module | Protected Spec Central services | Operations administrators |

Rule: a module may cache, display, or derive data from another module, but it must not silently become a second source of truth.

## 3. Data Flow

### Platform View

```text
Participants ────────> Spec Central
     |                       ^
     |                       |
     v                       |
Attendance <──────── Timeline+
     ^                       |
     |                       v
Staff Production Team ─> Spec Central
```

### Current / Near-Term Flows

```text
Participants
  ├─ participants, schools, groups, photos
  └─ via portalGetPortalData()
        ↓
Spec Central
  ├─ dashboard stats
  ├─ participant search
  ├─ school/item/group/teacher profiles
  └─ future reports
```

```text
Timeline
  ├─ event rows, dates, venues, categories, staff
  ├─ via RehearsalService for read-only Spec Central views
  └─ via Attendance sync for event creation
        ↓
Attendance
  ├─ Event Index
  ├─ generated event sheets
  └─ roll sessions
```

```text
Participants + Timeline
  ├─ accepted participants and categories
  ├─ event/category matching
  └─ event metadata
        ↓
Attendance syncEventsFromTimeline()
        ↓
Attendance event sheets
```

```text
Staff Production Team
  ├─ email
  ├─ roles
  ├─ allowed modules
  ├─ event allocations
  └─ payroll/security
        ↓
PermissionService / StaffService
        ↓
Spec Central navigation, data access, write authorization
```

```text
Attendance
  ├─ event attendance status
  ├─ roll completion
  ├─ check-in timestamps
  └─ passport/history
        ↓
Spec Central
  ├─ dashboard widgets
  ├─ participant profile attendance section
  ├─ school/item summaries
  └─ reports
```

### Direction Rules

- Participants feeds Attendance; Attendance must not edit participant identity records.
- Timeline feeds Attendance; Attendance must not own the canonical event schedule.
- Staff Production Team feeds Spec Central permissions; client-side navigation hiding is not sufficient security.
- Spec Central reads across modules and coordinates UI, but domain writes must go back to the owning module.

## 4. Module Responsibilities

### Spec Central

- Purpose: unified staff landing page and application shell.
- Inputs: participant summaries, rehearsal/event summaries, attendance summaries, permissions, announcements.
- Staff-facing outputs: personalised Home, search, relevant rehearsals/events, attendance links, announcements, recent activity, and permitted modules.
- Management outputs: delegated to the protected Operations module.

### Operations

- Purpose: restricted management area for running Schools Spectacular.
- Inputs: Participants, Timeline, Attendance, Staff Production Team, announcements, diagnostics, import/reconciliation status.
- Outputs: operations overview, event management, user/permission review, project management, data management, announcement authoring, integrations, diagnostics, and audit.
- Consumers: operations administrators only.
- Outputs: navigation state, notifications, dashboard views, user-facing module pages.
- Consumers: all staff users.

### Participants

- Purpose: manage and expose student, school, group, item, teacher, profile, and headshot data.
- Inputs: participant spreadsheet tabs, school master dataset, headshot folder.
- Outputs: `portalGetPortalData()`, participant search results, profiles, photo URLs.
- Consumers: Spec Central, Attendance sync, Reports, Profiles.

### Timeline

- Purpose: own rehearsals, events, venues, schedules, and run sheets.
- Inputs: timeline / operation schedule workbook.
- Outputs: rehearsal/event records, key dates, event categories, venue/time metadata.
- Consumers: Spec Central dashboard, Attendance sync, Reports.

### Attendance

- Purpose: own attendance event sheets, roll marking, student check-in, attendance notes, and passport/history.
- Inputs: Timeline events, Participants records, Staff permissions.
- Outputs: attendance status, check-in timestamps, event notes, roll completion, student history.
- Consumers: Attendance UI, Spec Central dashboard, Participant/School/Item profiles, Reports.

### Staff Production Team

- Purpose: own people, permissions, roles, payroll, security, user accounts, and event allocation.
- Inputs: Production Team spreadsheet or future identity source.
- Outputs: staff context, module access, write permissions, payroll/reporting data.
- Consumers: Spec Central shell, Attendance, Reports, Settings.

### Reports

- Purpose: operational exports and audit views across modules.
- Inputs: read-only service outputs from Participants, Timeline, Attendance, Staff.
- Outputs: summaries, downloadable views, exception reports.
- Consumers: operations team, production leadership.

## 5. Shared Services

These services should eventually exist as stable interfaces. Some are already partially present in current code.

| Service | Responsibility | Current State |
| --- | --- | --- |
| `SearchService` | Shared search over participants, schools, groups, items, teachers, events | Search logic duplicated in sidebar and full-page app |
| `PhotoService` | Headshot lookup, Drive thumbnail normalization, cache invalidation | `ProfilePhotoService` exists; Attendance has local photo helpers |
| `PermissionService` | Server-side module access and write authorization | Placeholder `getCurrentStaffContext()` exists |
| `TimelineService` | Events, rehearsals, venues, schedule access | `RehearsalService` partially covers this |
| `AttendanceService` | Read/write attendance summaries, event rolls, passport history | Placeholder exists in Participants; standalone Attendance app has logic |
| `AnnouncementService` | Dashboard announcements and alerts | Placeholder concept only |
| `NotificationService` | User/module notifications and warnings | UI component exists; service not built |
| `SettingsService` | App URLs, module flags, environment config | Some use of script properties exists |
| `CacheService` wrapper | Consistent cache keys, TTLs, invalidation | Direct `CacheService` use exists in `RehearsalService` |
| `NavigationService` | Routes, module availability, current page | UI navigation exists; service boundary not mature |
| `AnalyticsService` | Usage, audit logs, performance events | Not built |
| `FormattingService` | Dates, names, phone, labels, status formatting | Helper duplication exists |
| `DirectoryService` | Staff/teacher contact directory | Teacher contact scripts exist but not unified |

Service rule: UI pages call gateway functions; gateway functions call services; services own spreadsheet/Drive access.

## 6. Shared UI Components

These components should exist once and be reused across modules.

| Component | Purpose | Current State |
| --- | --- | --- |
| Full-page header | Suite identity and Schools Spectacular branding | `Portal/Components/FullPageHeader.html` exists |
| Sidebar header | Compact Google Sheets sidebar identity | `Portal/Components/SidebarHeader.html` exists |
| Top bar | Page title, description, global search | `Portal/Components/TopBar.html` exists |
| Sidebar | Persistent module navigation | `Portal/Components/Sidebar.html` exists |
| Notifications | Global warnings and action feedback | `Portal/Components/Notifications.html` exists |
| Cards | Common rounded panels/modules/results | Styles exist, not fully componentized |
| Profile hero | Participant/school/item header block | Some profile components exist |
| Timeline | Rehearsal/event visual view | `Portal/Components/Timeline.js` exists |
| Statistic cards | Dashboard/module metrics | `Portal/Components/StatCards.js` exists |
| Search | Shared search input/results shell | Duplicated between sidebar and full-page app |
| Filters | Status/category/date filters | Not unified |
| Tables | Dense operational lists | Not unified |
| Modals | Detail overlays and confirmations | Not unified |
| Loading screen | Startup/loading states | Local implementations exist |
| Skeleton loaders | Large-data loading states | Not built |
| Status pills | Attendance/status labels | Multiple local implementations |
| Badges | Counts, tags, category labels | Multiple local implementations |
| Avatar / Headshot | Initials and photo fallback | Multiple local implementations |

UI rule: components should be visual and interaction shells only. They should not own data loading.

## 7. Long-Term Roadmap

### Stage 1: Participants Foundation

- Stabilise `ParticipantService` as the canonical participant/school/group API.
- Cache headshot maps safely.
- Consolidate participant helper functions and search logic.
- Keep sidebar and full-page Participants module working during migration.

### Stage 2: Attendance Integration

- Keep Attendance operational as a standalone module while exposing read-only summary APIs.
- Add attendance dashboard widgets in Spec Central.
- Add participant/school/item attendance summary sections.
- Avoid changing roll marking behavior until wrappers are proven.

### Stage 3: Timeline Integration

- Promote `RehearsalService` into a broader `TimelineService`.
- Show upcoming rehearsals, venues, run sheets, and key dates in Spec Central.
- Keep Timeline as event source of truth.

### Stage 4: Permissions And Staff Production Team

- Build `PermissionService` from Production Team data.
- Enforce server-side access checks for all write operations.
- Drive module visibility from permissions.

### Stage 5: Notifications And Announcements

- Add `AnnouncementService` and `NotificationService`.
- Surface operational alerts, missing data, upcoming deadlines, and role-specific notices.

### Stage 6: Dashboard

- Replace mock dashboard widgets with real service-backed widgets.
- Add personalisation: my schools, my items, my upcoming dates, attendance requiring action.

### Stage 7: Reports

- Add cross-module operational exports.
- Build exception reports: missing photos, missing attendance, duplicated participants, unmatched timeline items.

### Stage 8: Analytics

- Add usage and performance logging.
- Track slow services, high-frequency actions, and common search/profile flows.

## 8. Technical Debt

### Duplicate Code

- Participant search logic exists in `Portal.html`, `SpecCentral.html`, and legacy search files.
- Profile rendering exists across `Portal/Pages/Profile.html`, older `Views/*` files, and full-page prototype code.
- Photo URL/key logic exists in Participants, Spec Central full-page, and Attendance client code.
- Formatting helpers such as escaping, initials, phone/date formatting, and category normalization are repeated.

### Duplicate HTML / CSS

- Sidebar portal and full-page Spec Central have separate layout/style systems.
- Attendance has separate admin/student CSS and a separate branding component.
- Some placeholder module pages exist before service integration.

### Duplicate APIs

- `portalGetAllParticipants()`, `portalSearchParticipants()`, and `portalGetPortalData()` overlap in purpose.
- Attendance has standalone APIs that are not yet wrapped by Spec Central.
- Rehearsal/Timeline reads exist in `RehearsalService` while Attendance sync has its own Timeline reading code.

### Places One Module Should Call Another

- Attendance should consume Participants and Timeline through service contracts, not independent spreadsheet assumptions long term.
- Spec Central should consume Attendance through a read-only summary API first, then controlled write APIs.
- Reports should consume services, not scrape sheets directly.
- Permissions should sit behind `PermissionService`, not be checked ad hoc in client code.

### Apps Script Operational Debt

- Whole-sheet reads are common.
- Drive folder scans for photos need caching.
- Attendance passport history scans many event sheets.
- Large HTML templates include substantial inline logic.
- The platform has no clear environment/config strategy beyond script properties and constants.

## 9. Recommendations

### Lead Engineer Recommendations

Current full-page app direction:

- Keep Spec Central as the staff landing app.
- Keep the spreadsheet sidebar as a fast in-sheet participant workflow.
- Calendar is owned by Timeline data through `TimelineService`.
- Rehearsals are a filtered operational view of the same Timeline event contract.
- Project Management is currently a protected placeholder contract through `ProjectManagementService`.
- Media Timeline is currently a protected placeholder contract through `MediaTimelineService`.
- Staff Production Team is the future source of truth for permissions.
- Client-side hiding is useful UX, but server-side services must enforce permission checks.

1. Treat data ownership as non-negotiable. If two modules can edit the same source record, the platform will become fragile.
2. Keep Spec Central as the shell and coordinator, not the database.
3. Put every cross-module operation behind a service function before building more UI.
4. Prioritise read-only integrations first. Writes should come later with permissions, logging, and rollback thinking.
5. Stabilise Participants and Attendance before adding costumes/measurements into the platform shell.
6. Introduce a small, explicit settings layer for external URLs, spreadsheet IDs, feature flags, and module availability.
7. Cache reference data, not live attendance status. Live operational data needs freshness and clear write semantics.
8. Build server-side permission checks early. Hiding navigation on the client is useful UX, not security.
9. Reduce duplicated UI by extracting shared components after behavior is stable, not during active repairs.
10. Keep Apps Script limits visible: execution time, response payload size, Drive latency, concurrent users, and trigger ownership.

### Maintainability

- Define one service file per domain and keep spreadsheet access inside those services.
- Keep gateway functions thin and stable.
- Document every public server function used by `google.script.run`.
- Avoid large rewrites of `Portal.html`; continue extracting modules carefully.
- Prefer small, reversible changes with validation after each stage.

### Future Contributors

- Add module READMEs once service boundaries settle.
- Use consistent naming: `portalGet...` for Spec Central gateways, `...Service` for domain logic.
- Keep TODOs specific and tied to roadmap stages.
- Add examples of expected payload shapes for each service.

### Performance

- Cache Participants photo maps and Timeline rehearsal reads.
- Avoid scanning every event sheet for common dashboard loads.
- Consider an Attendance summary/index sheet for fast dashboard/profile reads.
- Keep client-side search indexed where possible.
- Avoid rendering large profile lists until visible or requested.

### Security

- Move from placeholder staff context to a Production Team-backed permission model.
- Enforce permissions on the server for every write.
- Log sensitive write actions: attendance updates, settings changes, payroll/security actions.
- Treat payroll and security data as restricted modules with explicit access.

### Apps Script Limits

- Apps Script is suitable for this phase while the source of truth remains Sheets/Drive.
- Watch for execution-time pressure in Attendance history, dashboard refresh, and Drive photo scans.
- Avoid frequent automatic syncs that rewrite many sheets.
- Keep deployments simple until the platform module boundaries are stable.

### Future Cloud Run / Firebase Path

Spec Central can remain Apps Script-first for now. Consider Cloud Run or Firebase later if:

- concurrent usage grows beyond Apps Script comfort,
- attendance needs real-time updates,
- reports require larger processing,
- permissions become complex,
- or the platform needs structured APIs outside Google Sheets.

A future migration should preserve the same ownership model: Participants, Timeline, Attendance, and Staff remain domains with stable service contracts. The implementation can move from Apps Script to Cloud Run/Firebase later without changing the conceptual architecture.
