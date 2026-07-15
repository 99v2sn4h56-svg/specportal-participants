# Spec Central Engineering Investigation

## Scope

This investigation covers the Participants project as the current home of the Spec Central platform. It focuses on the full-page Spec Central web app, the compact Google Sheets participant-search sidebar, shared services, permissions, search, photos, and current modular boundaries.

The working tree was clean before this investigation. The prior commit is the checkpoint for the current valid state.

## Current Architecture

Spec Central currently has two presentation shells:

- Full-page web app served by `doGet()` through `SpecCentral.html`.
- Compact Google Sheets sidebar opened by `openSpecPortalHome()` through `Portal.html`.

Both shells share backend gateway functions in `SpecPortal.js` and data services such as `ParticipantService`, `ProfilePhotoService`, `TimelineService`, `RehearsalService`, `AttendanceService`, `StaffService`, `ProjectManagementService`, and `MediaTimelineService`.

The sidebar is already partly modularised:

- `Portal.html` owns the compact shell and shared sidebar globals.
- `Portal/Pages/Search.html` owns sidebar data loading, indexing, search and result cards.
- `Portal/Pages/Profile.html` owns sidebar profiles.
- `Portal/Pages/Dashboard.html` owns sidebar dashboard, recent searches and recently viewed.
- `Portal/Styles/Portal.html` owns sidebar styling.
- `Portal/Components/SidebarHeader.html` owns sidebar branding.

The full-page app is visually modular but the browser runtime is still concentrated in `SpecCentral.html`. Template includes exist for pages and components, but most controller logic, service orchestration, search, profile rendering, photos, navigation, dashboard, calendar, attendance, staff, operations and utilities still live inside one large inline `window.App` object.

## Root Problems

1. `SpecCentral.html` is too large and owns too many responsibilities.
2. Full-page startup eagerly loads `portalGetPortalData()`, which pulls participants, groups, schools and photos before the user opens Participants.
3. Full-page search providers rebuild or rescan large arrays on every query.
4. Sidebar and full-page clients duplicate field helpers, item normalisation, photo lookup, group count handling, school totals and search scoring.
5. Full-page Home can still drift toward organisation-wide operations metrics when the user has `operations.view`; Home should stay personal and Operations should own management views.
6. Profile renderers are duplicated between full-page and sidebar.
7. `Portal/App/*.js` currently document intended boundaries but are not active browser modules.
8. Placeholder services and placeholder records are useful for development, but the UI must label them clearly and avoid presenting fake operational data as live.
9. Permission hiding is present on the client; protected backend services exist for Operations and Media, but future write functions must enforce granular permissions server-side.
10. Photo handling is safer than earlier versions but still duplicated and should become one shared client photo module.

## Current `SpecCentral.html` Responsibilities

`SpecCentral.html` currently owns:

- full-page document shell and CSS
- full-page component includes
- page template includes
- `window.App.state`
- page registry and route metadata
- bootstrap sequence
- local storage helpers
- event bus
- `google.script.run` request wrapper
- service registry and status rendering
- permission-aware navigation
- global search binding
- staff context rendering
- Home rendering
- announcements/recent activity widgets
- participant data loading
- photo loading and URL normalisation
- search providers and ranking
- participant, school, group, item, teacher and staff profile rendering
- calendar and rehearsal rendering
- attendance iframe rendering
- operations rendering
- media timeline rendering
- staff page rendering
- utility formatting, escaping and field helpers

This concentration is the main maintainability risk.

## Sidebar / Full-Page Collision Risk

The major collision risk is not routing anymore; routing is already separated:

- `openSpecPortalHome()` opens `Portal.html`.
- `doGet()` opens `SpecCentral.html`.

The remaining risks are shared naming and broad CSS:

- both shells use generic names such as `.panel`, `.moduleCard`, `.status`, `.results`, `.avatar`, `.profilePanel`;
- full-page CSS is inline in `SpecCentral.html`, while sidebar CSS is in `Portal/Styles/Portal.html`;
- current body context attributes help: `Portal.html` uses `data-app-context="sidebar"` and `SpecCentral.html` uses the full-page shell, but full scoping is not complete;
- browser globals in the sidebar are plain functions, while the full-page shell uses `window.App`; this is acceptable as long as the files are not cross-included.

## Search And Index Findings

Sidebar search builds maps once after `portalGetPortalData()`:

- `participantsBySchool`
- `participantsByItem`
- `participantsByTeacher`
- `groupsBySchool`
- `groupsByItem`
- `searchIndex`
- `itemSearchRecords`

Full-page search still relies on provider scans and helper calls at query time. The largest repeated work is:

- participant provider maps every participant per query;
- schools provider calls school aggregate helpers per school per query;
- items provider rebuilds item maps per query;
- teacher provider rebuilds teacher maps per query;
- global search triggers Participants navigation immediately.

Destination: build full-page indexes once after participant data loads and let providers query those records.

## Startup Findings

Full-page startup currently calls:

1. `App.bootstrapState()`
2. `App.restoreSidebarState()`
3. `App.bindGlobalSearch()`
4. `App.loadConfig()`
5. `App.loadPortalData()`
6. `App.navigate("dashboard")`

`App.loadPortalData()` is expensive and should not be part of initial Home startup. It should load when:

- Participants opens;
- global search is used;
- Browse Schools / Browse Items is used;
- a participant-related deep link is opened.

Calendar/Rehearsals are already closer to lazy loading through `loadCalendarData()`.

Operations and Media Timeline are already lazy and protected.

## Permission Findings

`StaffService` reads the Staff Production Team spreadsheet and returns current staff context with permissions. Unknown users receive only baseline view permissions. Operations and Media services validate permissions server-side before returning placeholder data.

Needs next:

- granular Operations backend wrappers for future write/update actions;
- a shared `PermissionService` abstraction;
- avoid hardcoding privileged users;
- document every protected route and server method.

## Photo Findings

`ProfilePhotoService` supports cached student photos, Drive thumbnail URLs, diagnostics and participant photo lookups. Participants also include `photoId` and `photoUrl` fields from the Individuals sheet. Full-page and sidebar each implement their own photo URL selection and fallback logic.

Destination:

- one shared client photo module;
- prefer stable `photoId` / Drive file ID where present;
- never block card rendering on photos;
- lazy-load images;
- keep initials fallback.

## Proposed Destination Structure

Short term:

- keep Apps Script HTML includes;
- extract `SpecCentral.html` runtime into `Portal/App/*.html` client script includes;
- keep `window.App` as the single shared full-page app object;
- keep sidebar functions isolated in `Portal.html` and `Portal/Pages/*`.

Target full-page modules:

- `Portal/App/Core.html`
- `Portal/App/Services.html`
- `Portal/App/Navigation.html`
- `Portal/App/Search.html`
- `Portal/App/Participants.html`
- `Portal/App/Photos.html`
- `Portal/App/Dashboard.html`
- `Portal/App/Calendar.html`
- `Portal/App/Rehearsals.html`
- `Portal/App/Attendance.html`
- `Portal/App/Staff.html`
- `Portal/App/Operations.html`
- `Portal/App/MediaTimeline.html`
- `Portal/App/Diagnostics.html`

## Migration Order

1. Document and preserve the current working state.
2. Stop eager full-page participant loading.
3. Keep Home personal and move organisation-wide metrics to Operations.
4. Build full-page participant/search indexes once after participant data loads.
5. Extract `App.services` and the event bus into `Portal/App/Services.html` and `Portal/App/Core.html`.
6. Extract full-page navigation and route handling.
7. Extract full-page participant search/profile rendering.
8. Extract photos.
9. Extract calendar/rehearsals/attendance.
10. Extract operations/media/staff/settings.
11. Tighten CSS context selectors for both shells.
12. Add server-side permission checks to every protected write/read method as real management functions are introduced.

## Compatibility Requirements

Must preserve:

- `openSpecPortalHome()`
- `doGet()`
- `doGet(?app=central)`
- `doGet(?app=mobile)`
- `portalGetPortalData()`
- `portalGetSchoolsMasterData()`
- `portalGetSchoolProfile()`
- `portalGetStudentPhotos()`
- `portalGetCalendarData()`
- `portalGetAttendanceConfig()`
- `portalGetOperationsData()`
- `portalGetProjectManagementData()` compatibility route
- existing spreadsheet tabs and column semantics
- existing sidebar behaviour

## Risks

- Extracting large `window.App` blocks may introduce include-order bugs.
- Lazy participant loading can break global search if search does not await data.
- Moving Home away from organisation totals may surprise operations users, so Operations needs a clear entry point.
- Search index changes can affect result ranking if not carefully preserved.
- Photo URL changes can break Drive thumbnail display in Apps Script if not tested in deployment.
- Permissions must be enforced server-side before any management writes are added.

## Recommended Next Sprint

Build `Portal/App/Core.html`, `Portal/App/Services.html`, `Portal/App/Navigation.html`, and `Portal/App/Search.html` as active full-page script includes. Keep each move small: copy one cohesive block, include it before dependent code, run assembled-template checks, and only then remove the original block from `SpecCentral.html`.
