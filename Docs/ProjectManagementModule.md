# Project Management Module

## Purpose
Project Management will track production workstreams, milestones, owners, dependencies, due dates, and risk.

## Current Implementation
- Page: `Portal/Pages/ProjectManagement.html`
- Service: `ProjectManagementService`
- Backend wrapper: `portalGetProjectManagementData()`
- Permission: `projectManagement.view`

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
- `projectManagement.view`
- `projectManagement.edit`
- `projectManagement.assign`
- `projectManagement.admin`
