# Spec Central Permissions Model

## Owner
Staff Production Team is the source of truth for staff, roles, departments, permissions, event allocations, and future portal user management.

## Current Service
`Services/StaffService.js` exposes:
- `getCurrentUser()`
- `getPermissions(email)`
- `hasPermission(email, permission)`
- `getRole(email)`
- `getDepartment(email)`
- `getAllocatedEvents(email)`
- `getUserDashboardContext(email)`

## Current Fallback
Unknown users receive only basic view permissions:
- `dashboard.view`
- `participants.view`
- `calendar.view`
- `rehearsals.view`
- `attendance.view`

Unknown users are not silently granted Operations, Media Timeline, Settings, or admin permissions.

## Module Permissions
- Calendar: `calendar.view`
- Operations: `operations.view`
- Media Timeline: `mediaTimeline.view`
- Settings: `settings.view`

## Operations Permissions
- `operations.view`
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

`projectManagement.view` is treated as a compatibility permission and expands to `operations.view`. New permission data should use the `operations.*` namespace.

## Enforcement
Protected navigation is hidden on the client, and backend service wrappers also require permissions. Hiding UI is not treated as security.
