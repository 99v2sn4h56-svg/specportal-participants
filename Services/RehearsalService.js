const RehearsalService = (() => {
  const TIMELINE_ID = "1JccmwT9_wOEhuSU5kyFH6HnU9T9ysfQa87XjvL5WLog";
  const TIMELINE_SHEET_NAME = "Operation Schedule";
  const CACHE_KEY = "SPEC_REHEARSALS_V2";
  const CACHE_HOURS = 6;

  function getAll() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(CACHE_KEY);

    if (cached) {
      return JSON.parse(cached);
    }

    const rehearsals = loadTimeline_();

    cache.put(
      CACHE_KEY,
      JSON.stringify(rehearsals),
      CACHE_HOURS * 60 * 60
    );

    return rehearsals;
  }

  function refresh() {
    CacheService.getScriptCache().remove(CACHE_KEY);
    return getAll();
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
    const ss = SpreadsheetApp.openById(TIMELINE_ID);
    const sheet = ss.getSheetByName(TIMELINE_SHEET_NAME) || ss.getSheets()[0];
    const values = sheet.getDataRange().getDisplayValues();

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
      const headers = values[rowIndex].map(header => normaliseHeader_(header));
      const hasDate = headers.some(header => ["date", "rehearsal date", "day date", "day/date"].includes(header));
      const hasEvent = headers.some(header => ["activity", "title", "event", "rehearsal", "name", "details", "item", "items"].includes(header));
      const hasVenue = headers.some(header => ["location", "venue", "venue location", "where"].includes(header));

      if (hasDate && (hasEvent || hasVenue)) return rowIndex;
    }

    return 0;
  }

  function buildRehearsal_(headers, row, rowNumber) {
    const raw = {};

    headers.forEach((header, index) => {
      if (header) {
        raw[header] = row[index] || "";
      }
    });

    const dateDisplay = getFirstValue_(raw, [
      "Date",
      "DATE",
      "Rehearsal Date",
      "Day / Date",
      "Day/Date"
    ]);

    const title = getFirstValue_(raw, [
      "Activity",
      "Title",
      "Event",
      "Rehearsal",
      "Name"
    ]);

    const details = getFirstValue_(raw, [
      "Details",
      "Detail",
      "Item",
      "Items",
      "Description",
      "Notes"
    ]);

    const venue = getFirstValue_(raw, [
      "Location",
      "Venue",
      "Venue / Location",
      "Where"
    ]);

    const start = getFirstValue_(raw, [
      "Start Time",
      "Start",
      "From",
      "Time"
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

    const type = inferType_([title, details, venue].join(" "));
    const dateKey = buildDateKey_(dateDisplay);

    return {
      id: `REH-${rowNumber}`,
      sourceRow: rowNumber,
      dateDisplay,
      dateKey,
      day: inferDay_(dateDisplay),
      start,
      finish,
      venue,
      title,
      details,
      type,
      notes,
      colour: colourForType_(type),
      items: parseItems_(details || title),
      participants: [],
      staff: [],
      raw
    };
  }

  function getFirstValue_(raw, possibleHeaders) {
    for (const header of possibleHeaders) {
      if (raw[header]) {
        return String(raw[header]).trim();
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

  function normaliseHeader_(value) {
    return normaliseText_(value)
      .replace(/[^\w/ ]+/g, " ")
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
    const text = String(dateDisplay || "").trim();
    if (!text) return null;

    const hasExplicitYear = /\b\d{4}\b/.test(text) || /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(text);
    const parsed = new Date(text);
    if (hasExplicitYear && Object.prototype.toString.call(parsed) === "[object Date]" && !isNaN(parsed.getTime())) {
      return parsed;
    }

    const currentYear = new Date().getFullYear();
    const withoutDay = text.replace(/^(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?[,]?\s+/i, "");
    const dayMonthMatch = withoutDay.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s/.-]+([a-z]{3,9}|\d{1,2})(?:[\s/.-]+(\d{2,4}))?/i);

    if (!dayMonthMatch) return null;

    const day = Number(dayMonthMatch[1]);
    const month = parseMonth_(dayMonthMatch[2]);
    const year = normaliseYear_(dayMonthMatch[3] || currentYear);
    if (!day || month < 0 || !year) return null;

    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? null : date;
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

  return {
    getAll,
    refresh,
    byDate,
    byVenue,
    byText,
    today,
    next,
    byItem
  };
})();

function testRehearsalService() {
  const data = RehearsalService.refresh();

  Logger.log(`Loaded ${data.length} rehearsals`);

  if (data.length) {
    Logger.log(JSON.stringify(data[0], null, 2));
  }
}
