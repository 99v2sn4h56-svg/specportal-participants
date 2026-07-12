/**
 * Canonical read-only Event Manager aggregation service.
 * Timeline remains authoritative; related services are projected without
 * exposing contact, medical, support-plan or attendance-write information.
 */
const EventManagerService = (() => {
  const SECTIONS = ["overview", "people", "assignments", "staff", "venue", "attendance", "tasks", "communications", "activity", "diagnostics"];

  function getLanding() {
    UserContextService.requireCapability("Operations.View");
    const timeline = TimelineService.getTimelineEvents();
    const attendance = getAttendanceEvents_();
    const events = timeline.map(event => buildSummary_(event, matchAttendance_(event, attendance)));
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const warningCount = events.reduce((sum, event) => sum + event.warnings.length, 0);
    return {
      source: "Timeline · Operation Schedule",
      sourceHealth: "Connected",
      generatedAt: new Date().toISOString(),
      summary: {
        events: events.length,
        today: events.filter(event => event.dateKey === today).length,
        upcoming: events.filter(event => event.dateKey && event.dateKey >= today).length,
        warnings: warningCount,
        attendanceLinked: events.filter(event => event.attendance && event.attendance.linked).length
      },
      filters: buildFilters_(events),
      events,
      permissions: permissionModel_()
    };
  }

  function getWorkspace(eventId, section) {
    UserContextService.requireCapability("Operations.View");
    const target = String(eventId || "");
    const event = TimelineService.getTimelineEvents().find(item => item.id === target || item.eventId === target || (item.legacyIds || []).includes(target));
    if (!event) throw new Error("The requested event is unavailable or inaccessible.");
    const requested = SECTIONS.includes(String(section || "overview")) ? String(section || "overview") : "overview";
    const attendance = matchAttendance_(event, getAttendanceEvents_());
    const impact = requested === "overview" || requested === "people" || requested === "assignments"
      ? RelationshipService.getAffectedParticipantsWithReasons(event.id)
      : { participants: [], unresolvedSelections: [] };
    const workspace = {
      event: buildSummary_(event, attendance),
      participants: [], schools: [], groups: [], items: [], categories: [], staff: [], venue: null,
      attendance: attendance ? safeAttendance_(attendance) : { linked: false, status: "Not linked" },
      tasks: [], communications: [], activity: [], warnings: buildWarnings_(event, attendance, impact.unresolvedSelections),
      permissions: permissionModel_(), editableActions: editableActions_(), diagnostics: null,
      deferred: SECTIONS.filter(name => name !== requested), section: requested, generatedAt: new Date().toISOString()
    };
    if (["overview", "people", "assignments"].includes(requested)) {
      workspace.participants = impact.participants.map(safeParticipant_);
      workspace.schools = unique_(impact.participants.map(item => item.school).filter(Boolean));
      workspace.groups = unique_((event.schoolGroups || []).concat(event.studentGroups || []));
      workspace.items = unique_(impact.participants.map(item => item.item).filter(Boolean));
      workspace.categories = unique_((event.categories || []).concat(impact.participants.map(item => item.category || item.discipline).filter(Boolean)));
    }
    if (requested === "staff" || requested === "overview") workspace.staff = safeStaff_(event.staff || []);
    if (requested === "venue" || requested === "overview") workspace.venue = { name: event.venue || "Not assigned", area: event.area || "", date: event.date || "", start: event.start || "", finish: event.finish || "" };
    if (requested === "tasks") workspace.tasks = tasksForEvent_(event);
    if (requested === "communications") workspace.communications = [{ status: "Unavailable", message: "Communications are not connected to Event Manager." }];
    if (requested === "activity" && UserContextService.hasCapability("Audit.View")) workspace.activity = AuditService.list(100).filter(item => JSON.stringify(item).indexOf(event.id) >= 0 || (event.eventId && JSON.stringify(item).indexOf(event.eventId) >= 0));
    if (requested === "diagnostics" && UserContextService.hasCapability("Administration.View")) workspace.diagnostics = { sourceRow: event.sourceRow || null, eventIdSource: event.eventIdSource || "Derived", fingerprintPresent: !!event.fingerprint, commandMode: "disabled" };
    return workspace;
  }

  function buildSummary_(event, attendance) {
    return {
      id: event.id || "", eventId: event.eventId || "", persistentEventId: event.persistentEventId || "",
      eventIdSource: event.eventIdSource || (event.persistentEventId ? "Timeline" : "Derived"), title: event.title || event.event || "Event",
      date: event.date || "", dateKey: event.dateKey || "", start: event.start || "", finish: event.finish || "",
      venue: event.venue || "", area: event.area || "", eventType: event.eventType || "Event", status: event.status || "Upcoming",
      categories: event.categories || [], schoolGroups: event.schoolGroups || [], studentGroups: event.studentGroups || [],
      individualStudents: event.individualStudents || [], staff: event.staff || [], notes: event.notes || "",
      sourceRow: event.sourceRow || "", attendance: attendance ? safeAttendance_(attendance) : { linked: false, status: "Not linked" },
      warnings: buildWarnings_(event, attendance, [])
    };
  }

  function buildWarnings_(event, attendance, unresolved) {
    const warnings = [];
    if (!event.persistentEventId) warnings.push(warning_("Missing persistent Event ID", "Warning", "This event currently uses a derived compatibility ID."));
    if (!event.dateKey) warnings.push(warning_("Invalid or missing date", "Critical", "The Timeline date could not be normalised."));
    if (!event.venue) warnings.push(warning_("Venue not assigned", "Warning", "Location/Venue is blank."));
    if (event.eventType === "Rehearsal" && !attendance) warnings.push(warning_("Attendance not linked", "Info", "No compatible Attendance session was found."));
    (unresolved || []).forEach(value => warnings.push(warning_("Unresolved participant selection", "Warning", value)));
    return warnings;
  }

  function warning_(title, severity, detail) { return { title, severity, detail }; }
  function getAttendanceEvents_() { try { const result = AttendanceService.getEvents(); return result && result.ok && Array.isArray(result.data) ? result.data : []; } catch (err) { return []; } }
  function matchAttendance_(event, sessions) {
    if (event.eventType !== "Rehearsal") return null;
    return (sessions || []).find(session => {
      if (event.persistentEventId && [session.eventId, session.timelineEventId].filter(Boolean).includes(event.persistentEventId)) return true;
      if (session.dateKey && event.dateKey && session.dateKey !== event.dateKey) return false;
      if (EntityModelService.normaliseKey(session.eventName) !== EntityModelService.normaliseKey(event.title)) return false;
      const a = EntityModelService.normaliseKey(session.location), b = EntityModelService.normaliseKey(event.venue);
      return !a || !b || a === b;
    }) || null;
  }
  function safeAttendance_(session) { return { linked: true, id: session.id || "", sessionId: session.sessionId || "", sheetName: session.sheetName || "", status: session.status || "Connected", studentCount: Number(session.studentCount || (session.attendanceCounts || {}).total) || 0, attendanceCounts: (session.attendanceCounts || {}).byStatus || {}, date: session.date || "", time: session.time || "" }; }
  function safeParticipant_(item) { return { id: item.id || "", studentKey: item.studentKey || "", name: item.name || [item.firstName, item.lastName].filter(Boolean).join(" "), school: item.school || "", item: item.item || "", category: item.category || item.discipline || "", matchReasons: item.matchReasons || [] }; }
  function safeStaff_(names) { const allowed = unique_(names); return allowed.map(name => ({ name, assignment: "Timeline allocation" })); }
  function tasksForEvent_(event) { return TaskService.list().filter(task => task.relatedEvent === event.id || task.relatedEvent === event.eventId || (task.entity && [event.id, event.eventId].includes(task.entity.id))); }
  function editableActions_() { return CommandRegistryService.list().map(item => ({ id: item.id, label: item.label, enabled: false, reason: "Editing is not enabled." })); }
  function permissionModel_() { return { canView: true, canViewDiagnostics: UserContextService.hasCapability("Administration.View"), canEdit: false, commandMode: "disabled" }; }
  function unique_(values) { return Array.from(new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))); }
  function buildFilters_(events) { return { types: unique_(events.map(item => item.eventType)), areas: unique_(events.map(item => item.area)), venues: unique_(events.map(item => item.venue)), categories: unique_(events.flatMap(item => item.categories || [])), groups: unique_(events.flatMap(item => (item.schoolGroups || []).concat(item.studentGroups || []))), staff: unique_(events.flatMap(item => item.staff || [])) }; }
  return { getLanding, getWorkspace };
})();
