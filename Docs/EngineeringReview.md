# Spec Central Participants Engineering Review

## Scope

This review covers the Participants / Spec Central Apps Script project with a focus on preservation: maintainability, startup speed, search responsiveness, and long-term quality without changing visible behaviour or public APIs.

## Current Strengths

- The sidebar now loads participant data before doing expensive photo work.
- `ProfilePhotoService` uses chunked `CacheService` entries for the Drive headshot map.
- Profile and dashboard sidebar code have already been extracted from `Portal.html`.
- Full-page Spec Central shell is separated from the spreadsheet sidebar entry point.
- Existing Apps Script APIs such as `portalGetPortalData()`, `openSpecPortalHome()`, and `portalGetStudentPhotos()` are stable.
- Search uses prebuilt participant indexes after startup rather than scanning raw objects directly on every keypress.

## Technical Debt Found

- `Portal.html` had too many responsibilities: DOM constants, state, data loading, keyboard navigation, search, rendering, and utility helpers.
- Search rebuilt item aggregation on every query even though item data only changes when portal data reloads.
- Sidebar modules still share global variables because Apps Script HTML includes are not bundled modules.
- `SpecCentral.html` duplicates some participant search/profile logic from the sidebar.
- `ParticipantService.js` still contains a large commented legacy search implementation.
- Full migration to `Portal/App/State.js` is blocked until the sidebar has a client-side module/include strategy.

## Changes Made

- Extracted sidebar startup, data loading, keyboard navigation, search, result rendering, and generic utilities into `Portal/Pages/Search.html`.
- Reduced `Portal.html` from 801 lines to 291 lines.
- Added `itemSearchRecords`, built once in `buildPortalIndexes()`, so item search does not rebuild maps on every keystroke.
- Split search into smaller functions:
  - `getSchoolSearchResults`
  - `getItemSearchResults`
  - `getGroupSearchResults`
  - `getParticipantSearchResults`
  - `participantMatchesQuery`
  - `getParticipantSearchScore`
  - result-card render helpers

## Performance Wins

- Search no longer rebuilds item maps for every keypress.
- Item search text, school counts, and participant counts are precomputed after data load.
- Portal data, photos, and indexes are still loaded once per sidebar open.
- Background photo loading remains separate from participant data loading.

## App State Review

`Portal/App.js` is currently meaningful for the full-page platform boundary, but the sidebar does not include it as browser code. The sidebar still uses globals because `Portal/Pages/Profile.html`, `Portal/Pages/Dashboard.html`, and `Portal/Pages/Search.html` share state through Apps Script HTML includes.

Moving those globals into a single `App.state` object should be done in a later dedicated pass so every sidebar module can be updated together and tested as a unit.

## Remaining Technical Debt

- Consolidate duplicate helper functions between sidebar and full-page app.
- Retire or archive commented legacy blocks in `ParticipantService.js` after confirming no operational reference remains.
- Move sidebar state into a proper client-side `App` namespace.
- Add a lightweight test harness for client search result ordering.
- Add explicit photo-cache refresh menu/action documentation.

## Future Recommendations

- Introduce `Portal/State.html` or a client-side bundled module before moving globals.
- Extract shared search helpers into one browser include used by both sidebar and full-page app.
- Keep Apps Script public function names stable and wrap new services behind server-side adapters.
- Add timing logs around `portalGetPortalData()` and `portalGetStudentPhotos()` for real-world startup measurement.

## Platform Integration Sprint Notes

This pass adds a safer platform layer without changing the existing sidebar or public Apps Script gateway names.

Architecture improvements:

- Added `DashboardService.getContext()` as the owner of full-page dashboard startup data.
- Kept `portalGetSpecCentralConfig()` as the compatibility wrapper.
- Expanded full-page `App.state` to hold current module, selected records, permissions, service load status, search history, recently viewed records, and navigation history.
- Added `App.events` for lightweight cross-module events.
- Added `App.services.request()` to standardise `google.script.run` success/failure/timeout handling.
- Added explicit `App.registerService()` / `App.getService()` service registry APIs.
- Added explicit `App.SearchRegistry` facade for provider-based search.
- Expanded the status ribbon to Participants, Timeline, Attendance, Staff, Announcements, Project Management, and Media.
- Added a shared Timeline event contract with attendance metadata placeholders.
- Added a universal search provider registry for participants, schools, groups, items, teachers, staff, and timeline records.
- Added additive `ProfilePhotoService` wrappers for participant/teacher photo lookup, prefetching, and cache clearing.
- Added `Docs/PlatformIntegration.md` with service, event, search, state, cache, and Timeline contracts.

Preserved behaviour:

- `openSpecPortalHome()` and the spreadsheet sidebar remain unchanged.
- Existing portal APIs remain callable with the same names.
- Participant search still uses `getParticipantResults()` and the same rendered result card path.
- Protected modules still use server-side permission checks in their services.

Next engineering sprint:

- Share one search/index implementation between the sidebar and full-page app.
- Cache item and teacher aggregates after portal data load.
- Move full-page runtime into client HTML includes once the Apps Script include strategy is settled.
- Add a small browser test harness for route changes, provider ordering, and profile opening.
