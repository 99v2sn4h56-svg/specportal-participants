/**
 * Read-only production exception register.
 *
 * Derives actionable data-quality and integration warnings from canonical
 * services. It never writes to source spreadsheets or invokes migrations.
 */
const ProductionExceptionService = (() => {
  const LIMIT = 500;

  function getData() {
    const user = UserContextService.getCurrent();
    if (!AuthorizationService.hasCapability(user, "Operations.View") && !AuthorizationService.hasCapability(user, "Administration.View")) {
      throw new Error("Operations.View is required.");
    }
    const records = [];
    const sources = {};
    collect_("Timeline", timelineExceptions_, records, sources);
    collect_("Participants", participantExceptions_, records, sources);
    collect_("Staff", staffExceptions_, records, sources);
    collect_("Attendance", attendanceExceptions_, records, sources);
    const severityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    records.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9) || a.source.localeCompare(b.source) || a.title.localeCompare(b.title));
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      readOnly: true,
      records: records.slice(0, LIMIT),
      truncated: records.length > LIMIT,
      summary: {
        total: records.length,
        critical: records.filter(item => item.severity === "Critical").length,
        high: records.filter(item => item.severity === "High").length,
        medium: records.filter(item => item.severity === "Medium").length,
        low: records.filter(item => item.severity === "Low").length
      },
      sources
    };
  }

  function timelineExceptions_() {
    const events = TimelineService.getTimelineEvents();
    const attendanceResult = AttendanceService.getEvents();
    const sessions = attendanceResult && attendanceResult.ok && Array.isArray(attendanceResult.data) ? attendanceResult.data : [];
    const rows = [];
    const seen = {};
    events.forEach(event => {
      const id = event.eventId || event.id || `Timeline row ${event.sourceRow || "unknown"}`;
      if (!event.persistentEventId || event.eventIdSource === "Derived") rows.push(issue_("Timeline", "Missing persistent Event ID", id, event.title, "High", "Run the stable-ID migration only after reviewing its dry-run report."));
      if (!event.venue) rows.push(issue_("Timeline", "Missing venue", id, event.title, "Medium", "Add a venue in the authoritative Timeline row."));
      if (!event.finish) rows.push(issue_("Timeline", "Missing finish time", id, event.title, "Low", "Add a finish time so clash detection is reliable."));
      if (!(event.staff || []).length) rows.push(issue_("Timeline", "No staff allocation", id, event.title, "Medium", "Assign responsible staff in Timeline."));
      const hasSelections = [].concat(event.categories || [], event.schoolGroups || [], event.studentGroups || [], event.individualStudents || []).some(Boolean);
      if (hasSelections) {
        // Passing the event object (not event.id) skips RelationshipService's
        // internal re-lookup, which would otherwise re-scan the entire
        // events array to relocate an event this loop already has in hand.
        const impact = safe_(() => RelationshipService.getAffectedParticipantsWithReasons(event), { participants: [], unresolvedSelections: [] });
        (impact.unresolvedSelections || []).forEach(message => rows.push(issue_("Timeline", "Unresolved participant or group selection", id, event.title, "High", String(message || "Review the Timeline selection values."))));
      }
      if (event.eventType === "Rehearsal" && !sessions.some(session => attendanceMatches_(event, session))) rows.push(issue_("Attendance", "Scheduled rehearsal has no Attendance session", id, event.title, "High", "Create or sync the Attendance session using the existing Attendance workflow."));
      const keys = [];
      if (event.dateKey && event.start && event.venue) keys.push("venue|" + [event.dateKey, event.start, event.venue].map(key_).join("|"));
      (event.staff || []).forEach(staff => { if (event.dateKey && event.start && staff) keys.push("staff|" + [event.dateKey, event.start, staff].map(key_).join("|")); });
      keys.forEach(key => {
        if (seen[key]) rows.push(issue_("Timeline", key.indexOf("venue|") === 0 ? "Possible venue clash" : "Possible staff clash", id, event.title, "High", "Review this event alongside " + seen[key] + "."));
        else seen[key] = event.title || id;
      });
    });
    return rows;
  }

  function participantExceptions_() {
    const participants = ParticipantService.getAll();
    const rows = [];
    const keys = {};
    participants.forEach(item => {
      const name = item.name || [item.firstName, item.lastName].filter(Boolean).join(" ") || "Unnamed participant";
      const id = item.studentKey || item.studentId || item.applicationId || name;
      if (!String(item.firstName || "").trim() || !String(item.lastName || "").trim()) rows.push(issue_("Participants", "Incomplete participant name", id, name, "High", "Complete both first and last name in Participants."));
      if (!item.studentId) rows.push(issue_("Participants", "Missing Student ID", id, name, "Medium", "Add the Student ID where available."));
      if (!item.applicationId) rows.push(issue_("Participants", "Missing Application ID", id, name, "Medium", "Add the Application ID where available."));
      if (!item.school) rows.push(issue_("Participants", "Missing school", id, name, "Medium", "Assign the participant's current school."));
      if (!item.category && !item.discipline && !(item.categories || []).length) rows.push(issue_("Participants", "Missing category", id, name, "Medium", "Assign at least one production category."));
      if (!item.region && !item.directorate) rows.push(issue_("Participants", "Missing Directorate / region", id, name, "Low", "Complete the Directorate field."));
      const key = key_(item.studentKey);
      if (key) {
        if (keys[key]) rows.push(issue_("Participants", "Duplicate Student Key", id, name, "Critical", "Resolve the duplicate shared with " + keys[key] + "."));
        else keys[key] = name;
      }
      const reference = item.photoId || item.photoUrl || "";
      if (reference && !SecureImageService.parseReference(reference).valid) rows.push(issue_("Participants", "Invalid headshot reference", id, name, "Medium", "Replace the photo reference with a valid Drive file ID or HTTPS URL."));
    });
    return rows;
  }

  function staffExceptions_() {
    const staff = StaffService.getAll();
    const rows = [];
    const names = {};
    staff.forEach(item => {
      const name = item.displayName || item.name || "Unnamed staff member";
      const id = item.staffId || item.email || name;
      if (!item.email && !item.primaryEmail) rows.push(issue_("Staff", "Missing email", id, name, "High", "Add a unique staff email address."));
      if (!item.productionRole && !item.role) rows.push(issue_("Staff", "Missing production role", id, name, "Medium", "Assign a production role."));
      if (!item.department && !item.team) rows.push(issue_("Staff", "Missing department", id, name, "Low", "Assign a department or team."));
      if (!item.productionRole && !item.role && /^active$/i.test(item.status || "Active")) rows.push(issue_("Staff", "Active staff member has no role", id, name, "High", "Assign a production role or mark the record inactive."));
      if (!(item.email || item.primaryEmail) || !(item.productionRole || item.role) || !(item.department || item.team)) rows.push(issue_("Staff", "Incomplete Staff profile", id, name, "Low", "Complete the identity, role and department fields."));
      const phone = String(item.mobile || item.phone || "").replace(/\D/g, "");
      if (phone && phone.length < 8) rows.push(issue_("Staff", "Invalid phone number", id, name, "Medium", "Review the contact number."));
      if (/inactive/i.test(item.status || "") && item.specCentralAccess) rows.push(issue_("Staff", "Inactive staff member has access", id, name, "Critical", "Remove SpecCentral access or reactivate the staff record."));
      const nameKey = key_(item.displayName || item.preferredName || item.name);
      if (nameKey) { if (names[nameKey]) rows.push(issue_("Staff", "Duplicate display or preferred name", id, name, "Medium", "Confirm identity against " + names[nameKey] + ".")); else names[nameKey] = name; }
    });
    (StaffService.getIdentityConflicts ? StaffService.getIdentityConflicts() : []).forEach(item => rows.push(issue_("Staff", "Identity conflict", item.email || item.key || "Conflict", item.name || item.email || "Staff identity", "Critical", "Resolve duplicate identity records before assigning access.")));
    return rows;
  }

  function attendanceExceptions_() {
    const rows = [];
    const result = AttendanceService.getSummary();
    if (!result || !result.ok) rows.push(issue_("Attendance", "Attendance API unavailable", "Attendance API", "Live Attendance integration", "Critical", result && result.error || "Verify the API deployment and retry after backoff."));
    else if (result.generatedAt && Date.now() - new Date(result.generatedAt).getTime() > 15 * 60 * 1000) rows.push(issue_("Attendance", "Attendance API response is stale", "Attendance API", "Live Attendance integration", "Medium", "Refresh the Attendance integration and review service health."));
    const eventResult = AttendanceService.getEvents();
    if (eventResult && eventResult.ok && Array.isArray(eventResult.data)) {
      const timeline = TimelineService.getTimelineEvents();
      eventResult.data.forEach(session => { if (!timeline.some(event => attendanceMatches_(event, session))) rows.push(issue_("Attendance", "Attendance session has no Timeline event", session.sessionId || session.sheetName, session.eventName || session.sheetName, "Medium", "Review the Session ID, event name, date and venue relationship.")); });
    }
    return rows;
  }

  function collect_(name, callback, records, sources) {
    const started = Date.now();
    try { const result = callback(); records.push.apply(records, result); sources[name] = { status: "Healthy", recordCount: result.length, responseMs: Date.now() - started, error: "" }; }
    catch (err) { sources[name] = { status: "Unavailable", recordCount: 0, responseMs: Date.now() - started, error: err && err.message ? err.message : String(err) }; records.push(issue_(name, name + " scan unavailable", name, name, "Critical", sources[name].error)); }
  }
  function issue_(source, type, entityId, title, severity, action) { return { id: EntityModelService.stableId("EXC", [source, type, entityId].join("|")), source, type, entityId: String(entityId || ""), title: String(title || entityId || type), severity, recommendedAction: action, readOnly: true }; }
  function attendanceMatches_(event, session) { if (event.persistentEventId && [session.eventId, session.timelineEventId].filter(Boolean).includes(event.persistentEventId)) return true; if (event.dateKey && session.dateKey && event.dateKey !== session.dateKey) return false; return key_(event.title || event.event) === key_(session.eventName) && (!event.venue || !session.location || key_(event.venue) === key_(session.location)); }
  function safe_(callback, fallback) { try { return callback(); } catch (err) { return fallback; } }
  function key_(value) { return String(value || "").trim().toLowerCase(); }
  return { getData };
})();
