# SC-HARDEN-001 Production Hardening

## Secure headshots

Participant and Staff APIs expose only `hasPhoto`; Drive IDs and source URLs remain server-side. Visible avatars request an entity type, canonical entity ID and display size from `SecureImageService`. The service re-resolves the entity, applies the signed-in user's participant or Staff permissions and scope, fetches the image using the deployment identity, validates MIME type and size, and returns a data URL. Browser code never submits an arbitrary Drive ID.

Images render as initials first, resolve lazily in bounded batches and use a permission-scoped user cache. Supported source forms include raw Drive IDs, `open?id=`, `/file/d/`, `/d/` and HTTPS images. Source sharing settings are never changed.

## Permission correction

Operational Timeline events require `Calendar.Operational.View`. `Calendar.View` continues to grant rehearsal visibility. Server Timeline reads enforce this before Calendar, Event Manager, search, relationship and project projections are built. Participant, group and event scope filtering no longer treats `Operations.View` as production-wide access.

## Production exceptions and health

Operations includes a read-only exception register derived from Timeline, Participants, Staff and Attendance. Administration health adds Staff, Production Overview, Attendance API and headshot delivery checks. Attendance failures use a short controlled backoff and do not block Timeline or Event Manager reads.

## Stable Event ID migration plan

This release runs and exposes dry-run diagnostics only. Before a future write-enabled migration:

1. Resolve duplicate and malformed IDs reported by the dry run.
2. Create a timestamped Timeline workbook backup.
3. Verify the proposed `EVT-` identifiers and row counts.
4. Temporarily enable the migration property and apply through the guarded administrative function.
5. Re-run the dry run, verify Attendance links, Event Manager routes and saved links.
6. Disable the migration property immediately.
7. Roll back by restoring only the Event ID column from the backup and invalidating Timeline caches.

No stable IDs, spreadsheet rows or Drive sharing permissions are modified by SC-HARDEN-001 validation.
