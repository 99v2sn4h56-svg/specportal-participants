# Operations Centre

## Purpose

Operations is the permission-protected management area inside Spec Central. It is not the general staff Home page.

Operations is for authorised administrators who need to manage events, imports, users, permissions, integrations, diagnostics and production workflow.

## Sections

1. Overview
   - organisation-wide alerts
   - deadlines
   - integration health
   - unmatched records
   - attendance alerts
   - major milestones

2. Events
   - Timeline event management
   - dates, times, venues and sessions
   - item/group connections
   - Attendance event links
   - staff allocation review

3. Users And Permissions
   - users
   - roles
   - departments
   - module visibility
   - event-specific access
   - unknown users

4. Project Management
   - board
   - table
   - milestones
   - workstreams
   - owners
   - dependencies

5. Data Management
   - Import Centre
   - acceptance sync
   - participant and group reconciliation
   - duplicates
   - unmatched values
   - cache refresh
   - import history

6. Announcements
   - authoring
   - audience targeting
   - role/department filters
   - publish and expiry dates
   - priority and pinned state

7. Integrations
   - Participants
   - Timeline
   - Attendance
   - Staff Production Team
   - spreadsheet IDs
   - deployment URLs
   - refresh controls

8. Diagnostics And Audit
   - sync errors
   - unmatched events
   - permission changes
   - performance timings
   - cache state
   - deployment diagnostics

## Permissions

Operations requires `operations.view`. More granular permissions should control sections and actions:

- `operations.overview.view`
- `operations.events.manage`
- `operations.users.manage`
- `operations.permissions.manage`
- `operations.projects.view`
- `operations.projects.manage`
- `operations.data.manage`
- `operations.announcements.manage`
- `operations.integrations.manage`
- `operations.diagnostics.view`

Navigation hiding is not security. Backend methods must check permissions before returning protected data or making changes.
