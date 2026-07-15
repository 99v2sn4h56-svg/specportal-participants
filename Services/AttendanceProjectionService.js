/** Slim active-Attendance read model; no participant rows or historical rolls. */
const AttendanceProjectionService = (() => {
  const FRESH_SECONDS = 2 * 60, RETAIN_SECONDS = 15 * 60;

  function getActive(options) {
    const user = UserContextService.getCurrent();
    if (!AuthorizationService.hasCapability(user, "Attendance.View")) throw new Error("Attendance.View is required.");
    const key = key_(), started = Date.now();
    const cached = PerformanceCacheService.getOrLoadStaleWhileRevalidate(key, FRESH_SECONDS, RETAIN_SECONDS, build_, Object.assign({}, options || {}, { validator: value => ProjectionContractService.validate("activeAttendance", value) }));
    const response = Object.assign({}, cached.value, { requestMeta: { cache: cached.meta.cache, cacheStatus: cached.meta.cacheStatus, isStale: !!cached.meta.isStale, generatedAt: cached.meta.generatedAt || cached.value.generatedAt, expiresAt: cached.meta.expiresAt || "", durationMs: cached.meta.durationMs, payloadBytes: bytes_(cached.value) } });
    PerformanceTelemetryService.record("attendance.active.request", Date.now() - started, { cache: cached.meta.cache, records: response.events.length, payloadBytes: bytes_(response), projection: "attendance-active-v1", isStale: !!cached.meta.isStale });
    return response;
  }

  function peek() {
    const value = PerformanceCacheService.peek(key_());
    return value ? Object.assign({}, value, { cacheOnly: true }) : { events: [], summary: {}, status: "Not warmed", generatedAt: "", projection: ProjectionContractService.contract("activeAttendance").version, cacheOnly: true };
  }

  function warm() { return getActive({ refresh: true }); }
  function invalidate() { PropertiesService.getScriptProperties().setProperty("SC_ATTENDANCE_PROJECTION_EPOCH", String(Date.now())); }

  function build_() {
    const summaryResponse = AttendanceService.getSummary(), eventsResponse = AttendanceService.getEvents(), today = dateKey_(new Date());
    const events = eventsResponse && eventsResponse.ok && Array.isArray(eventsResponse.data) ? eventsResponse.data.filter(event => !event.dateKey || event.dateKey >= today).slice(0, 30).map(event => ({
      sessionId: event.sessionId || "", date: event.date || "", dateKey: event.dateKey || "", time: event.time || "", eventName: event.eventName || "", location: event.location || "", categories: event.categories || "", studentCount: event.studentCount || "", attendanceCounts: event.attendanceCounts || { total: 0, byStatus: {} }
    })) : [];
    const sourceSummary = summaryResponse && summaryResponse.ok ? summaryResponse.data || {} : {};
    const response = {
      events,
      summary: { totalEvents: Number(sourceSummary.totalEvents) || 0, upcomingEvents: Number(sourceSummary.upcomingEvents) || 0, countsByStatus: sourceSummary.countsByStatus || {}, lastUpdated: sourceSummary.lastUpdated || "" },
      status: summaryResponse && summaryResponse.ok && eventsResponse && eventsResponse.ok ? "Connected" : "Degraded",
      generatedAt: new Date().toISOString(), sourceUpdatedAt: sourceSummary.lastUpdated || "",
      projection: ProjectionContractService.contract("activeAttendance").version
    };
    ProjectionContractService.validate("activeAttendance", response);
    return response;
  }
  function key_() { return ProjectionContractService.cacheKey("activeAttendance", { range: "active" }, null); }
  function dateKey_(date) { return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd"); }
  function bytes_(value) { try { return JSON.stringify(value || {}).length; } catch (_) { return 0; } }
  return { getActive, peek, warm, invalidate };
})();
