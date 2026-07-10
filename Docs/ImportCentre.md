# Spec Central Import Centre

## Purpose

The Import Centre replaces the old temporary `IMPORT` sheet workflow with a guided floating dialog for acceptance imports. It is designed for:

- Individual Acceptances
- Group Acceptances
- CSV uploads
- XLSX uploads
- in-memory analysis before any spreadsheet write
- explicit conflict review before commit

The old import functions remain in the codebase for safety, but they are no longer exposed from the `Spec Tools` menu.

## Menu Flow

The `Spec Tools` menu now exposes:

- `Upload Acceptances/New Participant`

This opens `ImportCentre.html` as a modeless floating dialog. The dialog can auto-detect whether the upload is an individual or group acceptance file, and the user can still manually switch between individual and group imports.

Removed from the menu:

- `Mobile Search`
- `Create / Reset IMPORT Tab`
- `Analyse Import`
- `Import Records`

## Files

- `ImportCentre.html`
  - Dialog UI only.
  - Handles file selection, drag/drop, local CSV/XLSX parsing, progress display, conflict controls, and confirmation.

- `ImportService.js`
  - Import business logic.
  - Coordinates analysis, mapping, matching, conflict generation, approved updates, creates, and history logging.

- `FieldDictionary.js`
  - Canonical field names and aliases.
  - Prevents incoming wording variations from creating new spreadsheet columns.

- `Docs/ImportCentre.md`
  - This documentation.

## Workflow

1. Select import type.
2. Upload `.csv`, `.xlsx`, or `.xls`.
3. Analyse headers.
4. Map incoming fields to canonical destination fields.
5. Detect existing records.
6. Review column-level conflicts.
7. Preview changes.
8. Confirm import.
9. Write approved changes and log summary to `Import History`.

No temporary `IMPORT` tab is created.

## Header Detection

The analyser does not assume row 1 contains the real headers. It scans the first 10 rows, ignores filler headings such as `Blank` or `Blank 1`, and selects the row with the strongest match against the field dictionary.

This supports acceptance exports that contain title/category rows before the real headings, including files where the useful headings start on row 5.

## Type Detection And Remembered Choices

When opened from `Upload Acceptances/New Participant`, the Import Centre starts in auto-detect mode. Analysis scores the upload against both individual and group acceptance dictionaries and destination sheets, then selects the strongest match.

The dialog remembers:

- the last import type/mode selected by the user,
- column-level conflict choices for each detected import type.

Remembered column choices are prefilled the next time the same type is analysed. The default remains conservative: if no remembered choice exists, conflicting fields keep the existing spreadsheet value.

## Field Aliases

The importer maps incoming headings to canonical fields. Examples:

| Canonical Field | Accepted Incoming Headings |
| --- | --- |
| `Current School` | `School`, `School Name`, `Current School`, `Name of School` |
| `Student First Name` | `First Name`, `Given Name`, `Student First Name`, `Student Given Name` |
| `Student Last Name` | `Last Name`, `Surname`, `Student Last Name`, `Student Surname` |
| `Teacher Email` | `Teacher Email`, `Teacher Email (DET)`, `Teacher Email (DoE)`, `Teacher Email Address` |
| `Parent Email` | `Parent Email`, `Parent/Carer Email`, `Primary Parent Email` |
| `Application ID` | `Application ID`, `ApplicationId`, `Submission ID`, `Response ID` |

The destination column is resolved from the real sheet headers at runtime. If no matching destination header exists, the incoming column is listed as unresolved and is not written.

## Column Resolution

Unresolved incoming columns can be resolved before commit:

- `Do not import`: leaves the upload column out of the write plan.
- `Match to existing column`: writes the incoming values into a selected existing destination column.
- `Add new column`: appends a new header to the destination sheet and writes incoming values into that new column.

The analyser suggests likely existing-column matches where the incoming heading is similar to a destination heading. Suggested matches are preselected in the resolver, but can be changed before confirming.

Added columns are created only during the confirmed import step. Analysis and preview remain read-only.

## Matching Rules

### Individual Acceptances

Matching priority:

1. Application ID
2. Student ID
3. SRN
4. Exact student first name + last name + school
5. Student full name + DOB
6. Student full name + parent email
7. Fuzzy possible match for manual review only

Uncertain/fuzzy matches are marked for review and are not automatically merged.

### Group Acceptances

Matching priority:

1. Application ID
2. School code + item/category
3. School name + item/category
4. School + group name
5. Fuzzy possible match for manual review only

Group category matching understands common wording variations and maps them to the controlled spreadsheet values before matching or writing. Examples:

- `Moving Choir` -> `Primary Moving Choir`
- `Secondary Choir` -> `Secondary Combined Choir`
- `Combined Dance (Years K-2)` -> `K-2 Combined Dance`
- `Combined Dance (Years 3-6)` -> `3-6 Combined Dance`

This prevents valid incoming wording variations from being written into data-validation columns as invalid values.

## Conflict Handling

For matched records, differing non-blank values create conflicts. The dialog groups these by destination column rather than asking the user to validate every row.

For each affected column, the dialog shows:

- canonical field name
- number of differences found
- a small set of example rows
- existing example values
- incoming example values
- match confidence

Available choices:

- Keep existing
- Use incoming
- Merge values

Default behaviour is conservative:

- blank existing fields may be filled by incoming values,
- conflicting fields keep the existing value unless the user chooses otherwise at column level,
- unresolved incoming columns are never written.

## New Records

If no reliable match exists, the record is treated as unmatched and is shown in a separate review section.

The unmatched review shows the mapped incoming data for each row, including school, item, category, and group name where available. For group acceptances, the importer also suggests likely destination rows from the same school or school code, so category wording differences can be resolved without searching the sheet manually.

Per-record controls are available for records that need review:

- use a proposed exact match,
- use a suggested same-school destination row,
- create a new record instead,
- skip the record,
- manually target an existing destination row by row number.

Unmatched records are skipped by default during Confirm Import. They are only created or matched if the user explicitly chooses `Create new record` or enters a manual destination row.

Deferred UI improvement:

- searchable manual matching UI.

## Preview Before Write

The analysis preview shows:

- records processed
- records matched
- records to create
- records requiring review
- conflicts
- mapped columns
- unresolved columns
- warnings

No spreadsheet writes occur during analysis.

## Commit Behaviour

Confirmed imports:

- append new records in one `setValues()` batch,
- update matched records by writing only approved changed cells,
- group changed-cell writes by destination column and contiguous row batches,
- preserve fields not included in the upload,
- preserve formulas and system-managed columns that are not explicitly changed,
- keep conflicting existing values unless explicitly approved.

## Import History

The importer creates or uses a hidden sheet named:

`Import History`

Logged fields:

- timestamp
- user email
- import type
- source filename
- records processed
- records updated
- records created
- records skipped
- conflicts resolved
- errors
- duration
- destination sheet

The log is designed so rollback metadata can be added later. Destructive rollback is intentionally not implemented yet.

## Affected Sheets

- `INDIVIDUALS(YES)`
- `GROUPS(YES)`
- `Import History`

The importer does not change Acceptance Form response tabs, School Summary, Dance Workbooks, Attendance, Timeline, Staff Production Team, Participant Search, Portal, or Spec Central.

## Limitations

- XLSX parsing is performed in the dialog using SheetJS loaded from a CDN.
- Manual match UI is deferred.
- Rollback is deferred.
- Very large files may hit Apps Script client/server payload limits; split very large imports if needed.
- The old `IMPORT` workflow remains in code but is no longer menu-accessible.

## Deferred Rollback Design

A future rollback feature should store, per changed cell:

- sheet name,
- row number,
- column number,
- old value,
- new value,
- import history ID,
- user,
- timestamp.

Rollback should be opt-in, non-destructive, and should refuse to revert cells that have changed since the import unless the user explicitly resolves that conflict.
