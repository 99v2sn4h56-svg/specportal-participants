const RehearsalService = (() => {
  // V6 uses the shared compressed/chunked cache. The Timeline projection now
  // exceeds CacheService's single-value limit, so the former 80 KB guard made
  // every dashboard request reread the complete spreadsheet.
  const CACHE_KEY = "timeline:events:v6";
  const CACHE_SECONDS = 30 * 60;

  function getAll() {
    return PerformanceCacheService.getOrLoad(CACHE_KEY, CACHE_SECONDS, loadTimeline_, { leaseSeconds: 90, lockWaitMs: 8000 });
  }

  function refresh() {
    invalidate();
    return getAll();
  }

  /** Cache-only first-paint path. Never reads the Timeline spreadsheet. */
  function peek() {
    const cached = PerformanceCacheService.peek(CACHE_KEY);
    if (Array.isArray(cached)) return cached;
    // One-release compatibility while V5 entries naturally expire.
    try {
      const legacy = CacheService.getScriptCache().get("SPEC_TIMELINE_EVENTS_V5");
      return legacy ? JSON.parse(legacy) : null;
    } catch (_) { return null; }
  }

  function invalidate() {
    PerformanceCacheService.remove(CACHE_KEY);
    CacheService.getScriptCache().removeAll(["SPEC_TIMELINE_EVENTS_V3", "SPEC_TIMELINE_EVENTS_V4", "SPEC_TIMELINE_EVENTS_V5"]);
  }

  function byDate(dateValue) {
    const target = normaliseText_(dateValue);
    if (!target) return [];

    return getAll().filter(rehearsal =>
      normaliseText_(rehearsal.date) === target ||
      normaliseText_(rehearsal.dateDisplay) === target
    );
  }

  function byVenue(venue) {
    const target = normaliseText_(venue);
    if (!target) return [];

    return getAll().filter(rehearsal =>
      normaliseText_(rehearsal.venue).includes(target)
    );
  }

  function byText(searchText) {
    const target = normaliseText_(searchText);
    if (!target) return [];

    return getAll().filter(rehearsal =>
      normaliseText_([
        rehearsal.title,
        rehearsal.details,
        rehearsal.venue,
        rehearsal.type,
        rehearsal.notes
      ].join(" ")).includes(target)
    );
  }

  function today() {
    const todayDate = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );

    return getAll().filter(rehearsal => rehearsal.dateKey === todayDate);
  }

  function next(limit) {
    const todayDate = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );

    return getAll()
      .filter(rehearsal => rehearsal.dateKey && rehearsal.dateKey >= todayDate)
      .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)) || String(a.start).localeCompare(String(b.start)))
      .slice(0, limit || 10);
  }

  function byItem(item) {
    const target = normaliseText_(item);
    if (!target) return [];

    return getAll().filter(rehearsal =>
      rehearsal.items.some(rehearsalItem => normaliseText_(rehearsalItem) === target) ||
      normaliseText_(rehearsal.details).includes(target) ||
      normaliseText_(rehearsal.title).includes(target)
    );
  }

  function loadTimeline_() {
    const source = SourceRegistryService.getSourceConfig("timeline");
    const ss = SpreadsheetApp.openById(source.spreadsheetId);
    const sheet = ss.getSheets().find(item => item.getSheetId() === Number(source.sheetId)) || ss.getSheetByName(source.sheetName);
    if (!sheet) throw new Error("Configured Timeline sheet was not found.");
    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      return [];
    }

    const headerRowIndex = findHeaderRowIndex_(values);
    const headers = values[headerRowIndex].map(header => String(header || "").trim());
    const body = values.slice(headerRowIndex + 1);

    return body
      .filter(row => row.some(cell => String(cell || "").trim() !== ""))
      .map((row, index) => buildRehearsal_(headers, row, headerRowIndex + index + 2))
      .filter(rehearsal => rehearsal.dateDisplay || rehearsal.title || rehearsal.details || rehearsal.venue);
  }

  function findHeaderRowIndex_(values) {
    const maxRows = Math.min(values.length, 12);

    for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
      const headers = values[rowIndex].map(header => EntityModelService.normaliseKey(header));
      const hasDate = EntityModelService.findHeaderIndex(headers, ["date", "dates", "event date", "event dates", "rehearsal date", "start date", "scheduled date", "schedule date", "date time", "date/time", "day date", "day/date", "when"]) >= 0;
      const hasEvent = EntityModelService.findHeaderIndex(headers, ["activity", "title", "event", "event name", "session", "rehearsal", "name", "details", "item", "items"]) >= 0;
      const hasVenue = EntityModelService.findHeaderIndex(headers, ["location", "venue", "location/venue", "venue location", "where"]) >= 0;

      if (hasDate && (hasEvent || hasVenue)) return rowIndex;
    }

    return 0;
  }

  // getValues() (unlike getDisplayValues()) returns raw typed cells -- a
  // Date-typed date/time cell would otherwise stringify to its full JS
  // toString() dump. Reconstructs display text matching getDisplayValues()'s
  // output closely enough for parseTimelineDate_'s existing string parser
  // (day-first, e.g. "15/01/2026") and for direct display to users.
  function stringifyTimelineCell_(value) {
    if (value === null || value === undefined || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      const timeZone = Session.getScriptTimeZone();
      const isEpochDate = value.getFullYear() === 1899;
      const hasTimeComponent = value.getHours() || value.getMinutes() || value.getSeconds();
      if (isEpochDate) return hasTimeComponent ? Utilities.formatDate(value, timeZone, "h:mm a") : "";
      return Utilities.formatDate(value, timeZone, hasTimeComponent ? "d/MM/yyyy h:mm a" : "d/MM/yyyy");
    }
    return String(value).trim();
  }

  function buildRehearsal_(headers, row, rowNumber) {
    const raw = {};

    headers.forEach((header, index) => {
      if (header) {
        raw[header] = stringifyTimelineCell_(row[index]);
      }
    });

    const dateDisplay = getFirstValue_(raw, [
      "Date",
      "DATE",
      "Event Date",
      "Event Dates",
      "Rehearsal Date",
      "Start Date",
      "Scheduled Date",
      "Schedule Date",
      "Date / Time",
      "Date/Time",
      "Dates",
      "When",
      "Day / Date",
      "Day/Date"
    ]);
    const eventId = getFirstValue_(raw, ["Event ID", "Event Id", "Timeline ID"]);

    const title = getFirstValue_(raw, [
      "Activity",
      "Title",
      "Event",
      "Event Name",
      "Session",
      "Rehearsal",
      "Name",
      "Details"
    ]) || "Timeline event";

    const details = getFirstValue_(raw, [
      "Details",
      "Detail",
      "Item",
      "Items",
      "Description",
      "Notes"
    ]);

    const area = getFirstValue_(raw, ["Area", "Department", "Team"]);

    const venue = getFirstValue_(raw, [
      "Location",
      "Venue",
      "Location/Venue",
      "Venue / Location",
      "Where"
    ]);

    const start = getFirstValue_(raw, [
      "Start Time",
      "Start",
      "From",
      "Time",
      "Event Time"
    ]);

    const finish = getFirstValue_(raw, [
      "Finish Time",
      "Finish",
      "End",
      "To"
    ]);

    const notes = getFirstValue_(raw, [
      "Notes",
      "Note",
      "Comments",
      "Comment"
    ]);
    const status = getFirstValue_(raw, ["Status", "Event Status", "Timeline Status"]) || "Active";

    const categories = parseItems_(getFirstValue_(raw, [
      "Categories", "Category", "Individual", "Event Categories", "Category Selection"
    ]));
    const schoolGroups = parseItems_(getFirstValue_(raw, ["School Groups"]));
    const studentGroups = parseItems_(getFirstValue_(raw, [
      "Indv. Student Groups", "Individual Student Groups"
    ]));
    const individualStudents = parseItems_(getFirstValue_(raw, [
      "Indv. Students", "Individual Students"
    ]));
    const staff = parseItems_(getFirstValue_(raw, ["Staff", "Allocated Staff", "Team"]));
    const isRehearsal = [categories, schoolGroups, studentGroups, individualStudents]
      .some(selection => selection.length > 0);
    const eventType = isRehearsal ? "Rehearsal" : "Operational Event";

    const type = isRehearsal ? inferType_([title, details, venue].join(" ")) : "Operational Event";
    const dateKey = buildDateKey_(dateDisplay);

    return EntityModelService.timelineEvent({
      eventId,
      legacyIds: [`TIMELINE-${rowNumber}`, `REH-${rowNumber}`],
      sourceRow: rowNumber,
      fingerprint: fingerprint_(row),
      dateDisplay,
      dateKey,
      day: inferDay_(dateDisplay),
      area,
      start,
      finish,
      venue,
      title,
      details,
      type,
      eventType,
      isRehearsal,
      isOperational: !isRehearsal,
      status,
      notes,
      colour: colourForType_(type),
      categories,
      schoolGroups,
      studentGroups,
      individualStudents,
      items: categories.concat(schoolGroups, studentGroups),
      participants: [],
      staff
    });
  }

  function getFirstValue_(raw, possibleHeaders) {
    const keys = Object.keys(raw);
    const aliases = possibleHeaders.map(EntityModelService.normaliseKey);
    for (const key of keys) {
      if (aliases.includes(EntityModelService.normaliseKey(key)) && raw[key]) {
        return String(raw[key]).trim();
      }
    }
    return "";
  }

  function normaliseText_(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildDateKey_(dateDisplay) {
    const parsed = parseTimelineDate_(dateDisplay);

    return parsed
      ? Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd")
      : "";
  }

  function parseTimelineDate_(dateDisplay) {
    if (Object.prototype.toString.call(dateDisplay) === "[object Date]" && !isNaN(dateDisplay.getTime())) return dateDisplay;
    const text = String(dateDisplay || "")
      .replace(/\u00a0/g, " ")
      .replace(/[，]/g, ",")
      .replace(/[‐‑‒–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return null;

    const withoutDay = text.replace(/^(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?[,]?\s+/i, "");
    const iso = withoutDay.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (iso) return createCalendarDate_(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

    let match = withoutDay.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s/.-]+([a-z]{3,9}|\d{1,2})(?:[\s,./-]+(\d{2,4}))?$/i);
    let day = match ? Number(match[1]) : 0;
    let month = match ? parseMonth_(match[2]) : -1;
    let suppliedYear = match && match[3] ? normaliseYear_(match[3]) : 0;
    if (!match) {
      match = withoutDay.match(/^([a-z]{3,9})[\s,.-]+(\d{1,2})(?:st|nd|rd|th)?(?:[\s,./-]+(\d{2,4}))?$/i);
      month = match ? parseMonth_(match[1]) : -1;
      day = match ? Number(match[2]) : 0;
      suppliedYear = match && match[3] ? normaliseYear_(match[3]) : 0;
    }
    if (!match || !day || month < 0) return null;

    const weekday = weekdayIndex_(text);
    const year = suppliedYear || inferTimelineYear_(month, day, weekday);
    const date = createCalendarDate_(year, month, day);
    return date;
  }

  function inferTimelineYear_(month, day, weekday) {
    const configured = configuredTimelineYear_();
    const currentYear = new Date().getFullYear();
    if (weekday < 0) return configured || currentYear;
    const configuredDate = configured ? createCalendarDate_(configured, month, day) : null;
    if (configuredDate && configuredDate.getDay() === weekday) return configured;
    const candidates = [];
    [configured, currentYear - 1, currentYear, currentYear + 1, currentYear + 2].filter(Boolean).forEach(year => {
      if (!candidates.includes(year) && createCalendarDate_(year, month, day) && createCalendarDate_(year, month, day).getDay() === weekday) candidates.push(year);
    });
    if (!candidates.length) return configured || currentYear;
    return candidates.sort((a, b) => Math.abs(a - currentYear) - Math.abs(b - currentYear) || b - a)[0];
  }

  function configuredTimelineYear_() {
    try {
      const properties = PropertiesService.getScriptProperties();
      return normaliseYear_(properties.getProperty("SPEC_TIMELINE_YEAR") || properties.getProperty("SPEC_PRODUCTION_YEAR"));
    } catch (_) { return 0; }
  }

  function weekdayIndex_(value) {
    const match = String(value || "").match(/^(sun|mon|tue|wed|thu|fri|sat)(?:day)?\b/i);
    return match ? ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(match[1].slice(0, 3).toLowerCase()) : -1;
  }

  function createCalendarDate_(year, month, day) {
    if (!year || month < 0 || month > 11 || day < 1 || day > 31) return null;
    const date = new Date(year, month, day, 12, 0, 0, 0);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
  }

  function parseMonth_(value) {
    const text = String(value || "").toLowerCase();
    if (/^\d+$/.test(text)) return Number(text) - 1;

    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return months.findIndex(month => text.indexOf(month) === 0);
  }

  function normaliseYear_(value) {
    const year = Number(value);
    if (!year) return 0;
    return year < 100 ? 2000 + year : year;
  }

  function inferDay_(dateDisplay) {
    const text = String(dateDisplay || "").trim();
    const match = text.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i);
    return match ? match[0] : "";
  }

  function inferType_(text) {
    const value = normaliseText_(text);

    if (value.includes("dress")) return "Dress Rehearsal";
    if (value.includes("tech")) return "Technical Rehearsal";
    if (value.includes("combined")) return "Combined Rehearsal";
    if (value.includes("qudos") || value.includes("arena")) return "Arena Rehearsal";
    if (value.includes("netball")) return "Netball Central Rehearsal";
    if (value.includes("dance")) return "Dance Rehearsal";
    if (value.includes("choir") || value.includes("vocal")) return "Choir / Vocal Rehearsal";
    if (value.includes("band") || value.includes("orchestra")) return "Band / Orchestra Rehearsal";
    if (value.includes("drama")) return "Drama Rehearsal";
    if (value.includes("circus")) return "Circus Rehearsal";
    if (value.includes("meeting")) return "Meeting";

    return "Rehearsal";
  }

  function parseItems_(value) {
    return String(value || "")
      .split(/[,;\n]+/)
      .map(item => item.replace(/^[\s"'(]*(?:item\s*)?(?:\d+\s*)?[a-z]?\s*[\).:\-–—]\s*/i, ""))
      .map(item => item.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  function colourForType_(type) {
    const value = normaliseText_(type);

    if (value.includes("operational")) return "#475569";
    if (value.includes("dress")) return "#bb529e";
    if (value.includes("technical")) return "#f79420";
    if (value.includes("arena")) return "#2d67b2";
    if (value.includes("dance")) return "#44c2f0";
    if (value.includes("choir") || value.includes("vocal")) return "#9dd085";
    if (value.includes("band") || value.includes("orchestra")) return "#fbcc39";
    if (value.includes("drama")) return "#ef509c";
    if (value.includes("circus")) return "#ef4343";

    return "#667085";
  }

  function fingerprint_(row) {
    return Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(row || []))
    ).replace(/=+$/, "").slice(0, 24);
  }

  return {
    getAll,
    peek,
    invalidate,
    refresh,
    byDate,
    byVenue,
    byText,
    today,
    next,
    byItem,
    _test: { parseTimelineDate: parseTimelineDate_, buildDateKey: buildDateKey_, inferTimelineYear: inferTimelineYear_ }
  };
})();
