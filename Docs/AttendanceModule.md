# Spec Central Attendance Module Plan

## Current Attendance Architecture Found

No dedicated attendance module was found in the current repo.

There are no files or functions named for attendance, roll marking, present/absent status, or check-in workflows. There is also no current `onEdit(e)` attendance handler.

## Attendance UI Styling Pass Status

No existing Attendance workbook HTML UI, sidebar, dialog, or Apps Script attendance interface was found in this repo.

The only attendance-specific UI file currently present is `Portal/Pages/Attendance.html`, which is a comment-only scaffold and contains no buttons, inputs, actions, data bindings, or styling to update. Because of that, no Spec Central visual styling was applied in this pass.

To continue the Attendance UI styling work, bring the current Attendance workbook UI files into this repo first. The likely files needed are:

- Attendance workbook Apps Script files that create sidebars/dialogs or custom menus.
- Any `.html` files used by the Attendance workbook UI.
- Any scripts containing attendance actions such as marking present/absent/late/excused, syncing rolls, or handling sheet edits.
- Any trigger functions such as attendance-specific `onEdit(e)` handlers or installable trigger setup functions.
- Any source sheet/workbook configuration constants for attendance data.

Once those files are available, the styling pass can apply the Spec Central visual language without changing the attendance data structures, triggers, or action function names.

## AttendanceSource Visual Modernisation Pass

The standalone Attendance source app in `/Users/courtcassar/Documents/SpecPortal/AttendanceSource` has now been styled to feel closer to Spec Central while remaining separate from the Participants/Spec Central app.

### UI Files Styled

- `index.html`
- `student.html`
- `CSS.html`
- `StudentCSS.html`
- `JavaScript.html`
- `StudentJavaScript.html`
- `Dashboard.js`

### Functionality Explicitly Preserved

- Timeline/student-group driven event creation remains unchanged.
- `syncEventsFromTimeline()` remains the event creation workflow.
- Spreadsheet structures and generated attendance sheet headers remain unchanged.
- Existing menu functions remain unchanged.
- Existing HTML element IDs used by the UI remain unchanged.
- Existing `google.script.run` backend function names remain unchanged.
- Existing attendance status behaviour remains unchanged.
- Student self check-in behaviour remains unchanged.
- Manager roll marking and note saving remain unchanged.

### Headshot Data Found

AttendanceSource already supports student photos through existing fields:

- `Photo URL`
- `Photo ID`
- `photoUrl`
- `photoId`

The sync path already reads participant photo fields, writes `Photo URL` / `Photo ID` into attendance sheets, and `getSessionAttendance()` returns `photoUrl` / `photoId` to the UI. The manager roll and passport UI already rendered those fields. The visual pass kept that support and added safer optional client-side fallbacks for similarly named photo fields such as `headshotUrl`, `imageUrl`, and `avatarUrl`.

### Later Spec Central Photo Integration Needs

For full Spec Central participant-photo integration later, the Attendance module should read from the same participant photo cache/key strategy used by Spec Central, then map those photos into attendance records by a stable identifier such as student ID, SRN, or application ID. That should be done through a service wrapper after the Attendance source has been imported unchanged and verified.

## Attendance Workbook Import Plan

This repo is ready to receive the existing Attendance workbook code, but the import should happen in controlled phases. Do not rewrite the Attendance workbook logic during import; first preserve it exactly so behaviour can be compared before and after.

### Files / Code Needed From The Attendance Workbook

Bring across a complete copy of the Attendance workbook Apps Script project, including:

- Apps Script `.js` / `.gs` files that contain attendance business logic.
- HTML sidebar/dialog files used by the attendance UI.
- Menu functions that open attendance screens or run attendance actions.
- Trigger setup functions, especially anything creating installable `onEdit`, `onOpen`, time-based, or form-submit triggers.
- Active trigger handlers such as `onEdit(e)`, `onOpen(e)`, `onSelectionChange(e)`, or named installable trigger callbacks.
- Any helper files for formatting, validation, colour rules, syncing, locking, or protection.
- Workbook configuration constants, spreadsheet IDs, folder IDs, sheet names, tab names, and range references.
- Named ranges used by the Attendance workbook, if any.
- Attendance status values, for example present/absent/late/excused/unmarked or whatever the workbook actually uses.
- Participant, group, item, school, rehearsal, and teacher matching fields.
- Any sheet formulas or generated-sheet templates that the scripts expect to exist.
- Any client-side JavaScript embedded in HTML files.
- Any CSS or inline styles used by the current attendance UI.

### Attendance Workbook Details To Capture During Import

Document these as soon as the workbook files are brought in:

- Source spreadsheet ID(s).
- Source sheet/tab names.
- Output sheet/tab names.
- Header rows and frozen rows.
- Key columns for participant identity:
  - student ID,
  - SRN,
  - first name,
  - last name,
  - school,
  - year,
  - item,
  - group name.
- Key columns for attendance:
  - rehearsal/date,
  - status,
  - checked-in timestamp,
  - checked-in by,
  - notes,
  - sync status.
- Status values exactly as used in the workbook.
- Data validations, checkboxes, dropdowns, conditional formatting, protected ranges, and named ranges.
- Which functions are called by buttons, drawings, menus, triggers, or sidebar controls.

### Proposed Destination Structure

Keep imported code isolated first, then gradually connect it to Spec Central.

- `Services/AttendanceService.js`
  - Final home for read/write attendance data access.
  - Initially can contain wrapper calls only, while legacy imported code remains unchanged.

- `Portal/Pages/Attendance.html`
  - Final home for Attendance UI included by Spec Central.
  - Initially can host imported sidebar/dialog markup after behaviour is understood.

- `Portal/Components/AttendanceCards.html`
  - Optional future include for reusable attendance cards, status chips, and summary rows.
  - Create this only when repeated attendance UI emerges.

- `Docs/AttendanceModule.md`
  - Keep this as the source of truth for mapping workbook logic into Spec Central.

- Temporary import location, if needed:
  - Use clearly named legacy files such as `Attendance Legacy.js` or `AttendanceSidebarLegacy.html`.
  - Avoid duplicate Apps Script base names because `clasp push` treats `Name.js` and `Name.html` as the same script-file name.

### Integration Plan

#### Phase 1: Bring Attendance Scripts In Unchanged

- Copy the existing Attendance workbook Apps Script files into this repo.
- Preserve function names, trigger callbacks, constants, sheet names, and HTML IDs/classes.
- Do not restyle, rename, or wrap logic yet.
- Run duplicate filename checks before `clasp push`.
- Confirm the imported code compiles before connecting it to Spec Central.

#### Phase 2: Wrap Existing Functions Safely

- Add minimal wrapper methods in `AttendanceService.js`.
- Add safe `portalGet...` / `portal...` gateway functions in `SpecPortal.js` only after the legacy functions are understood.
- Keep wrappers read-only first where possible.
- Preserve legacy write functions and trigger handlers until replacement behaviour is proven.

#### Phase 3: Apply Spec Central Styling

- Restyle the attendance UI using the Spec Central visual language:
  - title: `Spec Central Attendance`,
  - Schools Spectacular kicker,
  - Poppins headings,
  - brand colours,
  - rounded cards,
  - soft shadows,
  - clean section headers,
  - mobile-friendly spacing,
  - status chips/buttons.
- Do not change button function names, input names, form fields, or data bindings during styling.

#### Phase 4: Connect Attendance Summaries To Profiles

- Add read-only attendance summaries to:
  - participant profiles,
  - school profiles,
  - item profiles,
  - group profiles if the attendance source supports groups.
- Match participants using the strongest available key:
  1. student ID,
  2. SRN,
  3. normalised name + school + item fallback.

#### Phase 5: Dashboard Attendance Widgets

- Add attendance widgets to the Spec Central dashboard only after the service layer is stable.
- Candidate widgets:
  - today's attendance completion,
  - present/absent/unmarked counts,
  - rehearsals needing rolls,
  - schools missing attendance,
  - recent attendance updates.

### Risk Checklist

- Triggers:
  - Identify every simple and installable trigger before import.
  - Avoid creating duplicate installable triggers.
  - Confirm trigger owner/permission expectations.

- Sheet-specific ranges:
  - List all hardcoded `getRange()` references.
  - Check merged cells, protected ranges, hidden rows, and frozen rows.

- Hardcoded sheet names:
  - List all `getSheetByName()` values.
  - Confirm whether names differ between test/prod workbooks.

- Active spreadsheet assumptions:
  - Identify all `SpreadsheetApp.getActiveSpreadsheet()` and `getActive()` calls.
  - Replace only later if wrappers need to open a specific workbook by ID.

- Permissions:
  - Confirm Drive, Spreadsheet, Mail, Cache, Properties, Lock, and Session usage.
  - Confirm whether attendance actions run as user or owner.

- Duplicate function names:
  - Check for collisions with `onOpen`, `onEdit`, `openSpecPortalHome`, utility helpers, and existing service names.
  - Check for duplicate clasp base names such as `Attendance.js` and `Attendance.html`.

- Data structures:
  - Preserve status values exactly.
  - Preserve header names and column order until mapping is documented.

- UI actions:
  - Preserve all button/menu/sidebar function names while styling.
  - Do not rename HTML element IDs used by scripts.

### Next Action Checklist For Court

- Export or copy the Attendance workbook Apps Script files into this repo.
- Provide the Attendance workbook sheet/tab names.
- Provide screenshots of the current Attendance UI, including:
  - home/sidebar,
  - roll marking screen,
  - status buttons/chips,
  - summary views,
  - error/success states.
- Provide an example attendance sheet structure with headers and 2-3 sample rows.
- Provide the exact attendance status values used by the workbook.
- Identify which functions are attached to buttons, custom menus, drawings, or triggers.
- Confirm whether attendance is per participant, per group, per school, per item, per rehearsal, or a combination.
- Confirm whether Spec Central should initially be read-only or allow marking attendance.

The closest existing architecture pieces are:

- `Services/RehearsalService.js`: reads the external operation schedule and exposes rehearsal data to Spec Central.
- `Dance Workbooks.js`: generates/syncs dance item workbooks from `GROUPS(YES)`.
- `Generate Measurment Sheets.js` and `Update Measurement Sheets.js`: generate/update per-item costume measurement workbooks from `GROUPS(YES)`.
- `ParticipantService.js`: central service for participants, groups, schools, and portal bootstrap data.
- `SpecPortal.js`: server-side gateway functions for Spec Central.
- `Portal.html` and `Portal/Pages/Dashboard.html`: current frontend shell and dashboard module.

## Data Sources

### Participant Data

Source sheet: `INDIVIDUALS(YES)`

Current service: `ParticipantService.getAll()`

Known participant identifiers/fields:

- `firstName`
- `lastName`
- `studentId`
- `srn`
- `school`
- `year`
- `discipline`
- `subDiscipline`
- `item`
- `teacherName`
- `teacherEmail`
- student and parent contact fields

Likely attendance participant key candidates:

- Preferred: `studentId` where present.
- Secondary: `srn` where present.
- Fallback: normalised `firstName + lastName + school + item`.

### Group Data

Source sheet: `GROUPS(YES)`

Current service: `ParticipantService.getGroups()`

Known group fields:

- `school`
- `category`
- `item`
- `groupName`
- `teacherEmail`
- `teacherName`
- `classroom`
- `count`

Existing workbook scripts also use fixed `GROUPS(YES)` columns:

- School: column H in workbook scripts.
- Item: column O in `Dance Workbooks.js` and `Update Measurement Sheets.js`.
- Group name: column Q in `Dance Workbooks.js`; column P in costume measurement scripts.
- Allocated count: column G or fallback from column A depending on script.

### Rehearsal Data

Source spreadsheet ID: `1JccmwT9_wOEhuSU5kyFH6HnU9T9ysfQa87XjvL5WLog`

Source sheet: `Operation Schedule`

Current service: `RehearsalService`

Rehearsal fields returned:

- `id`
- `sourceRow`
- `dateDisplay`
- `dateKey`
- `day`
- `start`
- `finish`
- `venue`
- `title`
- `details`
- `type`
- `notes`
- `colour`
- `items`
- `participants`
- `staff`
- `raw`

Note: `items`, `participants`, and `staff` are currently returned as empty arrays by `buildRehearsal_()`. Item matching is inferred by `RehearsalService.byItem(item)` using item text in the schedule title/details.

### Workbook Data

No attendance workbook was found.

Existing workbook patterns that could inform attendance:

- `Dance Workbooks.js`
  - Root folder ID: `1UfEjKw1wRa9FMHDxz0WabnSaB2oTtgp7`
  - Source: `GROUPS(YES)`
  - Creates/updates item workbooks named `Dance - {item}`.
  - Combined workbook for `I Am Australian`, `Land Down Under`, and `Dance Monkey`.
  - Uses one sheet per item and removes extra sheets.

- `Generate Measurment Sheets.js`
  - Output folder ID: `1zV4bTV5k_-_n6Ingq1GByJbxh-IBdgFR`
  - Source: `GROUPS(YES)`
  - Creates item workbooks named `{item} - Costume Measurement Sheet`.
  - Creates a `Participating Schools` home sheet.
  - Creates school/group tabs.
  - Creates `All Student Measurements` summary sheet.

- `Update Measurement Sheets.js`
  - Updates existing costume measurement workbooks from `GROUPS(YES)`.
  - Marks removed school tabs with a yellow tab colour rather than deleting blindly.

## Key Functions

### Current Portal / Gateway

- `openSpecPortalHome()`
- `portalGetPortalData()`
- `portalGetRehearsals()`
- `portalRefreshRehearsals()`

### Participant / Group / School

- `ParticipantService.getAll()`
- `ParticipantService.getGroups()`
- `ParticipantService.getSchoolsMasterData()`
- `ParticipantService.getSchoolProfile(schoolName)`
- `ParticipantService.getPortalData()`

### Rehearsals

- `RehearsalService.getAll()`
- `RehearsalService.refresh()`
- `RehearsalService.byDate(dateValue)`
- `RehearsalService.byVenue(venue)`
- `RehearsalService.byText(searchText)`
- `RehearsalService.today()`
- `RehearsalService.next(limit)`
- `RehearsalService.byItem(item)`

### Workbook Generation

- `createOrUpdateDanceWorkbooks()`
- `syncExistingDanceWorkbooksOnly()`
- `buildDanceWorkbooks_(createMissing)`
- `generateCostumeSheets()`
- `updateExistingCostumeSheets()`
- `createCostumeWorkbook(itemName, schools)`
- `updateWorkbookForItem(itemName, schools)`

### Triggers / Edit Handlers

- `onOpen()` in `Menu.js`
  - Adds menus.
  - Calls `openSpecPortalOnOpen_()`.

- `createSpecPortalOpenTrigger()` in `SpecPortal.js`
  - Creates an installable spreadsheet `onOpen` trigger for `openSpecPortalHome`.

- `onSelectionChange(e)` in `Participant Search.gs.js`
  - Opens participant search sidebar when a specific sheet region is selected.

No active `onEdit(e)` trigger was found.

## How Attendance Could Connect To Spec Central

Recommended first integration should be read-only.

1. Add `AttendanceService.js` as the only backend service that knows where attendance data lives.
2. Add safe gateway wrappers in `SpecPortal.js` later, for example:
   - `portalGetAttendanceSummary()`
   - `portalGetAttendanceForParticipant(participantKey)`
   - `portalGetAttendanceForItem(itemName)`
   - `portalGetAttendanceForSchool(schoolName)`
3. Use existing participant/group/item helpers in the frontend to connect attendance records to profile pages.
4. Use `RehearsalService` to connect attendance to rehearsal dates and rehearsal types.
5. Keep attendance writes out of Spec Central initially. If marking attendance is needed later, add a separate explicit write path with validation and audit fields.

Suggested initial attendance record shape:

```js
{
  attendanceId: "",
  rehearsalId: "",
  dateKey: "",
  dateDisplay: "",
  item: "",
  school: "",
  groupName: "",
  participantKey: "",
  studentId: "",
  srn: "",
  participantName: "",
  status: "present|absent|late|excused|unknown",
  checkedInAt: "",
  checkedInBy: "",
  source: "",
  notes: ""
}
```

## Proposed Dashboard Widgets

Potential Spec Central dashboard cards:

- Today's rehearsals with attendance status.
- Attendance completion percentage for today.
- Present / absent / unmarked counts.
- Items needing follow-up.
- Schools with missing rolls.
- Late arrivals count.
- Recently updated attendance records.

## Proposed Participant Profile Attendance Section

Add a read-only Attendance section to participant profiles:

- Next rehearsal.
- Last attendance status.
- Attendance history by date.
- Status pills: present, absent, late, excused, unmarked.
- Related item/group/school context.
- Notes where available.

The lookup should use the strongest available participant key:

1. `studentId`
2. `srn`
3. normalised participant name + school + item

## Proposed Item / School Attendance Summaries

### Item Profile

- Attendance percentage across upcoming/current rehearsals.
- Present / absent / unmarked counts by rehearsal.
- School breakdown for the item.
- Groups missing attendance.

### School Profile

- Attendance summary for all participants from that school.
- Upcoming rehearsals involving that school.
- Missing attendance by item.
- Teacher contact quick actions for follow-up.

## Risks / Unknowns

- No attendance workbook or attendance data source was found in the repo.
- No active `onEdit(e)` attendance handler exists.
- It is unclear whether attendance will be stored in the master spreadsheet, per-item workbooks, rehearsal workbooks, or an external source.
- Rehearsal records currently do not parse concrete item lists into `items`; `RehearsalService.byItem()` relies on text matching.
- Participant identity may be inconsistent if `studentId` or `srn` is missing.
- Group rows are count-based and may not map directly to individual participants.
- Existing workbook scripts use fixed column indexes, and some comments disagree between scripts about item/group-name columns.
- Apps Script sidebar performance needs care if attendance data becomes large.
- Write flows will need permissions, audit history, and conflict handling.

## Next Implementation Steps

1. Confirm the attendance source of truth:
   - master sheet,
   - external attendance workbook,
   - per-item workbook,
   - or a new dedicated attendance sheet.

2. Define the canonical attendance schema and keys.

3. Add read-only methods to `Services/AttendanceService.js`.

4. Add safe gateway wrappers in `SpecPortal.js`.

5. Add attendance data to the portal bootstrap only if the payload is small; otherwise lazy-load by profile/item/school.

6. Build `Portal/Pages/Attendance.html` as a frontend-only include once service reads exist.

7. Add dashboard attendance widgets.

8. Add participant profile attendance section.

9. Add item and school summary sections.

10. Only after read-only views are stable, design attendance marking/write flows with validation and audit fields.
