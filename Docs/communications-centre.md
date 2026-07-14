# SpecCentral Communications Centre — Milestone 1

## Purpose

Milestone 1 provides an integrated, safe vertical slice for email campaign drafting, dynamic audiences, templates, merge previews, mock test sends and auditable history. It does not send real email.

## Architecture

The module follows existing SpecCentral boundaries:

- `CommunicationService` is the application and command boundary. Every mutation checks a capability server-side, validates input, records actor/time and writes a sanitised audit entry.
- `CommunicationRepositoryService` uses the existing bounded `PlatformStoreService` adapter. The repository interface isolates storage so a larger production data store can replace it without changing the UI or command contract.
- `CommunicationAudienceService` resolves query definitions against `ParticipantService`, `StaffService`, canonical entity IDs and `RelationshipService`. It stores filters rather than only frozen addresses, normalises addresses case-insensitively and reports duplicates, invalid and missing addresses.
- `CommunicationMergeService` supports an allow-listed `{{Entity.Field}}` syntax. Merge values are HTML-escaped, unsafe elements/attributes are removed, unknown fields remain visible and are reported as unresolved, and no executable template code is evaluated.
- `CommunicationEmailProviderService` exposes the provider contract. `MOCK` is the only enabled provider. The Microsoft Graph adapter is deliberately fail-closed.
- Campaign, recipient and communication events use stable IDs, bounded persistence and existing `AuditService` conventions. General audit records contain hashes/counts rather than message bodies or full recipient lists.
- The browser module `SpecCentralCommunications.html` extends the existing `App` runtime and calls Apps Script gateways through `App.services.request()`.

## Capabilities

The module adds capability checks for view, create, own/all editing, templates, audiences, test send, production send, approval, scheduling, analytics, sender identity management and history. Page visibility never grants sending rights. The server checks every command independently, including while the browser UI is manipulated.

`Communications.SendTest` permits mock test records only. `Communications.Send` is reserved for a later provider milestone and does not enable real delivery in Milestone 1.

## Sender identities

- `SYSTEM-TEST`: available to authorised test senders and always uses the mock provider.
- Signed-in user mailbox: shown to authorised creators as preview-only until Graph is configured.
- `schoolsspectacular@det.nsw.edu.au`: shown only to users with `Communications.Send`; disabled until approved Graph configuration and Exchange Send As/Send on Behalf permission exist.

## Microsoft Graph readiness

Before SC-COMMS-002 can enable an approved shared-mailbox test, Department architecture/security must confirm:

1. Microsoft Entra application registration and tenancy.
2. Delegated or application permissions appropriate to the approved operating model.
3. Server-side user sign-in and token acquisition; tokens must never be sent to browser code.
4. Approved redirect URIs.
5. Certificate/secret storage outside source control, with rotation and access policy.
6. Tenant administrator consent.
7. Exchange Send As or Send on Behalf permissions for each approved shared mailbox.
8. Mailbox allow-listing and recipient/test restrictions.
9. Audit, retention, records-management and privacy decisions.
10. Provider webhook or polling design for delivery, bounce, reply, open and click events.

The current Graph adapter cannot silently fall back. Its configuration status is displayed in the UI and all Graph send methods throw a useful configuration error.

## Storage and data safety

Milestone 1 uses bounded Script Properties through the platform store. This is suitable for the first controlled milestone, drafts and small test history; it is not the final high-volume campaign store. Before real sending, migrate the repository adapter to an approved durable store with retention, concurrency, large recipient snapshots and operational reporting.

Recipient snapshots retain a deterministic hash and resolution counts at mock test time. The bounded recipient history stores the test recipient record. A production adapter must retain the complete immutable resolved-recipient snapshot for every queued campaign.

## Validation

Run `runCommunicationMilestoneTests()` from Apps Script for merge, escaping, sanitisation, audience resolution/deduplication, capabilities, draft/template/audience commands, mock test send, provider failure and history coverage. The normal SpecCentral static/browser route harnesses should also be run before deployment.

## Known limitations

- No external email is sent.
- Graph authentication and shared mailbox permissions are not configured.
- Attachments are metadata-only.
- Scheduling, approval execution, inbox synchronisation and delivery/open/click/bounce analytics are labelled future features.
- Script Properties are bounded and are not suitable for production-scale recipient snapshots.
- School email availability depends on fields present in the authoritative school dataset.

## Next ticket

**SC-COMMS-002 — Microsoft Graph authentication and approved shared-mailbox test sending**

Implement the Department-approved token flow, secure server-side configuration, Exchange permission validation and a restricted shared-mailbox test send without enabling bulk campaign delivery.
