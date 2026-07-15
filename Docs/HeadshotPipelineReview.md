# SpecCentral headshot pipeline review

**Date:** 15 July 2026  
**Scope:** Current SpecCentral full-page app, Participant Search spreadsheet tool, student headshots, Staff profile pictures, Drive matching, caching and browser delivery.  
**Review type:** Read-only code investigation. No production data, Drive files or deployment settings were changed.

## Executive summary

SpecCentral currently has three different image paths rather than one complete headshot pipeline:

1. The current full-page SpecCentral app uses an authenticated server proxy. The browser requests a participant or Staff stable ID; the server finds the source reference, reads the private Drive image and returns a temporary `data:` URL.
2. Student records may fall back to a filename index built from one hard-coded Drive folder. Staff records do not have an equivalent filename-folder fallback.
3. Participant Search writes a direct Drive thumbnail URL into a Google Sheets `IMAGE()` formula. That bypasses the authenticated proxy and is inherently unreliable for private files across Safari, mobile and users without a suitable Drive session.

The most likely immediate cause of missing student photos in the participant list is a gating mismatch: `ParticipantProjectionService` sets `hasPhoto` only from record fields such as `Photo ID` and `Photo URL`, while the actual files are currently being found by student name in the Drive folder. The list UI refuses to create a secure image request when `hasPhoto` is false. The folder lookup therefore exists but is never reached for those list avatars.

Participant profile drawers are slightly different: they request the secure image without checking `hasPhoto`, so an exact folder-name match can still work there. If profile-drawer images also fail, the likely causes are a filename mismatch, duplicate/invalid file, Drive access failure by the deployment identity, a permission/stable-ID mismatch, or an image response that fails size/MIME limits.

For Staff, files merely stored in a Drive folder and named after the person are not sourced at all. Staff must currently have a valid reference in a recognised Staff spreadsheet column such as `Display Picture`, `Photo`, `Photo URL`, `Headshot`, `Head Shot` or `Profile Photo`.

## Investigation process

The review followed the data in both directions:

1. Searched the complete SpecCentral, Participants and Attendance code for photo fields, folder IDs, URL construction, `IMAGE()`, Drive blobs, secure image calls and caches.
2. Identified the canonical student and Staff data readers.
3. Traced list and detail projections to see which photo information survives caching.
4. Traced every current SpecCentral avatar renderer and its lazy-loading queue.
5. Followed the server request through permission checks, reference selection, Drive API fetching, MIME/size validation and the returned data URL.
6. Reviewed the separate Participant Search and Attendance matching paths.
7. Reviewed Apps Script execution configuration and the currently versioned deployment.
8. Attempted to run the live photo diagnostic through `clasp`; the project is not deployed as an Apps Script Execution API executable, so that function cannot be invoked from the CLI. Runtime counts and individual error categories therefore still need to be captured from an authorised browser or a temporary administrator diagnostic.

The currently listed primary web deployment is version 87 (`Restore Participant Search headshots`). The local working tree also contains substantial uncommitted performance/projection changes, so an advisor should verify that the exact files under review match the version currently serving users before applying a patch.

## Student headshot pipeline

### 1. Canonical participant source

`ParticipantService.getAll()` reads `INDIVIDUALS(YES)` and detects several aliases for `Photo ID` and `Photo URL` (`ParticipantService.js`, approximately lines 91–208).

Each canonical participant receives:

- `photoId`
- `photoUrl`
- a stable `studentKey`

If the two photo columns are blank, the canonical record contains no explicit photo indication even when a correctly named file exists in Drive.

### 2. Drive folder index

`ProfilePhotoService` scans this hard-coded folder:

`1y9A0Nwh7icSssRzTDVaR3vamCn3oWWlB`

The service:

- reads only files directly inside the folder, not subfolders;
- strips the file extension;
- strips only a trailing ` - Headshot`;
- changes hyphens and underscores to spaces;
- collapses whitespace and lowercases the result;
- stores one entry per resulting name key;
- caches the complete index in Script Cache for six hours.

This implementation is in `Services/ProfilePhotoService.js`, approximately lines 1–192.

The matching is much less tolerant than Attendance's matching code. It does not reliably handle:

- `Surname, Firstname`;
- `Firstname Lastname Photo`;
- apostrophes or accents;
- bracketed suffixes;
- `copy` suffixes;
- middle-name differences;
- two students with the same name;
- files inside subfolders.

If two files normalise to the same key, the later file silently replaces the earlier one. There is no ambiguity report.

### 3. Participant list projection

`ParticipantProjectionService.toListItem_()` intentionally removes Drive references from data sent to browsers. That is good security design. It sends only:

- `hasPhoto`
- an abstract `assetKey`
- an `assetVersion`

However, `hasPhoto` is calculated only from `item.hasPhoto`, `item.photoId` or `item.photoUrl` (`Services/ParticipantProjectionService.js`, approximately lines 151–160). It does not consult `ProfilePhotoService`.

The participant row UI then renders a secure avatar only when `participant.hasPhoto` is true (`Portal/Pages/Participants.html`, around line 244).

This creates the central failure:

```text
Drive file exists and filename matches student
        ↓
Photo ID / Photo URL columns are blank
        ↓
Projection sets hasPhoto = false
        ↓
List UI renders initials only
        ↓
SecureImageService is never called
        ↓
Drive folder fallback is never reached
```

### 4. Participant profile drawer

Opening a participant loads the permission-scoped detail projection. The detail projection also calculates `hasPhoto` only from `Photo ID`/`Photo URL`, but the profile renderer does not gate its request on that flag. It always calls:

`App.secureAvatarHtml("participant", stableId, name, "profile")`

See `Portal/App/SpecCentralProfiles.html`, approximately lines 13–30 and 85–106.

Consequently, an exact folder-name match can work in a profile even when the list shows initials. If it does not, the failure is later in the secure pipeline.

### 5. Secure server resolution

The browser lazy-loads visible avatars in batches of up to 12 through `portalResolveSecureImages`. The flow is:

```text
secureAvatarHtml
  → IntersectionObserver / MutationObserver
  → client queue (maximum 12 per call)
  → portalResolveSecureImages
  → HeadshotAssetService.resolveMany
  → SecureImageService.resolveMany
  → permission and scope check
  → canonical participant lookup by id/studentKey
  → Photo ID, then Photo URL, then filename-folder index
  → Drive API metadata and thumbnail request using Apps Script OAuth
  → MIME and size validation
  → base64 data URL returned to browser
```

Relevant files:

- `Portal/App/SpecCentralUtilities.html`, approximately lines 317–395
- `SpecPortal.js`, approximately lines 415–439
- `Services/HeadshotAssetService.js`
- `Services/SecureImageService.js`

This is the correct general approach for private images because the browser never receives a raw Drive ID or depends on the browser's own Drive login.

## Staff photo pipeline

### 1. Staff source

`StaffService` merges Staff List, the dedicated SpecCentral access sheet and Staff Event Allocation. It recognises the following photo headings:

- `Display Picture`
- `Photo`
- `Photo URL`
- `Headshot`
- `Head Shot`
- `Profile Photo`

The selected cell is stored as `staff.photo` (`Services/StaffService.js`, approximately lines 37–115 and 151–168).

The self-service profile editor writes only to the exact `Display Picture` column and requires an HTTPS URL. It does not accept a bare Drive file ID (`Services/StaffProfileService.js`, approximately lines 8–46 and 123–137).

### 2. Staff projection and rendering

Directory results expose only `hasPhoto`, not the raw reference. Staff cards, the Staff passport and the signed-in user's top-bar avatar call `secureAvatarHtml` with a Staff ID or email.

Relevant locations:

- `Services/StaffDirectoryService.js`, around lines 79–92
- `Portal/Pages/Staff.html`, around lines 87–110
- `Portal/App/SpecCentralApp.html`, around lines 856–884

### 3. Staff secure resolution

`SecureImageService` finds the Staff record and authorises either:

- the Staff member viewing their own image; or
- another user with `Operations.View`.

It then uses only `item.photo` as the source reference (`Services/SecureImageService.js`, approximately lines 74–79).

There is no Staff folder ID, Staff filename index or name-based fallback anywhere in the current code. Therefore a Staff image kept only in a Drive folder and named after the Staff member cannot appear.

## Participant Search spreadsheet pipeline

The separate Participant Search tool now caches `photoId` and `hasPhoto` from the `INDIVIDUALS(YES)` photo columns. When a profile opens it rereads the row, normalises a Drive reference and writes:

`=IFERROR(IMAGE("https://drive.google.com/thumbnail?..."), "No photo available")`

See `Participant Search.gs.js`, approximately lines 204–282 and 493–547.

Important limitations:

- It does not look in `ProfilePhotoService` or match Drive filenames.
- If `Photo ID` and `Photo URL` are blank, it reports no image even when the folder has one.
- Google Sheets `IMAGE()` fetches the URL outside the authenticated SpecCentral proxy.
- Private Drive thumbnails can fail depending on file sharing, Google account state and Google's image-fetching context.
- The behaviour can therefore differ between the owner's Chrome session, another user, Safari and mobile.

This explains why restoring fields to the search cache does not make private images universally reliable.

## Attendance matching pipeline

Attendance contains the most complete name matcher (`Attendance/MediaSync.js`). It:

- filters for image MIME types/extensions;
- removes common words such as `headshot`, `photo`, `profile`, `portrait`, `image` and `student`;
- normalises accents and apostrophes;
- supports `Surname, Firstname`;
- handles bracketed and `copy` suffixes;
- tries first-last and last-first forms;
- reports matched, unmatched and ambiguous results;
- writes `Photo ID` and `Photo URL` into the participant sheet.

This is currently the bridge that can make SpecCentral list photos work: run the sync against the authoritative Participants workbook so its `Photo ID`/`Photo URL` fields are populated, then invalidate participant and photo caches.

However, this logic is owned by Attendance rather than the canonical SpecCentral asset service, which is an architectural duplication and operational risk.

## Confirmed and likely issues

### Critical / immediate

1. **Folder-only student photos are gated out on list pages.** `hasPhoto` does not include the Drive filename index, while the UI requires `hasPhoto` before requesting an image.
2. **Folder-only Staff photos are unsupported.** Staff requires an explicit spreadsheet photo reference.
3. **Participant Search uses direct `IMAGE()` URLs.** This cannot reliably display private Drive content across browsers and users.
4. **Two source-of-truth models coexist.** Some code expects explicit sheet fields; other code expects name matching in a folder.

### High

5. **Filename matching is fragile and collision-prone.** The SpecCentral matcher is weaker than Attendance's and has no ambiguity reporting.
6. **Failure responses are almost invisible.** The client ignores unsuccessful per-image results and normally shows initials. Only a rejected whole request produces a console warning.
7. **Current health reporting can report false confidence.** `SecureImageService.getHealth()` parses references but does not attempt file access. It hard-codes `inaccessible: 0` and gives a current `lastSuccessful` time even when no image was fetched.
8. **Cache invalidation is incomplete.** The folder index lasts six hours and is not cleared by the normal participant data invalidation path. New or renamed Drive files can remain invisible until expiry or a separate photo-cache refresh.
9. **Large batched data URLs are costly.** Up to 12 images are returned in one Apps Script response. Only responses below roughly 90 KB are server-cached; larger thumbnails are refetched and can produce slow or oversized responses.

### Medium

10. **Only top-level folder files are indexed.** Subfolders are ignored.
11. **Non-image files are indexed by `ProfilePhotoService`.** They fail later at MIME validation instead of being excluded during indexing.
12. **Legacy and current shells use different mechanisms.** The old `Portal` profile code still expects direct photo URLs, while current SpecCentral intentionally returns blank values from `getParticipantPhotoUrl()` and `buildDriveThumbnailUrl()` to prevent storage-reference leakage. Testing the wrong shell can give contradictory results.
13. **Configuration is hard-coded and duplicated.** The student folder ID exists separately in SpecCentral and Attendance.
14. **Runtime diagnostics cannot currently be automated from `clasp run`.** The project lacks an Apps Script Execution API deployment.

## Recommended repair plan

### Phase 1: restore reliable display quickly

1. Run the existing Attendance `syncStudentHeadshots()` against the authoritative Participants workbook.
2. Review the generated `Photo Matches` sheet and manually resolve all `MULTIPLE` and `NO MATCH` records.
3. Confirm `INDIVIDUALS(YES)` contains valid `Photo ID` values, not just thumbnail URLs.
4. Populate Staff `Display Picture` with a valid Drive file URL for every Staff member requiring a photo.
5. Confirm the Apps Script deployment owner can open every referenced file.
6. Clear both participant projections and `ProfilePhotoService`'s six-hour cache, then retest.

This is the lowest-risk short-term fix because it aligns the data with the current projection gate.

### Phase 2: remove the code defect

Create one canonical server-side `HeadshotIndexService` with entries such as:

```text
entityType
stableEntityId
fileId
assetVersion
matchMethod
matchStatus
updatedAt
```

The participant list projection should derive `hasPhoto` from this stable-ID index, not independently rescan Drive and not depend on a browser-visible URL. Staff should use the same index.

Do not join by display name at request time. Use name matching only as an ingestion/migration step, then persist the result against `studentKey` or `staffId`.

### Phase 3: replace direct Drive delivery

Retain the authenticated server-proxy contract for current private Drive files, but stop using direct Drive thumbnails in Participant Search. Options are:

1. insert an image blob into the sheet, if acceptable for the spreadsheet workflow; or
2. have Participant Search call the same asset service and use an authorised temporary representation; or
3. migrate canonical headshots to private Google Cloud Storage and issue short-lived signed URLs through the service.

Cloud Storage is the strongest long-term option for cross-browser consistency, versioning, lifecycle rules, transformations and observability. The database/index should store the storage object key; browser clients should still receive only short-lived authorised output.

### Phase 4: add actionable diagnostics

Add an administrator-only diagnostic that reports aggregate counts and error categories without exposing Drive IDs:

- participant records;
- Staff records;
- explicit references;
- folder matches;
- unmatched names;
- ambiguous matches;
- inaccessible files;
- invalid MIME types;
- oversized originals/thumbnails;
- most recent successful resolve;
- cache age and version.

Also return or log each failed secure-image response category in development/admin mode. Useful categories already exist: `NO_IMAGE_REFERENCE`, `FILE_ID_PARSE_FAILED`, `FILE_NOT_FOUND`, `FILE_ACCESS_DENIED`, `UNSUPPORTED_MIME_TYPE`, `FILE_TOO_LARGE`, `IMAGE_CONVERSION_FAILED`, `PERMISSION_SCOPE_DENIED` and `AUTHENTICATION_REQUIRED`.

## Advisor validation checklist

Use one known student and one known Staff member for each test.

### Source checks

- Confirm the student filename and expected normalised key.
- Confirm whether the student has `Photo ID` and `Photo URL` in `INDIVIDUALS(YES)`.
- Confirm the Staff row has a recognised photo heading and value.
- Confirm the deployment owner can open both Drive files.
- Confirm both files are supported images and below 10 MB source size.

### Application checks

- Test student list avatar.
- Test student profile avatar.
- Test Staff directory avatar.
- Test Staff profile avatar.
- Test signed-in top-bar avatar.
- Test Participant Search sheet image separately.

### Browser matrix

- owner's Chrome profile;
- another authorised user's Chrome profile;
- Safari on macOS;
- Safari on iPhone/iPad;
- private/incognito browser session with only the authorised Workspace login.

### Expected interpretation

- Profile works but list fails: `hasPhoto` projection gate.
- SpecCentral works but Participant Search fails: direct `IMAGE()`/Drive privacy limitation.
- Student works but Staff fails: missing Staff photo reference or lack of Staff folder index.
- Everything fails for one file: name/reference, MIME, size or deployment-owner Drive access.
- Everything fails for one user only: SpecCentral capability/scope or authentication mismatch.
- First load works but repeated/mobile loads are slow: base64 response size and limited caching.

## Recommended decision

For immediate restoration, populate stable `Photo ID` fields using the existing robust Attendance matcher and populate Staff `Display Picture` references. For the durable solution, commission one stable-ID Headshot Asset Service and asset index shared by SpecCentral, Participant Search and Attendance, with private Drive as the temporary adapter and private Cloud Storage as the eventual storage provider.
