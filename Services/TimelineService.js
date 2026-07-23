const TimelineService = (() => {
  function getDashboardSummary() {
    return buildDashboardSummary_(getTimelineEvents({ upcomingOnly: true, limit: 12, rehearsalsOnly: true }), "Connected");
  }

  /**
   * Dashboard first paint is cache-only. Opening Calendar/Operations performs
   * the authoritative Timeline load and warms this projection for later visits.
   */
  function getDashboardSummaryFast() {
    const cached = RehearsalService.peek();
    if (!Array.isArray(cached)) return buildDashboardSummary_([], "Timeline loads when Calendar is opened");
    const rehearsals = timelineEventsFrom_(cached, { upcomingOnly: true, limit: 12, rehearsalsOnly: true });
    return buildDashboardSummary_(rehearsals, rehearsals.length ? "Connected · cached" : "No upcoming rehearsals");
  }

  function buildDashboardSummary_(rehearsals, status) {
    const todayKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    return {
      upcomingRehearsals: rehearsals,
      todaysRehearsals: rehearsals.filter(rehearsal => rehearsal.dateKey === todayKey),
      allEvents: rehearsals,
      status: status || (rehearsals.length ? "Connected" : "No timeline records loaded"),
      lastRefreshed: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM h:mma")
    };
  }

  function getTimelineEvents(options) {
    const opts = options || {};
    let rehearsals = [];

    try {
      rehearsals = RehearsalService.getAll();
    } catch (err) {
      Logger.log("TimelineService.getTimelineEvents failed: " + (err && err.message ? err.message : err));
      throw new Error("Timeline data is unavailable: " + (err && err.message ? err.message : String(err)));
    }

    return timelineEventsFrom_(rehearsals, opts);
  }

  function timelineEventsFrom_(rehearsals, opts) {
    let events = (rehearsals || []).map(normaliseTimelineEvent_).filter(event => event.status !== "Archived");
    if (!canViewOperationalEvents_()) events = events.filter(event => event.eventType === "Rehearsal");
    if (opts.rehearsalsOnly) events = events.filter(event => event.eventType === "Rehearsal");
    if (opts.upcomingOnly) {
      const todayKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
      events = events.filter(event => event.dateKey && event.dateKey >= todayKey);
    }
    events.sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)) || String(a.start).localeCompare(String(b.start)));
    if (opts.limit) events = events.slice(0, opts.limit);
    return events;
  }

  function getCalendarData(options) {
    const opts = options || {};
    const canViewOperational = canViewOperationalEvents_();
    const events = getTimelineEvents(opts).filter(event =>
      event.eventType === "Rehearsal" || canViewOperational
    );

    return {
      source: "Timeline · Operation Schedule",
      generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM h:mma"),
      canViewOperational,
      events: RelationshipService.linkAttendanceSessions(events)
    };
  }

  function normaliseTimelineEvent_(rehearsal) {
    const title = rehearsal.event || rehearsal.title || "Rehearsal";

    return EntityModelService.timelineEvent({
      id: rehearsal.id,
      eventId: rehearsal.eventId,
      persistentEventId: rehearsal.eventId || "",
      eventIdSource: rehearsal.eventId ? "Timeline" : "Derived",
      legacyIds: rehearsal.legacyIds || [],
      title,
      event: title,
      date: rehearsal.date || rehearsal.dateDisplay || "",
      dateDisplay: rehearsal.dateDisplay || rehearsal.date || "",
      dateKey: rehearsal.dateKey || "",
      start: rehearsal.start || "",
      finish: rehearsal.finish || "",
      venue: rehearsal.venue || "",
      area: rehearsal.area || "",
      type: rehearsal.type || rehearsal.status || "Rehearsal",
      rehearsalType: rehearsal.type || "Rehearsal",
      eventType: rehearsal.eventType || (rehearsal.isOperational ? "Operational Event" : "Rehearsal"),
      isRehearsal: rehearsal.eventType !== "Operational Event",
      isOperational: rehearsal.eventType === "Operational Event",
      categories: rehearsal.categories || [],
      schoolGroups: rehearsal.schoolGroups || [],
      studentGroups: rehearsal.studentGroups || [],
      individualStudents: rehearsal.individualStudents || [],
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
      fingerprint: rehearsal.fingerprint || "",
      notes: rehearsal.notes || "",
      source: "Timeline"
    });
  }

  function canViewOperationalEvents_() {
    return UserContextService.hasCapability("Calendar.Operational.View");
  }

  return {
    getDashboardSummary,
    getDashboardSummaryFast,
    getTimelineEvents,
    getCalendarData
  };
})();
