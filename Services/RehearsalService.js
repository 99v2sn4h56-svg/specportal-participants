const RehearsalService = (() => {
  const TIMELINE_ID = "1JccmwT9_wOEhuSU5kyFH6HnU9T9ysfQa87XjvL5WLog";
  const TIMELINE_SHEET_NAME = "Operation Schedule";
  const CACHE_KEY = "SPEC_REHEARSALS_V1";
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

    const headers = values.shift().map(header => String(header || "").trim());

    return values
      .filter(row => row.some(cell => String(cell || "").trim() !== ""))
      .map((row, index) => buildRehearsal_(headers, row, index + 2))
      .filter(rehearsal => rehearsal.dateDisplay || rehearsal.title || rehearsal.details || rehearsal.venue);
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

    return {
      id: `REH-${rowNumber}`,
      sourceRow: rowNumber,
      dateDisplay,
      dateKey: buildDateKey_(dateDisplay),
      day: inferDay_(dateDisplay),
      start,
      finish,
      venue,
      title,
      details,
      type,
      notes,
      colour: colourForType_(type),
      items: [],
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

  function buildDateKey_(dateDisplay) {
    if (!dateDisplay) return "";

    const parsed = new Date(dateDisplay);

    if (Object.prototype.toString.call(parsed) === "[object Date]" && !isNaN(parsed.getTime())) {
      return Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }

    return "";
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