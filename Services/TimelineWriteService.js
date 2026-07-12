/**
 * Administrator-only command adapter for the authoritative Timeline sheet.
 *
 * All mutations are heading-based, lock protected, stale checked and audited.
 * Records are never hard deleted: cancellation and archival are explicit
 * statuses so existing Attendance and Calendar relationships remain traceable.
 */
const TimelineWriteService = (() => {
  const FIELDS = {
    eventId: ["Event ID", "Event Id", "Timeline ID"],
    area: ["Area", "Department", "Team"],
    date: ["Date", "Event Date", "Rehearsal Date", "Day / Date", "Day/Date"],
    start: ["Start Time", "Start", "From", "Time", "Event Time"],
    finish: ["Finish Time", "Finish", "End", "To"],
    title: ["Details", "Activity", "Title", "Event", "Event Name", "Session", "Rehearsal", "Name"],
    venue: ["Location", "Venue", "Location/Venue", "Venue / Location", "Where"],
    categories: ["Individual", "Category", "Categories", "Event Categories", "Category Selection"],
    schoolGroups: ["School Groups"],
    studentGroups: ["Indv. Student Groups", "Individual Student Groups"],
    individualStudents: ["Indv. Students", "Individual Students"],
    staff: ["Staff", "Allocated Staff"],
    notes: ["Notes", "Note", "Comments", "Comment"],
    status: ["Status", "Event Status", "Timeline Status"]
  };

  function save(command) {
    const user = requireAdministrator_();
    const input = normaliseCommand_(command);
    validate_(input);
    return withLock_(() => {
      const source = openSource_();
      const isCreate = !input.sourceRow;
      const rowNumber = isCreate ? source.sheet.getLastRow() + 1 : input.sourceRow;
      if (!isCreate) assertCurrent_(source, rowNumber, input);
      ensureCommandHeadings_(source);
      const indexes = buildIndexes_(source.headers);
      const before = isCreate ? null : readEvent_(source, rowNumber, indexes);
      const eventId = input.eventId || createEventId_();
      writeEvent_(source.sheet, rowNumber, indexes, Object.assign({}, input, { eventId }));
      SpreadsheetApp.flush();
      RehearsalService.refresh();
      const afterSource = openSource_();
      const after = readEvent_(afterSource, rowNumber, buildIndexes_(afterSource.headers));
      AuditService.record(isCreate ? "TimelineEventCreated" : "TimelineEventUpdated", { type: "TimelineEvent", id: eventId }, { rowNumber, before, after });
      PlatformEventService.publish("TimelineEventUpdated", { eventId, rowNumber, action: isCreate ? "created" : "updated" }, { source: "TimelineWriteService", actor: user.email });
      return result_(isCreate ? "created" : "updated", after);
    });
  }

  function duplicate(command) {
    const user = requireAdministrator_();
    const input = normaliseCommand_(command);
    if (!input.sourceRow) throw new Error("A source Timeline row is required for duplication.");
    return withLock_(() => {
      const source = openSource_();
      assertCurrent_(source, input.sourceRow, input);
      ensureCommandHeadings_(source);
      const indexes = buildIndexes_(source.headers);
      const existing = readEvent_(source, input.sourceRow, indexes);
      const rowNumber = source.sheet.getLastRow() + 1;
      const eventId = createEventId_();
      const width = Math.max(source.headers.length, source.sheet.getLastColumn());
      source.sheet.getRange(input.sourceRow, 1, 1, width).copyTo(source.sheet.getRange(rowNumber, 1, 1, width));
      const copy = Object.assign({}, existing, {
        eventId,
        sourceRow: rowNumber,
        dateValue: parseDate_(existing.date),
        title: "Copy of " + (existing.title || "Timeline event"),
        status: "Draft"
      });
      writeEvent_(source.sheet, rowNumber, indexes, copy);
      SpreadsheetApp.flush();
      RehearsalService.refresh();
      const afterSource = openSource_();
      const after = readEvent_(afterSource, rowNumber, buildIndexes_(afterSource.headers));
      AuditService.record("TimelineEventDuplicated", { type: "TimelineEvent", id: eventId }, { sourceEventId: existing.eventId || "", sourceRow: input.sourceRow, rowNumber, after });
      PlatformEventService.publish("TimelineEventUpdated", { eventId, rowNumber, action: "duplicated" }, { source: "TimelineWriteService", actor: user.email });
      return result_("duplicated", after);
    });
  }

  function setStatus(command) {
    const user = requireAdministrator_();
    const input = normaliseCommand_(command);
    const status = String(input.status || "").trim();
    if (!["Cancelled", "Archived", "Active", "Draft"].includes(status)) throw new Error("Unsupported Timeline status.");
    if (!input.sourceRow) throw new Error("A source Timeline row is required.");
    return withLock_(() => {
      const source = openSource_();
      assertCurrent_(source, input.sourceRow, input);
      ensureCommandHeadings_(source);
      const indexes = buildIndexes_(source.headers);
      const before = readEvent_(source, input.sourceRow, indexes);
      source.sheet.getRange(input.sourceRow, indexes.status + 1).setValue(status);
      SpreadsheetApp.flush();
      RehearsalService.refresh();
      const afterSource = openSource_();
      const after = readEvent_(afterSource, input.sourceRow, buildIndexes_(afterSource.headers));
      const action = status === "Cancelled" ? "TimelineEventCancelled" : "TimelineEventStatusChanged";
      AuditService.record(action, { type: "TimelineEvent", id: after.eventId || before.eventId || "" }, { rowNumber: input.sourceRow, previousStatus: before.status || "", status });
      PlatformEventService.publish(status === "Cancelled" ? "TimelineEventCancelled" : "TimelineEventUpdated", { eventId: after.eventId || before.eventId || "", rowNumber: input.sourceRow, status }, { source: "TimelineWriteService", actor: user.email });
      return result_(status.toLowerCase(), after);
    });
  }

  function requireAdministrator_() {
    const user = UserContextService.getCurrent();
    if (!user.isAdmin || !AuthorizationService.hasCapability(user, "Administration.View") || !AuthorizationService.hasCapability(user, "Timeline.Edit")) {
      throw new Error("Administrator Timeline access is required.");
    }
    return user;
  }

  function withLock_(callback) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error("Timeline is busy. Please try again.");
    try { return callback(); } finally { lock.releaseLock(); }
  }

  function openSource_() {
    const config = SourceRegistryService.getSourceConfig("timeline");
    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = spreadsheet.getSheetByName(config.sheetName) || spreadsheet.getSheets()[0];
    const values = sheet.getDataRange().getDisplayValues();
    const headerRowIndex = findHeaderRowIndex_(values);
    return { spreadsheet, sheet, values, headerRowIndex, headerRow: headerRowIndex + 1, headers: (values[headerRowIndex] || []).map(value => String(value || "").trim()) };
  }

  function ensureCommandHeadings_(source) {
    [["eventId", "Event ID"], ["status", "Status"]].forEach(item => {
      if (findIndex_(source.headers, FIELDS[item[0]]) >= 0) return;
      const column = source.headers.length + 1;
      source.sheet.getRange(source.headerRow, column).setValue(item[1]);
      source.headers.push(item[1]);
    });
  }

  function buildIndexes_(headers) {
    const indexes = {};
    Object.keys(FIELDS).forEach(field => { indexes[field] = findIndex_(headers, FIELDS[field]); });
    return indexes;
  }

  function findIndex_(headers, aliases) {
    const normalised = (headers || []).map(EntityModelService.normaliseKey);
    for (const alias of aliases || []) {
      const index = normalised.indexOf(EntityModelService.normaliseKey(alias));
      if (index >= 0) return index;
    }
    return -1;
  }

  function findHeaderRowIndex_(values) {
    const maxRows = Math.min((values || []).length, 20);
    for (let index = 0; index < maxRows; index++) {
      const row = values[index] || [];
      if (findIndex_(row, FIELDS.date) >= 0 && (findIndex_(row, FIELDS.title) >= 0 || findIndex_(row, FIELDS.venue) >= 0)) return index;
    }
    throw new Error("Timeline headings could not be located.");
  }

  function assertCurrent_(source, rowNumber, input) {
    if (rowNumber <= source.headerRow || rowNumber > source.sheet.getLastRow()) throw new Error("Timeline event no longer exists.");
    const row = source.sheet.getRange(rowNumber, 1, 1, Math.max(source.headers.length, source.sheet.getLastColumn())).getDisplayValues()[0];
    const currentFingerprint = fingerprint_(row);
    if (input.fingerprint && input.fingerprint !== currentFingerprint) throw new Error("Timeline event changed since it was opened. Refresh before saving.");
    const indexes = buildIndexes_(source.headers);
    const currentId = indexes.eventId >= 0 ? String(row[indexes.eventId] || "").trim() : "";
    if (input.eventId && currentId && input.eventId !== currentId) throw new Error("Timeline Event ID no longer matches this row.");
  }

  function writeEvent_(sheet, rowNumber, indexes, input) {
    const values = {
      eventId: input.eventId,
      area: cellText_(input.area),
      date: input.dateValue,
      start: cellText_(input.start),
      finish: cellText_(input.finish),
      title: cellText_(input.title),
      venue: cellText_(input.venue),
      categories: cellText_(join_(input.categories)),
      schoolGroups: cellText_(join_(input.schoolGroups)),
      studentGroups: cellText_(join_(input.studentGroups)),
      individualStudents: cellText_(join_(input.individualStudents)),
      staff: cellText_(join_(input.staff)),
      notes: cellText_(input.notes),
      status: input.status || "Active"
    };
    Object.keys(values).forEach(field => {
      const index = indexes[field];
      if (index >= 0) sheet.getRange(rowNumber, index + 1).setValue(values[field] === undefined ? "" : values[field]);
    });
  }

  function readEvent_(source, rowNumber, indexes) {
    const row = source.sheet.getRange(rowNumber, 1, 1, Math.max(source.headers.length, source.sheet.getLastColumn())).getDisplayValues()[0];
    const value = field => indexes[field] >= 0 ? String(row[indexes[field]] || "").trim() : "";
    return {
      eventId: value("eventId"), sourceRow: rowNumber, fingerprint: fingerprint_(row), area: value("area"),
      date: value("date"), start: value("start"), finish: value("finish"), title: value("title"), venue: value("venue"),
      categories: list_(value("categories")), schoolGroups: list_(value("schoolGroups")), studentGroups: list_(value("studentGroups")),
      individualStudents: list_(value("individualStudents")), staff: list_(value("staff")), notes: value("notes"), status: value("status") || "Active"
    };
  }

  function normaliseCommand_(command) {
    const value = command || {};
    return {
      eventId: String(value.eventId || "").trim(), sourceRow: Number(value.sourceRow) || 0, fingerprint: String(value.fingerprint || "").trim(),
      area: clean_(value.area), date: clean_(value.date), dateValue: parseDate_(value.date), start: clean_(value.start), finish: clean_(value.finish),
      title: clean_(value.title || value.eventName), venue: clean_(value.venue), categories: list_(value.categories), schoolGroups: list_(value.schoolGroups),
      studentGroups: list_(value.studentGroups), individualStudents: list_(value.individualStudents), staff: list_(value.staff), notes: clean_(value.notes), status: clean_(value.status)
    };
  }

  function validate_(input) {
    if (!input.title) throw new Error("Event name is required.");
    if (!input.dateValue) throw new Error("A valid event date is required.");
    if (input.title.length > 250 || input.notes.length > 2000) throw new Error("Timeline text exceeds the supported length.");
  }

  function parseDate_(value) {
    if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
    const text = String(value || "").trim();
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) return validDate_(Number(match[1]), Number(match[2]), Number(match[3]));
    match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (match) { let year = Number(match[3]); if (year < 100) year += 2000; return validDate_(year, Number(match[2]), Number(match[1])); }
    const parsed = new Date(text);
    return isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
  }

  function validDate_(year, month, day) {
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  function createEventId_() { return "EVT-" + Utilities.getUuid().replace(/-/g, "").slice(0, 16).toUpperCase(); }
  function clean_(value) { return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim(); }
  function cellText_(value) { const text = String(value || ""); return /^[=+@]/.test(text) || /^-\D/.test(text) ? "'" + text : text; }
  function list_(value) { return Array.isArray(value) ? value.map(clean_).filter(Boolean).slice(0, 100) : String(value || "").split(/[,;\n]+/).map(clean_).filter(Boolean).slice(0, 100); }
  function join_(value) { return list_(value).join("\n"); }
  function fingerprint_(row) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(row || []))).replace(/=+$/, "").slice(0, 24); }
  function result_(action, event) { return { ok: true, action, generatedAt: new Date().toISOString(), event }; }

  return { save, duplicate, setStatus };
})();
