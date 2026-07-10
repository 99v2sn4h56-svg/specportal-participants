# Spec Central Roadmap

## Current Stage

Spec Central is moving from a participant search sidebar into the master Schools Spectacular operations platform.

The existing Google Sheets sidebar remains available and intact. The full-page web app is now the preferred staff landing surface for new platform work.

## Completed

- Sidebar participant search and profile workflows remain operational.
- Full-page `SpecCentral.html` app shell exists.
- Persistent header, sidebar, top bar, notifications area, and page outlet are in place.
- Navigation now focuses on Dashboard, Participants, Rehearsals, Attendance, Staff, and Settings.
- Participants page uses existing portal data APIs.
- Dashboard displays live participant/school/group counts and placeholder platform data.
- Placeholder services exist for Timeline, Staff, Announcements, and Notifications.
- Import Centre supports guided acceptance uploads, column matching, category matching, and unmatched-row suggestions.
- Participant headshots and phone-number formatting are handled in the portal display layer.

## Next Sprint

- Replace mock `TimelineService` data with the real Timeline module source.
- Connect dashboard rehearsal widgets to real rehearsal/event data.
- Connect Staff module to the Production Team spreadsheet for roles and permissions.
- Add server-side permission checks for write actions.
- Add attendance summary widgets without changing attendance marking logic.
- Consolidate duplicated participant helper logic between sidebar and full-page app.

## Future Modules

- Timeline: rehearsals, venues, run sheets, and event scheduling.
- Attendance: dashboard summaries, action alerts, and links into live roll marking.
- Staff Production Team: permissions, roles, payroll, event allocation, and security.
- Notifications: targeted operational messages and overdue/action-required alerts.
- Reports: exports, integrity checks, and executive summaries.
- Measurements and Costumes: return after their workflows are ready to be integrated safely.

## Guiding Principles

- One platform, not separate Apps Script products.
- One source of truth for each data type.
- Keep existing deployments and APIs stable until a module is deliberately migrated.
- Prefer small, reversible frontend shell improvements over risky backend rewrites.
- Use mock services only as placeholders; document the owner before connecting real data.
