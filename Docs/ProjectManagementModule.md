# Project Management Section

## Purpose
Project Management tracks production workstreams, milestones, owners, dependencies, due dates, and risk. It now lives as a section inside the protected Operations module rather than as a top-level staff-facing module.

## Current Implementation
- Page: `Portal/Pages/Operations.html`
- Service: `ProjectManagementService`
- Backend wrapper: `portalGetOperationsData()`
- Compatibility backend wrapper: `portalGetProjectManagementData()`
- Permission: `operations.view`

## Views
- Board
- Table
- Milestones
- My Tasks
- Overdue / At Risk

## Current Data
The module currently uses clearly labelled placeholder data. No production sheet has been created or modified.

## Future Source
A future source should include:
- Task
- Workstream
- Owner
- Department
- Status
- Priority
- Start date
- Due date
- Related event
- Dependencies
- Notes
- Last updated

## Permissions
Future actions should use:
- `operations.projects.view`
- `operations.projects.manage`
- `operations.view`

`projectManagement.view` remains a compatibility permission and expands to `operations.view`.
