/**
 * Permission-filtered Event Manager aggregation service. Timeline remains the
 * authoritative production calendar; EventWorkflowService owns the connected
 * planning overlay. Reads remain projection-only and never mutate a source.
 */
const EventManagerService = (() => {
  const CACHE_VERSION = "EVENT_MANAGER_V2";
  const SECTIONS = ["overview", "workflow", "participants", "schools-groups", "staff", "venue", "risk", "permissions", "attendance", "tasks", "communications", "activity", "diagnostics"];

  function getLanding() {
    const user = UserContextService.requireCapability("Operations.View");
    const started = Date.now();
    const timeline = TimelineService.getTimelineEvents().filter(event => scopeAllowsEvent_(user, event));
    const attendance = UserContextService.hasCapability("Attendance.View") ? getAttendanceEvents_() : [];
    const duplicateIds = duplicatePersistentIds_(timeline);
    let events = timeline.map(event => {
      const relationship = matchAttendance_(event, attendance);
      return buildSummary_(event, relationship, duplicateIds);
    });
    const managed = AuthorizationService.hasCapability(user, "Events.View") ? EventWorkflowService.list() : [];
    managed.forEach(workflow => {
      const matchIndex = events.findIndex(event => workflow.timelineEventId && [event.id, event.eventId, event.persistentEventId].includes(workflow.timelineEventId));
      if (matchIndex >= 0) events[matchIndex] = applyWorkflowSummary_(events[matchIndex], workflow);
      else events.push(EventWorkflowService.toEventSummary(workflow));
    });
    const today = todayKey_();
    return {
      source: "Timeline · Operation Schedule", sourceHealth: "Connected", cacheVersion: CACHE_VERSION,
      generatedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
      summary: {
        today: events.filter(event => event.dateKey === today).length,
        rehearsals: events.filter(event => event.eventType === "Rehearsal").length,
        operationalEvents: events.filter(event => event.eventType === "Operational Event").length,
        attendanceLinked: events.filter(event => event.attendance.linked).length,
        managed: managed.length,
        ready: managed.filter(event => event.readiness && event.readiness.label === "Ready").length,
        requiresAttention: events.filter(event => event.warnings.some(warning => warning.severity === "Critical" || warning.severity === "Warning")).length
      },
      filters: buildFilters_(events), events, permissions: permissionModel_(user)
    };
  }

  function getWorkspace(eventId, section, options) {
    const user = UserContextService.requireCapability("Operations.View");
    const managedReference = AuthorizationService.hasCapability(user, "Events.View") ? EventWorkflowService.getByReference(eventId) : null;
    const managed = managedReference ? EventWorkflowService.get(managedReference.id) : null;
    const event = findEvent_(eventId, user) || (managed ? eventFromManaged_(managed) : null);
    if (!event) throw new Error("The requested event is unavailable or inaccessible.");
    const requested = SECTIONS.includes(String(section || "overview")) ? String(section || "overview") : "overview";
    const attendanceRelationship = UserContextService.hasCapability("Attendance.View") ? matchAttendance_(event, getAttendanceEvents_()) : noAttendance_("permission-restricted");
    const needsImpact = ["overview", "participants", "schools-groups", "diagnostics"].includes(requested) && UserContextService.hasCapability("Participants.View");
    const impact = needsImpact ? (managed ? managedImpact_(managed) : RelationshipService.getAffectedParticipantsWithReasons(event.id)) : { participants: [], unresolvedSelections: [], matchSummary: {} };
    const warnings = buildWarnings_(event, attendanceRelationship, impact.unresolvedSelections, []).concat(managed ? readinessWarnings_(managed) : []);
    const workspace = {
      event: buildSummary_(event, attendanceRelationship, []), participants: [], participantPage: null,
      schools: [], groups: [], items: [], categories: [], staff: [], venue: null,
      attendance: attendanceRelationship.session ? safeAttendance_(attendanceRelationship) : { linked: false, status: "Not linked", matchMethod: attendanceRelationship.method },
      tasks: [], communications: { status: "Unavailable", items: [], message: "Communications are not connected yet." },
      activity: [], warnings, workflow: managed || null, risk: managed && managed.risk || null, permissionWorkflow: managed && managed.permissions || null,
      permissions: permissionModel_(user), editableActions: editableActions_(user, managed), diagnostics: null,
      deferred: SECTIONS.filter(name => name !== requested), section: requested, generatedAt: new Date().toISOString()
    };
    if (["overview", "participants", "schools-groups"].includes(requested)) addImpact_(workspace, impact, options);
    if (requested === "staff" || requested === "overview") workspace.staff = managed ? (managed.participation && managed.participation.staff || []).map(item => ({ id: item.id, name: item.label, source: "Managed roster" })) : staffForEvent_(event.staff || [], user);
    if (requested === "venue" || requested === "overview") workspace.venue = { name: event.venue || "Not assigned", area: event.area || "", date: event.date || "", start: event.start || "", finish: event.finish || "", source: "Timeline" };
    if (requested === "tasks") workspace.tasks = tasksForEvent_(event, attendanceRelationship.session);
    if (requested === "activity" && (UserContextService.hasCapability("Audit.View") || UserContextService.hasCapability("Events.ViewAudit"))) workspace.activity = activityForEvent_(event, attendanceRelationship.session);
    if (requested === "diagnostics" && permissionModel_(user).canViewDiagnostics) workspace.diagnostics = diagnostics_(event, attendanceRelationship, impact, warnings);
    return workspace;
  }

  function applyWorkflowSummary_(summary, workflow) {
    const copy = Object.assign({}, summary, {
      managedEventId: workflow.id,
      workflow: workflow.readiness,
      lifecycleStatus: workflow.status,
      nextAction: workflow.nextAction,
      permissionStatus: workflow.permissions && workflow.permissions.status || "Not started",
      riskStatus: workflow.risk && workflow.risk.status || "Not started"
    });
    copy.warnings = (copy.warnings || []).concat(readinessWarnings_(workflow));
    copy.warningCount = copy.warnings.length;
    copy.attentionState = attentionState_(copy.warnings);
    return copy;
  }

  function eventFromManaged_(workflow) {
    const summary = EventWorkflowService.toEventSummary(workflow);
    return Object.assign({}, summary, {
      event: summary.title,
      id: workflow.id,
      eventId: workflow.id,
      persistentEventId: workflow.timelineEventId || workflow.id,
      dateDisplay: summary.date,
      individualStudents: (workflow.participation && workflow.participation.participants || []).map(item => item.label),
      fingerprint: "managed:" + workflow.id
    });
  }

  function managedImpact_(workflow) {
    const participants = (workflow.participation && workflow.participation.participants || []).map(item => ({ id: item.id, studentKey: item.id, name: item.label, school: item.schoolName || "", item: "", group: "", category: "", matchReasons: ["Managed event roster · stable participant ID"] }));
    return { participants, unresolvedSelections: [], matchSummary: { managedRoster: participants.length } };
  }

  function readinessWarnings_(workflow) {
    return ((workflow.readiness && workflow.readiness.states) ? Object.keys(workflow.readiness.states) : []).filter(key => !["Ready", "Approved", "Prepared"].includes(workflow.readiness.states[key])).map(key => warning_("WORKFLOW_" + key.toUpperCase(), key === "risk" || key === "permission" ? "Warning" : "Info", key.charAt(0).toUpperCase() + key.slice(1) + " needs attention", workflow.readiness.states[key], workflow.id, "Open the managed event workflow", "Event workflow"));
  }

  function addImpact_(workspace, impact, options) {
    const opts = options || {}, page = Math.max(1, Number(opts.page) || 1), pageSize = Math.min(250, Math.max(25, Number(opts.pageSize) || 100));
    const safe = impact.participants.map(safeParticipant_);
    workspace.participantPage = { page, pageSize, total: safe.length, hasMore: page * pageSize < safe.length };
    workspace.participants = safe.slice((page - 1) * pageSize, page * pageSize);
    const schoolCounts = countBy_(safe, "school");
    workspace.schools = Object.keys(schoolCounts).sort().map(name => ({ name, studentCount: schoolCounts[name] }));
    workspace.groups = unique_((workspace.event.schoolGroups || []).concat(workspace.event.studentGroups || []));
    workspace.items = unique_(safe.map(item => item.item));
    workspace.categories = unique_((workspace.event.categories || []).concat(safe.map(item => item.category)));
  }

  function buildSummary_(event, attendanceRelationship, duplicateIds) {
    const attendance = attendanceRelationship.session ? safeAttendance_(attendanceRelationship) : { linked: false, status: "Not linked", matchMethod: attendanceRelationship.method };
    const warnings = buildWarnings_(event, attendanceRelationship, [], duplicateIds || []);
    return {
      id: event.id || "", eventId: event.eventId || "", persistentEventId: event.persistentEventId || "",
      eventIdSource: event.eventIdSource || (event.persistentEventId ? "Timeline" : "Derived"), legacyIds: event.legacyIds || [],
      title: event.title || event.event || "Event", date: event.date || "", dateKey: event.dateKey || "",
      dateStatus: event.dateKey ? "Scheduled" : String(event.dateDisplay || event.date || "").trim() ? "Invalid source date" : "To be confirmed",
      start: event.start || "", finish: event.finish || "",
      venue: event.venue || "", area: event.area || "", segment: event.segment || event.area || "", eventType: event.eventType || "Event", status: event.status || "Active",
      categories: event.categories || [], schoolGroups: event.schoolGroups || [], studentGroups: event.studentGroups || [], individualStudents: event.individualStudents || [],
      items: event.items || [], schools: event.schoolGroups || [], staff: event.staff || [], notes: event.notes || "", sourceRow: event.sourceRow || "", sourceRowValid: Number(event.sourceRow) > 1,
      sourceHealth: "Connected", participantCount: attendance.studentCount || null,
      schoolGroupCount: unique_((event.schoolGroups || []).concat(event.studentGroups || [])).length,
      attendance, warnings, warningCount: warnings.length, attentionState: attentionState_(warnings)
    };
  }

  function buildWarnings_(event, relationship, unresolved, duplicateIds) {
    const warnings = [], entityId = event.id || event.eventId || "";
    if (!event.persistentEventId) warnings.push(warning_("MISSING_EVENT_ID", "Warning", "Missing persistent Event ID", "This event uses a derived compatibility ID; editing must remain unavailable.", entityId, "Add a persistent Event ID in a separately approved migration.", "Timeline"));
    if (event.persistentEventId && (duplicateIds || []).includes(event.persistentEventId)) warnings.push(warning_("DUPLICATE_EVENT_ID", "Critical", "Duplicate Event ID", "More than one Timeline row uses this persistent Event ID.", entityId, "Resolve the duplicate in the authoritative Timeline.", "Timeline"));
    const sourceDate = String(event.dateDisplay || event.date || "").trim();
    if (!event.dateKey && sourceDate) warnings.push(warning_("INVALID_DATE", "Critical", "Invalid date", "The supplied Timeline date could not be normalised.", entityId, "Review the Timeline date value: " + sourceDate, "Timeline"));
    else if (!event.dateKey) warnings.push(warning_("MISSING_DATE", "Warning", "Date to be confirmed", "This event has not been assigned a date in the Timeline yet.", entityId, "Schedule the event date when it is known.", "Timeline"));
    if (!event.venue) warnings.push(warning_("MISSING_VENUE", "Warning", "Venue not assigned", "Location/Venue is blank.", entityId, "Review the event location.", "Timeline"));
    if (event.eventType === "Rehearsal" && !relationship.session) warnings.push(warning_("ATTENDANCE_UNLINKED", "Info", "Attendance not linked", "No compatible Attendance Session was found.", entityId, "Attendance can be created through its existing workflow when required.", "Attendance"));
    if (relationship.session) {
      const counts = safeAttendance_(relationship).attendanceCounts, total = safeAttendance_(relationship).studentCount;
      const waiting = Number(counts.Waiting || counts["Not Marked"] || counts.Unmarked || 0);
      if (total && waiting === total) warnings.push(warning_("ATTENDANCE_NOT_STARTED", "Info", "Attendance not started", "No attendance records have been marked yet.", entityId, "Open the Attendance roll.", "Attendance"));
      else if (waiting > 0) warnings.push(warning_("ATTENDANCE_INCOMPLETE", "Warning", "Attendance incomplete", waiting + " attendance records remain unmarked.", entityId, "Open the Attendance roll.", "Attendance"));
    }
    (unresolved || []).forEach(message => warnings.push(warning_("UNRESOLVED_SELECTION", "Warning", "Unresolved participant selection", message, entityId, "Use a unique ID, email, or name plus school.", "Timeline")));
    return warnings;
  }

  function warning_(code, severity, title, message, entityId, action, source) { return { code, severity, title, message, entityId, action, source }; }
  function attentionState_(warnings) { if (warnings.some(item => item.severity === "Critical")) return "Critical"; if (warnings.some(item => item.severity === "Warning")) return "Requires Attention"; if (warnings.some(item => item.source === "Attendance")) return "Attendance Warning"; if (warnings.length) return "Source Warning"; return "Healthy"; }
  function findEvent_(eventId, user) { const target = String(eventId || ""); return TimelineService.getTimelineEvents().filter(event => scopeAllowsEvent_(user, event)).find(event => event.id === target || event.eventId === target || (event.legacyIds || []).includes(target)) || null; }
  function scopeAllowsEvent_(user, event) { const scope = user.scope || { type: "production", values: [] }; if (!scope.type || scope.type === "production") return true; const values = (scope.values || []).map(EntityModelService.normaliseKey); if (!values.length) return false; const candidates = scope.type === "department" ? [event.area] : scope.type === "category" ? event.categories : scope.type === "item" ? (event.items || []).concat(event.studentGroups || []) : scope.type === "school" ? event.schoolGroups : scope.type === "event" ? [event.id, event.eventId].concat(event.legacyIds || []) : []; return candidates.map(EntityModelService.normaliseKey).some(value => values.includes(value)); }
  function getAttendanceEvents_() { try { const result = AttendanceService.getEvents(); return result && result.ok && Array.isArray(result.data) ? result.data : []; } catch (err) { return []; } }
  function matchAttendance_(event, sessions) {
    if (event.eventType !== "Rehearsal") return noAttendance_("not-applicable");
    let session = (sessions || []).find(item => event.persistentEventId && [item.eventId, item.timelineEventId].filter(Boolean).includes(event.persistentEventId));
    if (session) return { session, method: "persistent-event-id" };
    session = (sessions || []).find(item => event.attendanceSession && [item.sessionId, item.id].includes(event.attendanceSession.sessionId || event.attendanceSession.id));
    if (session) return { session, method: "stable-session-id" };
    session = (sessions || []).find(item => { if (item.dateKey && event.dateKey && item.dateKey !== event.dateKey) return false; if (EntityModelService.normaliseKey(item.eventName) !== EntityModelService.normaliseKey(event.title)) return false; const a = EntityModelService.normaliseKey(item.location), b = EntityModelService.normaliseKey(event.venue); return !a || !b || a === b; });
    return session ? { session, method: "date-name-venue-compatibility" } : noAttendance_("none");
  }
  function noAttendance_(method) { return { session: null, method }; }
  function safeAttendance_(relationship) { const session = relationship.session || {}, counts = (session.attendanceCounts || {}).byStatus || {}; const total = Number(session.studentCount || (session.attendanceCounts || {}).total) || 0; const waiting = Number(counts.Waiting || counts["Not Marked"] || counts.Unmarked || 0); return { linked: true, id: session.id || "", sessionId: session.sessionId || "", sheetName: session.sheetName || "", status: waiting ? "In Progress" : total ? "Complete" : "Waiting", studentCount: total, attendanceCounts: counts, completionPercentage: total ? Math.round(((total - waiting) / total) * 100) : 0, date: session.date || "", time: session.time || "", matchMethod: relationship.method }; }
  function safeParticipant_(item) { return { id: item.id || "", studentKey: item.studentKey || "", name: item.name || [item.firstName, item.lastName].filter(Boolean).join(" "), school: item.school || "", year: item.year || item.schoolYear || "", item: item.item || "", group: item.group || "", category: item.category || item.discipline || "", attendanceStatus: "Unavailable", matchReasons: item.matchReasons || [] }; }
  function staffForEvent_(names, user) { const wanted = unique_(names), canContact = AuthorizationService.hasCapability(user, "Users.Manage"); let records = []; try { records = StaffService.getAll(); } catch (err) {} return wanted.map(name => { const key = EntityModelService.normaliseKey(name); const match = records.find(item => [item.name, item.displayName, item.staffId].map(EntityModelService.normaliseKey).includes(key)); const output = { name: match && (match.displayName || match.name) || name, role: match && (match.productionRole || match.role) || "", department: match && (match.department || match.team) || "", source: "Timeline Staff" }; if (canContact && match) output.email = match.email || match.primaryEmail || ""; return output; }); }
  function tasksForEvent_(event, session) { const ids = [event.id, event.eventId, session && session.id, session && session.sessionId].filter(Boolean); return TaskService.list().filter(task => ids.includes(task.relatedEvent) || ids.includes(task.projectId) || ids.includes(task.workflowExecutionId) || (task.entity && ids.includes(task.entity.id))).map(task => ({ id: task.id, title: task.title, assignedUser: task.assignedUser, dueDate: task.dueDate, priority: task.priority, status: task.status, relatedEvent: task.relatedEvent || "", workflowExecutionId: task.workflowExecutionId || "" })); }
  function activityForEvent_(event, session) { const ids = [event.id, event.eventId, session && session.id, session && session.sessionId].filter(Boolean); return AuditService.list(120).filter(item => ids.some(id => JSON.stringify(item).indexOf(id) >= 0)).map(item => ({ id: item.id, action: item.action, actor: item.actor, occurredAt: item.occurredAt, entity: item.entity })); }
  function diagnostics_(event, relationship, impact, warnings) { const source = SourceRegistryService.getSourceConfig("timeline"); return { sourceSpreadsheet: source.spreadsheetId, sourceSheet: source.sheetName, sourceSheetId: source.sheetId, sourceRow: event.sourceRow || null, sourceRowValid: Number(event.sourceRow) > 1, detectedSchema: "Heading-based Timeline schema", eventIdSource: event.eventIdSource || "Derived", legacyIds: event.legacyIds || [], classificationReason: event.eventType === "Rehearsal" ? "Participant assignment selections contain data" : "No participant assignment selections", participantMatching: impact.matchSummary || {}, unresolvedSelections: impact.unresolvedSelections || [], attendanceMatchMethod: relationship.method, fingerprint: event.fingerprint || "", cacheVersion: CACHE_VERSION, warnings }; }
  function editableActions_(user, managed) { const actions = []; if (AuthorizationService.hasCapability(user, "Events.Edit")) actions.push({ commandId: "SaveEventDraft", label: managed ? "Edit workflow" : "Create managed workflow", enabled: true }); if (managed && AuthorizationService.hasCapability(user, "Events.Activate") && managed.status === "Draft") actions.push({ commandId: "ActivateEvent", label: "Activate event", enabled: true }); return actions; }
  function permissionModel_(user) { return { canView: true, canViewParticipants: AuthorizationService.hasCapability(user, "Participants.View"), canViewAttendance: AuthorizationService.hasCapability(user, "Attendance.View"), canViewAudit: AuthorizationService.hasCapability(user, "Audit.View") || AuthorizationService.hasCapability(user, "Events.ViewAudit"), canViewDiagnostics: AuthorizationService.hasCapability(user, "Administration.View"), canCreate: AuthorizationService.hasCapability(user, "Events.Create"), canEdit: AuthorizationService.hasCapability(user, "Events.Edit"), canActivate: AuthorizationService.hasCapability(user, "Events.Activate"), canManageRoster: AuthorizationService.hasCapability(user, "Events.ManageRoster"), canManageRisk: AuthorizationService.hasCapability(user, "Events.ManageRisk"), canApproveRisk: AuthorizationService.hasCapability(user, "Events.ApproveRisk"), canGeneratePermissions: AuthorizationService.hasCapability(user, "Events.GeneratePermissions"), canViewPermissions: AuthorizationService.hasCapability(user, "Events.ViewPermissions"), canViewMedicalResponses: AuthorizationService.hasCapability(user, "Events.ViewMedicalResponses"), canPrepareCommunications: AuthorizationService.hasCapability(user, "Events.ManageCommunications"), canSendCommunications: AuthorizationService.hasCapability(user, "Events.SendCommunications"), canPrepareAttendance: AuthorizationService.hasCapability(user, "Events.PrepareAttendance"), canRecordAttendance: AuthorizationService.hasCapability(user, "Events.RecordAttendance"), canArchive: AuthorizationService.hasCapability(user, "Events.Archive"), commandMode: "managed-workflow", scope: user.scope || { type: "production", values: [] } }; }
  function duplicatePersistentIds_(events) { const counts = {}; (events || []).forEach(event => { if (event.persistentEventId) counts[event.persistentEventId] = (counts[event.persistentEventId] || 0) + 1; }); return Object.keys(counts).filter(id => counts[id] > 1); }
  function buildFilters_(events) { return { types: unique_(events.map(item => item.eventType)), areas: unique_(events.map(item => item.area)), segments: unique_(events.map(item => item.segment)), venues: unique_(events.map(item => item.venue)), categories: unique_(events.flatMap(item => item.categories || [])), items: unique_(events.flatMap(item => item.items || [])), groups: unique_(events.flatMap(item => (item.schoolGroups || []).concat(item.studentGroups || []))), schools: unique_(events.flatMap(item => item.schools || [])), staff: unique_(events.flatMap(item => item.staff || [])), attendanceStatuses: unique_(events.map(item => item.attendance.status)), attentionStates: ["Critical", "Requires Attention", "Healthy", "Source Warning", "Attendance Warning"] }; }
  function countBy_(items, field) { const counts = {}; (items || []).forEach(item => { const key = String(item[field] || "Unassigned"); counts[key] = (counts[key] || 0) + 1; }); return counts; }
  function unique_(values) { return Array.from(new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))); }
  function todayKey_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"); }
  return { getLanding, getWorkspace };
})();
