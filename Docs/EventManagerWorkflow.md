# Connected Event Manager workflow

## Architecture decision

The authoritative production calendar remains `TimelineService` and the Operation Schedule. Event Manager does not create a second calendar or copy Timeline rows.

`EventWorkflowService` adds a managed planning overlay for data the Timeline cannot represent:

- lifecycle and readiness
- repeated schedules and venue links
- stable participant, staff, school-group, item and category relationships
- logistics
- risk drafting, review and approval
- versioned permission forms and participant requests
- school-level notification drafts
- Attendance session preparation
- version history and audit activity

Each managed event can carry `timelineEventId`. `EventManagerService` merges the lightweight managed projection into the matching Timeline card. A managed event without a Timeline link remains visible as a managed workflow record and can later be linked; it does not write to the Timeline.

## Storage

The existing `PlatformStoreService` now exposes chunked `listLarge`, `putLarge`, `updateLarge` and `removeLarge` operations. These retain the existing lock, sanitisation and Script Properties architecture while allowing bounded relationship collections to exceed a single property.

Collections:

| Collection | Purpose |
| --- | --- |
| `event_workflows` | Current managed event aggregate |
| `event_workflow_versions` | Immutable, sanitised event snapshots |
| `event_permission_requests` | Event/form/version/participant request status |
| `event_school_notifications` | Review-only school notification batches |
| `audit` | Existing shared audit trail |

Stable IDs are the relationship authority. Names, school names and venue names are display snapshots only.

## Lifecycle and validation

Supported lifecycle states are Draft, Active, Completed, Cancelled and Archived. Cancelling preserves the event and its history. Archiving is only allowed after completion or cancellation.

Activation requires:

- name and event type
- stable lead Staff ID
- at least one schedule
- valid ISO date, start and finish times
- finish after start
- venue reference/name or an online URL

Roster gaps are warnings rather than draft-save blockers, allowing coordinators to build the event progressively.

Material edits to schedule, venue, logistics or participation after approval/generation mark permission and prepared notification data `Outdated`, return approved risk to review, and invalidate prepared Attendance when its schedule changed. Existing requests and responses remain attributable to their original version.

## Connected modules

### Forms

Permission generation calls the existing `FormResponseService.saveDefinition()` boundary. It creates a Forms draft with event/version identity and participant permission, changed health/support detail, departure and meal/temporary-leave questions. It does not silently publish.

On submission, Forms calls `EventWorkflowService.recordPermissionResponse()`. Linking requires both the unique permission-request reference and the stable Participant ID for the current event/form version; a display name cannot advance a request. A changed health/support indication creates a high-priority review task without copying sensitive response content into Event Manager. The restricted Forms response remains the canonical submitted content.

### Communications

School preparation groups selected participants by stable School ID and creates one reviewable notification record per school. No external email is sent. This respects the existing Communications provider state, which is still mock/preview-only for this workflow.

### Attendance

Attendance preparation creates one schedule-linked draft with stable Participant IDs. It deliberately does not write to an Attendance workbook because no approved create-session command currently exists in `AttendanceService`.

### Dashboard

`DashboardService` loads only a small upcoming-event projection: event identity, schedule summary, lifecycle status, readiness, next action and warning count. It does not load rosters, permission requests, risk detail, responses or Attendance participant rows.

## Capabilities

- `Events.View`
- `Events.Create`
- `Events.Edit`
- `Events.Activate`
- `Events.Cancel`
- `Events.ManageRoster`
- `Events.ManageRisk`
- `Events.ApproveRisk`
- `Events.GeneratePermissions`
- `Events.ViewPermissions`
- `Events.ViewMedicalResponses`
- `Events.ManageCommunications`
- `Events.SendCommunications`
- `Events.PrepareAttendance`
- `Events.RecordAttendance`
- `Events.Archive`
- `Events.ViewAudit`

Risk approval is prevented when the approver is the same authenticated user who last edited/submitted the assessment.

## Phase status

### Phase 1 — foundation implemented; canonical pickers remain partial

- managed event creation and draft save
- multi-session schedules and venue/online location support
- stable-ID rosters
- lifecycle, validation, cancellation and archive rules
- version history, material-change detection and audit records
- Event Manager wizard and merged Timeline/managed landing view
- event purpose, parent-facing description, deadlines and emergency contact
- rehearsals/related sessions, multiple venues, travel legs, meals, costs, dress and equipment
- school groups with stable School and contact-Teacher IDs

The current editor accepts explicit canonical IDs. Search-and-select pickers backed by the Participant, Staff, School and venue directories are not implemented, so Phase 1 is not considered complete UX.

### Phase 2 — implemented foundation

- risk draft, review and separate approval
- deterministic risk-draft generation from schedule, venue, travel, meals, activity type and multi-day context
- versioned permission Forms draft
- stable per-participant permission requests
- response-to-request linking using the unique request reference plus stable Participant ID
- health/support review task creation
- parent-facing structured event summary in the existing public Forms renderer

The existing `AiExtensionService.CreateRiskAssessment` hook remains unconnected. The implemented generator is deterministic, clearly produces a draft, and still requires human editing, submission and separate approval.

### Phase 3 — preparation only

- stable school batching and notification drafts
- Attendance session drafts

External send and Attendance workbook writes remain intentionally disabled until their existing services expose approved, idempotent command adapters.

### Phase 4 — preparation and views only

- lightweight dashboard cards
- readiness and next-action states
- workflow/risk/permission/communications/Attendance views in the event workspace

Reminder automation and production document generation remain future work.

### Testing and reporting foundation

- dedicated regression test suite for lifecycle, stable relationships, risk separation, permission versioning, school batching, Attendance preparation, dashboard payload and capability rejection
- existing responsive drawer conventions reused

Full user-acceptance testing and accessibility testing must still be run in the Apps Script test deployment.

## Deliberate limitations and next recommendations

1. Add approved command adapters to `CommunicationService` and `AttendanceService` before enabling real send/session creation. Commands should be idempotent and return durable external IDs.
2. Replace Script Properties chunk storage with a transactional datastore if event/permission volume grows materially. The service boundary is already isolated for that migration.
3. Add a stable venue-directory picker and participant/group search picker; the first UI uses explicit stable-ID rows so it cannot silently fall back to name matching.
4. Add reminder schedules only after permission due-date, notification opt-out and job idempotency rules are agreed.
5. Add a generated risk suggestion adapter only after its safety, privacy and mandatory-human-approval contract is reviewed.
6. Add document generation from approved event versions, never from an unsaved editor draft.

No production deployment is part of this implementation.

## Existing service map

- Dashboard: `DashboardService` and `Portal/Pages/Dashboard.html`; bootstrap is deliberately lightweight.
- Events/calendar: `TimelineService` reads the authoritative Operation Schedule; `EventManagerService` already provided a read-only operational workspace.
- Participants and schools: `ParticipantService`, `ParticipantProjectionService` and `RelationshipService` own canonical participant/school projections and stable entity relationships.
- Staff: `StaffService`, `StaffDirectoryService` and `StaffAccessService` own Staff identity and scope.
- Forms: `FormResponseService` owns definition, publishing, public rendering, response storage and profile association.
- Attendance: `AttendanceService` reads the separate Attendance web app/API but has no approved create-session command.
- Communications: `CommunicationService` owns campaigns, audiences, previews and test-send boundaries; no event school-batch send adapter exists.
- Risk: no existing event-specific risk persistence or approval service existed; the managed workflow therefore owns event risk versions while requiring human review.
- Access and audit: `AuthorizationService`, `UserContextService` and `AuditService` provide capability, scope and audit boundaries.

## Relationship model

```text
Timeline event (optional authoritative calendar link)
  └─ Managed event (canonical planning aggregate + version)
      ├─ Schedule entries / venues / logistics
      ├─ Event roster
      │   ├─ Participant IDs ──> canonical Participants
      │   ├─ Staff IDs ────────> canonical Staff
      │   └─ School/group IDs ─> canonical Schools and Groups
      ├─ Risk assessment versions
      ├─ Permission form version ──> existing Forms definition
      │   └─ Permission request per Participant ID
      ├─ School notification draft per stable School ID
      └─ Attendance session drafts per enabled Schedule ID
```

The event roster is the shared relationship source. Permission requests, school batches and Attendance drafts reference it; none owns a separate name-matched roster.

## Configuration

No new spreadsheet, folder, mailbox, form-template or deployment ID is hard-coded.

Before later phases can be enabled, an administrator must provide or approve:

- an idempotent Attendance create/update-session command and target deployment;
- an authorised Communications event-batch adapter and sender/shared-mailbox identity;
- a canonical venue-directory source if venue IDs will be selected rather than entered;
- parent/guardian delivery rules and unique-request link generation;
- any risk PDF template and destination folder;
- retention limits or a datastore migration threshold for chunked Script Properties.

## Manual validation in a test deployment

1. Open Operations, choose Events, and select **New event**.
2. Save a draft with an event name, type, stable operational-lead Staff ID and at least one schedule.
3. Confirm the draft appears under Upcoming Events on the Dashboard.
4. In Participation, add canonical Participant IDs, Staff IDs, and a school group with stable School and contact-Teacher IDs; save the roster.
5. Add logistics, rehearsals/related sessions, travel legs and meals, then activate the event after the review page has no blockers.
6. In Risk, save a draft and submit it for review. Sign in as a different authorised approver to approve it.
7. In Permissions, generate the Forms draft. Publish only from the existing Forms module after reviewing the public event summary and questions.
8. Submit a test response using the exact permission-request reference and Participant ID. Confirm the request status changes and any health-change declaration creates a restricted review task.
9. In Communications, prepare school notifications. Confirm one draft exists per stable School ID and that no email was sent.
10. In Attendance, prepare sessions. Confirm only schedule entries with Attendance enabled are included and that no Attendance workbook was changed.
11. Return to the event workspace and verify readiness, permission counts, risk state, school draft count, Attendance draft count and audit history.

## Test and deployment guidance

Run `runEventWorkflowTests()` in the Apps Script editor or a non-production test deployment. Also run the existing `runPerformancePackageTests()` regression suite and perform responsive/public-form checks in the browser.

Suggested deployment sequence, when explicitly authorised later:

1. Create an Apps Script version from the reviewed commit.
2. Deploy a test web-app version and complete the manual validation above with non-production data.
3. Record the previous production deployment/version ID.
4. Update production only after access, Forms, school-email and Attendance owners approve their boundaries.
5. Roll back by pointing the deployment to the recorded previous version. Event records are append/version preserving; do not delete them during rollback.
