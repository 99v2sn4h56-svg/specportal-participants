/**
 * Dry-run-first migration for persistent Timeline Event IDs and Participant
 * Group IDs. No spreadsheet is changed unless apply() receives the explicit
 * confirmation token and the caller has administrative capability.
 */
const StableIdMigrationService = (() => {
  const CONFIRMATION_TOKEN = "APPLY-STABLE-IDS";

  function dryRun() {
    requireAdmin_();
    const timeline = inspectSheet_(getTimelineSheet_(), timelineDefinition_());
    return {
      ok: true,
      mode: "dry-run",
      generatedAt: new Date().toISOString(),
      timeline,
      groups: inspectSheet_(ParticipantService.getGroupsSheet(), groupDefinition_()),
      impact: { attendance: "Persistent Event IDs strengthen Timeline-to-Attendance matching; existing Session IDs and sheet-name fallbacks remain unchanged.", eventManager: "Persistent IDs prevent routes from changing when event text is edited.", browserRoutes: "Saved links remain compatible through legacy and derived ID fallbacks during migration." },
      migrationPlan: { backup: "Create a timestamped copy of the Timeline workbook before any write-enabled run.", idFormat: "EVT- followed by 20 uppercase UUID characters.", collisions: "Abort on existing duplicates; generated IDs are checked against every used ID.", rollback: "Restore only the Event ID column from the backup and invalidate Timeline caches.", verification: "Repeat dry-run, compare row counts, validate Attendance links and open representative Event Manager routes.", sequencing: "Resolve blockers, backup, enable migration property temporarily, apply, verify, disable the property, then deploy." }
    };
  }

  function apply(request) {
    requireAdmin_();
    if (PropertiesService.getScriptProperties().getProperty("SPEC_STABLE_ID_MIGRATION_ENABLED") !== "true") {
      throw new Error("Stable ID migration writes are disabled. Run the dry-run report only.");
    }
    const input = request || {};
    if (String(input.confirmation || "") !== CONFIRMATION_TOKEN) {
      throw new Error(`Confirmation token ${CONFIRMATION_TOKEN} is required.`);
    }

    const targets = Array.isArray(input.targets) && input.targets.length
      ? input.targets.map(value => String(value).toLowerCase())
      : ["timeline", "groups"];
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      const before = dryRun();
      const selectedReports = [];
      if (targets.includes("timeline")) selectedReports.push(before.timeline);
      if (targets.includes("groups")) selectedReports.push(before.groups);
      const blockers = selectedReports.flatMap(report => report.blockers || []);
      if (blockers.length) {
        return { ok: false, mode: "apply", generatedAt: new Date().toISOString(), error: "Migration blocked by duplicate IDs.", blockers, before };
      }

      const applied = {};
      if (targets.includes("timeline")) applied.timeline = applyToSheet_(getTimelineSheet_(), timelineDefinition_());
      if (targets.includes("groups")) applied.groups = applyToSheet_(ParticipantService.getGroupsSheet(), groupDefinition_());
      CacheService.getScriptCache().removeAll(["SPEC_TIMELINE_EVENTS_V3", "SPEC_TIMELINE_EVENTS_V4"]);
      return { ok: true, mode: "apply", generatedAt: new Date().toISOString(), applied, after: dryRun() };
    } finally {
      lock.releaseLock();
    }
  }

  function inspectSheet_(sheet, definition) {
    if (!sheet) return missingSheetReport_(definition);
    const values = sheet.getDataRange().getDisplayValues();
    if (!values.length) return missingSheetReport_(definition);
    const headerRowIndex = definition.findHeaderRow(values);
    const headers = values[headerRowIndex].map(value => String(value || "").trim());
    const idColumnIndex = EntityModelService.findHeaderIndex(headers, definition.idAliases);
    const rows = values.slice(headerRowIndex + 1);
    const seen = {};
    const duplicateIds = {};
    let populatedRows = 0;
    let existingIds = 0;
    let missingIds = 0;
    let incompleteIdentityRows = 0;
    let archivedRows = 0;
    const malformedIds = [];
    const statusColumnIndex = EntityModelService.findHeaderIndex(headers, ["Status", "Event Status"]);

    rows.forEach((row, offset) => {
      if (!definition.hasEntity(row, headers)) return;
      populatedRows++;
      if (statusColumnIndex >= 0 && /^archived$/i.test(String(row[statusColumnIndex] || "").trim())) archivedRows++;
      const id = idColumnIndex >= 0 ? String(row[idColumnIndex] || "").trim() : "";
      if (id) {
        existingIds++;
        if (!new RegExp("^" + definition.prefix + "-[A-Z0-9]{8,40}$", "i").test(id)) malformedIds.push({ id, row: headerRowIndex + offset + 2 });
        const key = id.toLowerCase();
        if (seen[key]) duplicateIds[id] = (duplicateIds[id] || [seen[key]]).concat(headerRowIndex + offset + 2);
        else seen[key] = headerRowIndex + offset + 2;
      } else {
        missingIds++;
        if (!definition.hasIdentity(row, headers)) incompleteIdentityRows++;
      }
    });

    const duplicates = Object.keys(duplicateIds).map(id => ({ id, rows: Array.from(new Set(duplicateIds[id])) }));
    return {
      target: definition.target,
      spreadsheetId: sheet.getParent().getId(),
      sheetName: sheet.getName(),
      headerRow: headerRowIndex + 1,
      idHeading: definition.idHeading,
      idColumnExists: idColumnIndex >= 0,
      populatedRows,
      existingIds,
      missingIds,
      incompleteIdentityRows,
      archivedRows,
      persistentIds: existingIds,
      derivedIds: missingIds,
      cannotGenerateConfidently: incompleteIdentityRows,
      malformedIds,
      duplicateIds: duplicates,
      blockers: duplicates.map(item => `${definition.idHeading} ${item.id} is duplicated on rows ${item.rows.join(", ")}.`),
      proposedAction: missingIds
        ? `${idColumnIndex < 0 ? `Add ${definition.idHeading} column and ` : ""}assign ${missingIds} immutable IDs.`
        : "No ID backfill required."
    };
  }

  function applyToSheet_(sheet, definition) {
    if (!sheet) throw new Error(`${definition.target} sheet was not found.`);
    const values = sheet.getDataRange().getDisplayValues();
    const headerRowIndex = definition.findHeaderRow(values);
    const headers = values[headerRowIndex].map(value => String(value || "").trim());
    let idColumnIndex = EntityModelService.findHeaderIndex(headers, definition.idAliases);
    let columnAdded = false;

    if (idColumnIndex < 0) {
      idColumnIndex = Math.max(sheet.getLastColumn(), headers.length);
      sheet.getRange(headerRowIndex + 1, idColumnIndex + 1).setValue(definition.idHeading);
      columnAdded = true;
    }

    let assigned = 0;
    const usedIds = new Set(values.slice(headerRowIndex + 1)
      .map(row => String(row[idColumnIndex] || "").trim().toLowerCase()).filter(Boolean));
    values.slice(headerRowIndex + 1).forEach((row, offset) => {
      if (!definition.hasEntity(row, headers)) return;
      const existing = String(row[idColumnIndex] || "").trim();
      if (existing) return;
      const id = createUniqueId_(definition.prefix, usedIds);
      sheet.getRange(headerRowIndex + offset + 2, idColumnIndex + 1).setValue(id);
      usedIds.add(id.toLowerCase());
      assigned++;
    });

    SpreadsheetApp.flush();
    return { target: definition.target, sheetName: sheet.getName(), columnAdded, assigned, preserved: true };
  }

  function timelineDefinition_() {
    return {
      target: "timeline",
      idHeading: "Event ID",
      idAliases: ["Event ID", "Event Id", "Timeline ID"],
      prefix: "EVT",
      findHeaderRow: findTimelineHeaderRow_,
      hasEntity: (row, headers) => hasAnyValue_(row, headers, ["Date", "Event Date", "Details", "Event", "Event Name", "Session", "Location", "Venue", "Location/Venue"]),
      hasIdentity: (row, headers) => hasAnyValue_(row, headers, ["Date", "Event Date"]) && hasAnyValue_(row, headers, ["Details", "Event", "Event Name", "Session", "Location", "Venue", "Location/Venue"])
    };
  }

  function groupDefinition_() {
    return {
      target: "groups",
      idHeading: "Group ID",
      idAliases: ["Group ID", "Group Id"],
      prefix: "GRP",
      findHeaderRow: () => 0,
      hasEntity: (row, headers) => hasAnyValue_(row, headers, ["School name", "School", "Current School", "Item", "Group Name", "Category"]),
      hasIdentity: (row, headers) => hasAnyValue_(row, headers, ["School name", "School", "Current School"]) && hasAnyValue_(row, headers, ["Item", "Group Name", "Category"])
    };
  }

  function findTimelineHeaderRow_(values) {
    const maxRows = Math.min(values.length, 12);
    for (let index = 0; index < maxRows; index++) {
      const headers = values[index].map(EntityModelService.normaliseKey);
      const hasDate = ["date", "event date", "rehearsal date", "day date", "day/date"].some(value => headers.includes(EntityModelService.normaliseKey(value)));
      const hasEvent = ["details", "event", "event name", "session", "location", "venue", "location/venue"].some(value => headers.includes(EntityModelService.normaliseKey(value)));
      if (hasDate && hasEvent) return index;
    }
    return 0;
  }

  function hasAnyValue_(row, headers, aliases) {
    const index = EntityModelService.findHeaderIndex(headers, aliases);
    return index >= 0 && String(row[index] || "").trim() !== "";
  }

  function createUniqueId_(prefix, usedIds) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const id = PlatformStoreService.createId(prefix);
      if (!usedIds.has(id.toLowerCase())) return id;
    }
    throw new Error(`Could not generate a unique ${prefix} ID.`);
  }

  function getTimelineSheet_() {
    const source = SourceRegistryService.getSourceConfig("timeline");
    const spreadsheet = SpreadsheetApp.openById(source.spreadsheetId);
    return spreadsheet.getSheets().find(item => item.getSheetId() === Number(source.sheetId)) || spreadsheet.getSheetByName(source.sheetName) || null;
  }

  function requireAdmin_() {
    const email = UserContextService.getEmail();
    if (!email || (!UserContextService.hasCapability("Operations.Admin") && !UserContextService.hasCapability("Settings.Admin"))) {
      throw new Error("Operations.Admin or Settings.Admin is required for stable ID migration.");
    }
  }

  function missingSheetReport_(definition) {
    return { target: definition.target, idHeading: definition.idHeading, populatedRows: 0, existingIds: 0, missingIds: 0, duplicateIds: [], blockers: [`${definition.target} sheet was not found.`], proposedAction: "Resolve the missing source before migration." };
  }

  return { dryRun, apply, CONFIRMATION_TOKEN };
})();
