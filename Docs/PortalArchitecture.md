# Spec Central Portal Architecture

## Full-page Spec Central Web App

Spec Central now has two web surfaces:

- The existing Google Sheets sidebar remains available through `openSpecPortalHome()` and continues to render `Portal.html`.
- The full-page web app is served through `doGet(e)` and renders `SpecCentral.html` by default.

The full-page app is intended to become the staff landing page for Schools Spectacular operations. It currently provides:

- Schools Spectacular / Spec Central branding.
- A persistent header, left sidebar, top bar, status ribbon, notifications area, and main page outlet.
- Dashboard, Participants, Calendar, Rehearsals, Attendance, Staff, Project Management, Media Timeline, and Settings route support.
- Permission-aware navigation for protected Project Management and Media Timeline routes.
- Announcements, upcoming rehearsal panels, recent activity, quick actions, and an operational dashboard hero.
- A Participants module that reuses the existing `portalGetPortalData()` API for participants, schools, groups, and photos.
- Staff context from `StaffService`, with fallback context when the Production Team spreadsheet is unavailable or unmatched.

### Application Shell

The full-page shell is assembled in `SpecCentral.html` from reusable Apps Script HTML includes:

- `Portal/Components/Header.html`
- `Portal/Components/Sidebar.html`
- `Portal/Components/TopBar.html`
- `Portal/Components/StatusRibbon.html`
- `Portal/Components/Notifications.html`
- `Portal/Pages/Dashboard.html`
- `Portal/Pages/Participants.html`
- `Portal/Pages/Calendar.html`
- `Portal/Pages/Attendance.html`
- `Portal/Pages/Rehearsals.html`
- `Portal/Pages/ProjectManagement.html`
- `Portal/Pages/MediaTimeline.html`
- `Portal/Pages/Staff.html`
- `Portal/Pages/Settings.html`

Page content is stored in inert `<template>` blocks and swapped into the main outlet without a page refresh. `Portal/App/Router.js`, `Portal/App/Navigation.js`, and `Portal/App/State.js` currently act as server-safe module boundaries. The live browser runtime is embedded in `SpecCentral.html` until the project has a client-side bundling or include strategy for JavaScript modules.

### Sidebar Module Boundaries

The spreadsheet sidebar remains served by `Portal.html`, but the file is now primarily the shell and shared field helpers. Sidebar behaviour is split into Apps Script HTML includes:

- `Portal/Pages/Dashboard.html`: dashboard storage, recent activity, and browse actions.
- `Portal/Pages/Profile.html`: participant, school, item, group, and teacher profiles.
- `Portal/Pages/Search.html`: startup, data loading, keyboard navigation, search, result rendering, and generic utility functions.

This keeps the sidebar behaviour unchanged while reducing `Portal.html` size and giving future contributors clearer ownership boundaries.

### Routing

- `doGet()` or `?app=central` opens the full-page Spec Central app.
- `?app=mobile` opens the legacy mobile participant search app.
- `openSpecPortalHome()` is unchanged and still opens the sidebar.
- In the full-page app, sidebar buttons call `App.navigate("dashboard")`, `App.navigate("participants")`, `App.navigate("attendance")`, and the other module routes.
- The baseline visible module set is Dashboard, Participants, Calendar, Rehearsals, Attendance, Staff, and Settings.
- Project Management and Media Timeline are hidden unless the signed-in user has `projectManagement.view` or `mediaTimeline.view`.
- Measurements, Costumes, and Reports remain future modules and are not shown in this navigation pass.

### Placeholder Services

The current platform shell uses safe placeholder services so the dashboard can be designed before real module spreadsheets are connected:

- `TimelineService`: calendar/rehearsal event contract backed by `RehearsalService`, with labelled fallback data if Timeline cannot load.
- `StaffService`: active-user email, role, department, permissions, visible modules, and fallback context.
- `AnnouncementService`: mock operational announcements.
- `NotificationService`: mock per-user notifications.
- `ProjectManagementService`: protected placeholder task model.
- `MediaTimelineService`: protected placeholder media planning model.

These services are intentionally read-only and do not alter existing participant, attendance, acceptance, or dance workbook APIs.

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
