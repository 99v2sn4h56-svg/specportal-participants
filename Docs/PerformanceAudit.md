# Spec Central Performance Audit

## Executive Summary

This audit covers the Participants / Spec Central project and the separate AttendanceSource app. Both apps are functional, but their main performance risks are server-side Apps Script costs rather than visual rendering alone.

The highest-risk paths are whole-sheet reads, repeated full attendance refreshes, Drive folder scans for photos, and profile/history functions that walk many event sheets. The current client apps are mostly safe because the main portal search and Attendance startup already use one startup data call and failure handlers. The safest immediate improvements are client-side render throttling and defensive guards.

## Top Performance Risks

1. Attendance `getSessionAttendance(sheetName)` reads the full selected event sheet every refresh interval.
2. Attendance `getAttendanceHistoryForStudent(studentKey)` scans every event sheet listed in Event Index.
3. Attendance `refreshAttendanceDashboard()` scans every event sheet and every row inside each sheet.
4. Participants `ParticipantService.getPortalData()` loads participants, groups, schools, and photos in one call; photo loading can be expensive.
5. `ProfilePhotoService.getStudentPhotos()` scans the whole Drive headshot folder and has no cache.
6. Attendance `syncStudentHeadshots()` scans Drive files and participant rows; this is correct as a manual sync task but should not be moved into startup.
7. Attendance event sync reads timeline and participants workbooks and rewrites event sheets; it should remain a deliberate menu action.
8. SpecCentral full-page app duplicates some search/profile logic from the sidebar, increasing maintenance cost.
9. Several profile pages render full school/item/teacher participant lists into HTML at once.
10. Apps Script logging is useful during repair but can become noisy in high-frequency refresh paths.

## Quick Wins

- Debounce search-driven renders in Attendance admin and student check-in.
- Keep all `google.script.run` calls paired with failure handlers.
- Avoid repeated DOM queries inside hot render loops.
- Cache per-client computed search strings only where the underlying fields do not change.
- Keep photo URL normalization client-side and avoid reloading photos on every render.
- Use a single startup payload for each app where possible.

## Medium-Risk Improvements

- Add `CacheService` to `ProfilePhotoService.getStudentPhotos()` with explicit manual cache clear after photo sync.
- Add a short-lived cache for Attendance sessions and dashboard messages.
- Add a targeted attendance history index instead of scanning all event sheets per passport open.
- Reduce Attendance refresh payload size by returning only changed rows or by increasing refresh interval for large rolls.
- Share common Spec Central participant helper functions between sidebar and full-page app.
- Convert some large profile renderers to paged or collapsed sections.

## Things Not To Touch Yet

- Attendance event creation from timeline/student groups.
- Attendance sheet schemas, header names, and trigger/menu function names.
- Check-in/check-out and attendance status update behavior.
- Spreadsheet tab names and matching fields.
- Costumes and measurements.
- Deployment entry points and backend API names.

## Recommended Caching Strategy

- Use `CacheService.getScriptCache()` for read-heavy, shared reference data such as photo maps and rehearsal lists.
- Keep cache TTLs short for operational data: 2-5 minutes for event/session metadata, 10-30 minutes for photo maps.
- Do not cache attendance status writes or live roll status without a clear invalidation plan.
- Add explicit cache clear helpers for manual sync flows.
- Key user-specific access cache by email and keep TTL very short if introduced.

## Recommended Photo / Headshot Strategy

- Keep Drive scanning out of web app startup.
- Continue storing resolved `Photo URL` and `Photo ID` in attendance sheets during sync.
- Cache the Participants photo map in `ProfilePhotoService`, then invalidate it when headshots are synced.
- Prefer stable student IDs/SRNs for photo matching where available; name-based matching should remain a fallback.
- Use Drive thumbnail URLs consistently for browser rendering.

## Recommended Spreadsheet Read / Write Strategy

- Read each sheet once per request, then work in memory.
- Prefer `getDisplayValues()` for UI-facing strings and `getValues()` only where typed dates/numbers are needed.
- Avoid `getDataRange()` on very wide or archival sheets when the active columns are known.
- Batch writes with `setValues()` whenever writing many rows.
- Keep per-row writes only for live attendance status updates, where the user expects immediate single-row persistence.

## Recommended Implementation Order

1. Keep low-risk client render throttling and failure handling in place.
2. Add photo map caching with a manual cache clear function.
3. Add short-lived caching for session metadata and dashboard messages.
4. Profile Attendance history scanning and design an indexed approach.
5. Reduce large profile render output with pagination/collapsed sections.
6. Consolidate duplicated participant helper logic after the web app shell stabilises.

## Current Safe Fix Scope

This pass applies only client-side render throttling and null guards. It does not change Apps Script backend APIs, triggers, spreadsheet structures, attendance rules, event sync, check-in/out behavior, or visual design.

## Spec Central Platform Sprint Notes

The full-page app now receives staff context, announcements, notifications, and placeholder rehearsal data from `portalGetSpecCentralConfig()`. This keeps dashboard startup lightweight and avoids adding extra `google.script.run` calls for mock platform widgets.

Current performance posture:

- Participants data still loads through the existing `portalGetPortalData()` payload.
- Dashboard widgets render from already-held client state where possible.
- Placeholder services do not read new spreadsheets yet.
- Global search continues to route through the Participants page and debounce participant search.

Deferred performance work:

- Consolidate duplicated participant search helpers between `Portal.html` and `SpecCentral.html`.
- Add cache invalidation for photo maps before relying on heavier dashboard headshot use.
- Replace mock Timeline data with cached real timeline reads.
- Avoid embedding the Attendance app iframe until a URL is explicitly configured.

2026-07-10 platform sprint additions:

- Calendar data is lazy-loaded through `portalGetCalendarData()` when Calendar/Rehearsals need the fuller event contract.
- Project Management and Media Timeline are lazy-loaded only when an authorised user opens those protected modules.
- The status ribbon uses data already returned by `portalGetSpecCentralConfig()` and `portalGetPortalData()` rather than polling.
- Protected modules enforce backend permission checks through their services, not only hidden navigation.

## Sidebar Startup Improvement

The sidebar no longer waits for a Drive scan before participants render. `ParticipantService.getPortalData()` now returns only cached photos, if available, and `Portal.html` loads the full photo map in a separate background call to `portalGetStudentPhotos()`.

`ProfilePhotoService` caches the Drive headshot map in chunked `CacheService` entries so the photo payload can exceed a single cache-entry size limit. A cold cache may still take time to populate photos, but participant search should be usable first.

## Sidebar Search Refactor

The remaining sidebar runtime was extracted from `Portal.html` into `Portal/Pages/Search.html`.

Performance impact:

- Item search records are built once after `portalGetPortalData()` returns.
- Item school counts, participant counts, and item search text are reused across keystrokes.
- The search function is split into smaller result builders, making future profiling and optimisation easier.

Behaviour preserved:

- Search result ordering remains school results, item results, group results, then participant results.
- Search debounce remains 220 ms.
- Keyboard navigation still uses Escape, Arrow Up/Down, and Enter.
- Profile, dashboard, recent search, and recently viewed flows still call the same public functions.
