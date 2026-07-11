const TimelineService = (() => {
  function getDashboardSummary() {
    const rehearsals = getTimelineEvents({ upcomingOnly: true, limit: 12 });
    const todayKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    return {
      upcomingRehearsals: rehearsals,
      todaysRehearsals: rehearsals.filter(rehearsal => rehearsal.dateKey === todayKey),
      allEvents: rehearsals,
      status: rehearsals.length ? "Connected" : "No timeline records loaded",
      lastRefreshed: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM h:mma")
    };
  }

  function getTimelineEvents(options) {
    const opts = options || {};
    let rehearsals = [];

    try {
      rehearsals = opts.upcomingOnly
        ? RehearsalService.next(opts.limit || 50)
        : RehearsalService.getAll();
    } catch (err) {
      Logger.log("TimelineService.getTimelineEvents failed: " + (err && err.message ? err.message : err));
      rehearsals = getMockRehearsals_();
    }

    return rehearsals.map(normaliseTimelineEvent_);
  }

  function getCalendarData(options) {
    const events = getTimelineEvents(options);

    return {
      source: events.some(event => event.source === "Timeline") ? "TimelineService/RehearsalService" : "Placeholder timeline data",
      generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM h:mma"),
      events
    };
  }

  function normaliseTimelineEvent_(rehearsal) {
    const title = rehearsal.event || rehearsal.title || "Rehearsal";

    return {
      id: rehearsal.id || `timeline-${rehearsal.sourceRow || title}`,
      title,
      event: title,
      date: rehearsal.date || rehearsal.dateDisplay || "",
      dateKey: rehearsal.dateKey || "",
      start: rehearsal.start || "",
      finish: rehearsal.finish || "",
      venue: rehearsal.venue || "",
      type: rehearsal.type || rehearsal.status || "Rehearsal",
      rehearsalType: rehearsal.type || "Rehearsal",
      groups: rehearsal.items || [],
      items: rehearsal.items || [],
      participants: rehearsal.participants || null,
      schools: rehearsal.schools || null,
      staff: rehearsal.staff || [],
      allocatedStaffCount: (rehearsal.staff || []).length,
      attendanceEvent: {
        sheet: rehearsal.attendanceSheet || null,
        status: rehearsal.attendanceStatus || null,
        participantCount: rehearsal.participantCount || null,
        markedCount: rehearsal.markedCount || null,
        outstandingCount: rehearsal.outstandingCount || null,
        lastUpdated: rehearsal.attendanceLastUpdated || null
      },
      attendanceStatus: rehearsal.attendanceStatus || "Not connected",
      status: rehearsal.status || "Upcoming",
      colour: rehearsal.colour || "#2d67b2",
      sourceRow: rehearsal.sourceRow || "",
      source: rehearsal.sourceRow ? "Timeline" : "Placeholder",
      raw: rehearsal.raw || {}
    };
  }

  function getMockRehearsals_() {
    const timeZone = Session.getScriptTimeZone();
    const today = new Date();

    return [0, 3, 8].map((offset, index) => {
      const date = new Date(today.getTime());
      date.setDate(today.getDate() + offset);

      return {
        id: `mock-rehearsal-${index + 1}`,
        dateKey: Utilities.formatDate(date, timeZone, "yyyy-MM-dd"),
        date: Utilities.formatDate(date, timeZone, "EEE, d MMM"),
        venue: ["Sydney Olympic Park", "Qudos Bank Arena", "ICC Sydney"][index],
        event: ["Featured artists rehearsal", "Mass dance rehearsal", "Combined choir call"][index],
        status: offset === 0 ? "Today" : "Upcoming"
      };
    });
  }

  return {
    getDashboardSummary,
    getTimelineEvents,
    getCalendarData
  };
})();
