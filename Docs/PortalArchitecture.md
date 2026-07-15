# Spec Central Portal Architecture

## Spec Central And Operations

Spec Central is the general staff-facing Schools Spectacular portal. It should help staff find information, search participants/schools/items/groups/teachers, view relevant rehearsals and calendar events, open attendance, read announcements, and see their own role and allocations.

Organisation-wide management now belongs in the protected Operations module. Operations is hidden unless the current staff context includes `operations.view`, and protected backend calls must also validate that permission before returning data. The old `projectManagement` route is retained only as a compatibility alias that redirects to Operations.

## Full-page Spec Central Web App

Spec Central now has two web surfaces:

- The existing Google Sheets sidebar remains available through `openSpecPortalHome()` and continues to render `Portal.html`.
- The full-page web app is served through `doGet(e)` and renders `SpecCentral.html` by default.

The full-page app is intended to become the staff landing page for Schools Spectacular operations. It currently provides:

- Schools Spectacular / Spec Central branding.
- A persistent full-page header, left sidebar, top bar, dashboard-only status ribbon, notifications area, and main page outlet.
- Home, Participants, Calendar, Rehearsals, Attendance, Staff, Operations, Media Timeline, and Settings route support.
- Permission-aware navigation for protected Operations, Media Timeline, and Settings routes.
- Announcements, upcoming rehearsal panels, recent activity, quick actions, and an operational dashboard hero.
- A Participants module that reuses the existing `portalGetPortalData()` API for participants, schools, groups, and photos.
- Staff context from `StaffService`, with fallback context when the Production Team spreadsheet is unavailable or unmatched.

### Application Shell

The full-page shell is assembled in `SpecCentral.html` from reusable Apps Script HTML includes:

- `Portal/Components/FullPageHeader.html`
- `Portal/Components/Sidebar.html`
- `Portal/Components/TopBar.html`
- `Portal/Components/StatusRibbon.html`
- `Portal/Components/Notifications.html`
- `Portal/Pages/Dashboard.html`
- `Portal/Pages/Participants.html`
- `Portal/Pages/Calendar.html`
- `Portal/Pages/Attendance.html`
- `Portal/Pages/Rehearsals.html`
- `Portal/Pages/Operations.html`
- `Portal/Pages/MediaTimeline.html`
- `Portal/Pages/Staff.html`
- `Portal/Pages/Settings.html`

Page content is stored in inert `<template>` blocks and swapped into the main outlet without a page refresh. `Portal/App/Router.js`, `Portal/App/Navigation.js`, and `Portal/App/State.js` currently act as server-safe module boundaries. The live browser runtime is embedded in `SpecCentral.html` until the project has a client-side bundling or include strategy for JavaScript modules.

### Sidebar Module Boundaries

The spreadsheet sidebar remains served by `Portal.html`, but it is a separate presentation shell from the full-page app. It must not include full-page layout components such as `FullPageHeader`, `Sidebar`, `TopBar`, `StatusRibbon`, or the full `App` controller.

Sidebar layout uses:

- `Portal/Components/SidebarHeader.html`: compact Schools Spectacular / Spec Central Participant Search header.
- `Portal/Styles/Portal.html`: sidebar-specific CSS, including `scSidebar*` header classes.

Sidebar behaviour is split into Apps Script HTML includes:

- `Portal/Pages/Dashboard.html`: dashboard storage, recent activity, and browse actions.
- `Portal/Pages/Profile.html`: participant, school, item, group, and teacher profiles.
- `Portal/Pages/Search.html`: startup, data loading, keyboard navigation, search, result rendering, and generic utility functions.

This keeps the sidebar behaviour unchanged while reducing `Portal.html` size and giving future contributors clearer ownership boundaries.

### Routing

- `doGet()` or `?app=central` opens the full-page Spec Central app.
- `?app=mobile` opens the legacy mobile participant search app.
- `openSpecPortalHome()` is unchanged and still opens the sidebar.
- In the full-page app, sidebar buttons call `App.navigate("dashboard")`, `App.navigate("participants")`, `App.navigate("attendance")`, and the other module routes.
- The baseline visible module set is Home, Participants, Calendar, Rehearsals, Attendance, and Staff.
- Operations is hidden unless the signed-in user has `operations.view`.
- Media Timeline is hidden unless the signed-in user has `mediaTimeline.view`.
- Settings is hidden unless the signed-in user has `settings.view`.
- `App.navigate("projectManagement")` redirects to `App.navigate("operations")` for old links.
- Measurements, Costumes, and Reports remain future modules and are not shown in this navigation pass.

### Placeholder Services

The current platform shell uses safe placeholder services so the dashboard can be designed before real module spreadsheets are connected:

- `DashboardService`: full-page app startup context for staff, timeline status, announcements, notifications, attendance URL, and service health. `portalGetSpecCentralConfig()` remains the public wrapper.
- `TimelineService`: calendar/rehearsal event contract backed by `RehearsalService`, with labelled fallback data if Timeline cannot load.
- `StaffService`: active-user email, role, department, permissions, visible modules, and fallback context.
- `AnnouncementService`: mock operational announcements.
- `NotificationService`: mock per-user notifications.
- `ProjectManagementService`: protected Operations placeholder task model; public compatibility wrappers remain.
- `MediaTimelineService`: protected placeholder media planning model.

These services are intentionally read-only and do not alter existing participant, attendance, acceptance, or dance workbook APIs.

### Shared Client Runtime

The full-page app now has a lightweight shared runtime inside `SpecCentral.html`:

- `App.state` owns current module, selected records, permissions, loading flags, loaded service flags, local cache timestamps, search history, recently viewed records, and navigation history.
- `App.events` is a small event bus for cross-module events such as `participant:selected`, `school:selected`, `event:selected`, `service:loaded`, and `service:error`.
- `App.services.request()` wraps `google.script.run` calls with success handlers, failure handlers, timeout handling, simple in-memory caching, service status updates, and event emission.
- Public gateway functions remain compatible. The wrapper calls functions such as `portalGetSpecCentralConfig()`, `portalGetPortalData()`, `portalGetCalendarData()`, `portalGetOperationsData()`, the compatibility `portalGetProjectManagementData()`, and `portalGetMediaTimelineData()`.

This is intentionally not a bundler or framework. It gives the platform a single coordination layer while preserving Apps Script compatibility.

The detailed service, event, search, state, and cache contracts are documented in `Docs/PlatformIntegration.md`.

### Startup Loading Policy

The full-page app should not load every module at startup. Initial load is limited to the shell and staff/config context. Participant data is loaded lazily when the user opens Participants, uses global participant search, browses schools/items, or opens a participant-related profile. Calendar/Rehearsals load Timeline data when their modules open. Operations and Media Timeline are permission-controlled and lazy-loaded.

The compact spreadsheet sidebar is intentionally different: it is a dedicated participant-search tool, so it still loads participant portal data when opened.

### Full-Page Shell Modules

`SpecCentral.html` is now the full-page web app shell only. It owns the Apps Script template include order for the header, sidebar, top bar, notifications, page templates, `Portal/Styles/SpecCentral.html`, and the full-page app runtime modules.

Runtime include order:

1. `Portal/App/SpecCentralApp.html` defines `window.App`, state, routing, service loading, dashboard, calendar, attendance, operations, staff, and notifications.
2. `Portal/App/SpecCentralUtilities.html` attaches shared formatting, field-mapping, localStorage, phone, photo, and escaping helpers.
3. `Portal/App/SpecCentralProfiles.html` attaches participant, school, group, item, and teacher profile rendering.
4. `Portal/App/SpecCentralSearch.html` attaches participant/universal search providers, result cards, and result-opening behaviour.
5. `Portal/App/SpecCentralBootstrap.html` calls `App.init()`.

The compact spreadsheet sidebar remains in `Portal.html` and should not import full-page shell modules unless a future migration explicitly merges the two experiences.

### Universal Search Providers

Full-page search now runs through a provider registry:

```
Global search
  -> App.runUniversalSearch()
      -> participants provider
      -> schools provider
      -> groups provider
      -> items provider
      -> teachers provider
      -> staff provider
      -> timeline provider
```

Each provider returns a common result shape with `resultType`, `title`, `meta`, `score`, and an optional source object. `getParticipantResults()` remains as a compatibility method for the Participants page.

### System Status

The status ribbon now reads from central application/system state rather than four independent hardcoded labels. It appears on Home/Dashboard only and reports Participants, Timeline, Attendance, Staff, Announcements, Operations, and Media status, including last refresh timestamps where the client has them.

### Future Modules

The full-page app is designed to host modules without forcing them into the sidebar layout:

- Participants: richer search/profile workflow migrated from the sidebar over time.
- Attendance: link to the standalone Attendance web app first, then integrate summaries later.
- Rehearsals: schedule and key date views from `RehearsalService`.
- Measurements and Costumes: workflow dashboards for existing generated sheet processes.
- Media: photo/headshot and asset management.
- Reports: operational exports and summaries.
- Settings: app configuration and staff permissions.

### Permission Model

`getCurrentStaffContext()` currently returns the active user's email from `Session.getActiveUser().getEmail()`.

Future permission work should sync staff roles and module access from the Production Team spreadsheet. The likely model is:

- Production Team spreadsheet remains the source of truth.
- Staff email maps to role, department/team, and allowed modules.
- Spec Central module cards and data access are filtered from that context.
- Write actions such as attendance updates, reports, and settings changes require explicit server-side permission checks.

### Announcements And Key Dates

The landing page includes placeholder announcement and key date panels. These should later be backed by a small service, likely reading from:

- a Production Team/operations spreadsheet tab,
- the rehearsal schedule,
- or a dedicated Spec Central settings sheet.

Personalised "Key dates for me" should be generated after staff permissions and team assignments are connected.
