# Media Timeline Module

## Purpose
Media Timeline will support campaigns and communications planning across social, website, email, school communications, media releases, collateral, and announcements.

## Current Implementation
- Page: `Portal/Pages/MediaTimeline.html`
- Service: `MediaTimelineService`
- Backend wrapper: `portalGetMediaTimelineData()`
- Permission: `mediaTimeline.view`

## Views
- Gantt
- Calendar
- Campaigns
- My Media Tasks

## Current Data
The module currently uses clearly labelled placeholder data. No media production sheet has been created or modified.

## Future Source Fields
- Campaign
- Activity
- Channel
- Audience
- Owner
- Department
- Start date
- Publish date
- End date
- Status
- Priority
- Related event
- Related item/group
- Asset link
- Copy link
- Approval status
- Notes

## Permissions
Future actions should use:
- `mediaTimeline.view`
- `mediaTimeline.edit`
- `mediaTimeline.approve`
- `mediaTimeline.admin`
