/**
 * Managed Event Manager workflow overlay.
 *
 * Timeline remains the authoritative production calendar. This service stores
 * the planning state Timeline cannot represent (rosters, risk, permission,
 * school communication and attendance preparation) and links it back through
 * timelineEventId. Stable entity IDs are retained; display labels are snapshots
 * only and are never used as relationship keys.
 */
const EventWorkflowService = (() => {
  const EVENTS = "event_workflows";
  const VERSIONS = "event_workflow_versions";
  const PERMISSION_REQUESTS = "event_permission_requests";
  const SCHOOL_NOTIFICATIONS = "event_school_notifications";
  const STATUSES = ["Draft", "Active", "Completed", "Cancelled", "Archived"];
  const RISK_STATUSES = ["Not started", "Draft", "In review", "Approved"];
  const COMMANDS = Object.freeze({
    CreateEventDraft: "Events.Create",
    SaveEventDraft: "Events.Edit",
    ActivateEvent: "Events.Activate",
    CancelEvent: "Events.Cancel",
    CompleteEvent: "Events.Edit",
    ArchiveEvent: "Events.Archive",
    SaveEventRoster: "Events.ManageRoster",
    GenerateRiskAssessment: "Events.ManageRisk",
    SaveRiskAssessment: "Events.ManageRisk",
    SubmitRiskAssessment: "Events.ManageRisk",
    ApproveRiskAssessment: "Events.ApproveRisk",
    GeneratePermissionForm: "Events.GeneratePermissions",
    PrepareSchoolNotifications: "Events.ManageCommunications",
    PrepareAttendanceSessions: "Events.PrepareAttendance"
  });
  const MATERIAL_FIELDS = ["title", "eventType", "purpose", "publicDescription", "deadlines", "emergencyContact", "schedule", "venue", "logistics", "participation"];

  function list() {
    const user = UserContextService.requireCapability("Events.View");
    return PlatformStoreService.listLarge(EVENTS).filter(event => scopeAllows_(user, event)).map(event => secureWorkspaceEvent_(withDerived_(event), user));
  }

  function get(eventId) {
    const user = UserContextService.requireCapability("Events.View");
    const event = find_(eventId);
    if (!event || !scopeAllows_(user, event)) throw new Error("The managed event is unavailable or inaccessible.");
    return workspace_(event, user);
  }

  function getByReference(eventId) {
    const user = UserContextService.requireCapability("Events.View");
    const target = String(eventId || "");
    const event = PlatformStoreService.listLarge(EVENTS).find(item => (item.id === target || item.timelineEventId === target || (item.legacyIds || []).includes(target)) && scopeAllows_(user, item));
    return event ? secureWorkspaceEvent_(withDerived_(event), user) : null;
  }

  function execute(commandName, input) {
    const name = String(commandName || ""), value = input || {};
    try {
      const capability = COMMANDS[name];
      if (!capability) return failure_(name, "COMMAND_NOT_FOUND", "The Event Manager command is not registered.");
      const user = UserContextService.requireCapability(capability, { event: value.id || value.eventId || "" });
      let data;
      if (name === "CreateEventDraft") data = create_(value, user);
      else if (name === "SaveEventDraft") data = save_(value, user);
      else if (name === "ActivateEvent") data = activate_(value, user);
      else if (name === "CancelEvent") data = transition_(value, user, "Cancelled");
      else if (name === "CompleteEvent") data = transition_(value, user, "Completed");
      else if (name === "ArchiveEvent") data = transition_(value, user, "Archived");
      else if (name === "SaveEventRoster") data = saveRoster_(value, user);
      else if (name === "GenerateRiskAssessment") data = generateRisk_(value, user);
      else if (name === "SaveRiskAssessment") data = saveRisk_(value, user, "Draft");
      else if (name === "SubmitRiskAssessment") data = saveRisk_(value, user, "In review");
      else if (name === "ApproveRiskAssessment") data = approveRisk_(value, user);
      else if (name === "GeneratePermissionForm") data = generatePermissionForm_(value, user);
      else if (name === "PrepareSchoolNotifications") data = prepareSchoolNotifications_(value, user);
      else if (name === "PrepareAttendanceSessions") data = prepareAttendance_(value, user);
      return success_(name, data);
    } catch (error) {
      return failure_(name, /required\.$/i.test(String(error && error.message)) ? "PERMISSION_DENIED" : "COMMAND_FAILED", error && error.message ? error.message : String(error));
    }
  }

  function create_(input, user) {
    const now = new Date().toISOString();
    const event = cleanEvent_(input, null);
    if (!AuthorizationService.hasCapability(user, "Events.ManageRoster")) event.participation = cleanParticipation_({});
    event.id = PlatformStoreService.createId("EVT");
    event.entityType = "ManagedEvent";
    event.status = "Draft";
    event.version = 1;
    event.createdAt = now;
    event.createdBy = user.email;
    event.updatedAt = now;
    event.updatedBy = user.email;
    event.risk = defaultRisk_(user);
    event.permissions = defaultPermission_();
    event.communications = { status: "Not started", notificationIds: [], lastPreparedAt: "" };
    event.attendance = { status: "Not started", sessions: [], lastPreparedAt: "" };
    const saved = PlatformStoreService.putLarge(EVENTS, event, 500);
    recordVersion_(saved, user, "Created");
    audit_("EventDraftCreated", saved, user, { timelineEventId: saved.timelineEventId });
    return workspace_(saved, user);
  }

  function save_(input, user) {
    const current = requireEvent_(input.id || input.eventId, user);
    if (["Cancelled", "Archived"].includes(current.status)) throw new Error("Cancelled or archived events cannot be edited.");
    const next = cleanEvent_(input, current);
    // Roster and downstream workflow state have dedicated capability-checked
    // commands. A general event edit must not be able to smuggle those changes.
    next.participation = JSON.parse(JSON.stringify(current.participation || cleanParticipation_({})));
    const changedFields = changedFields_(current, next);
    next.version = Number(current.version || 0) + 1;
    next.updatedAt = new Date().toISOString();
    next.updatedBy = user.email;
    const materialChanges = changedFields.filter(field => MATERIAL_FIELDS.includes(field));
    if (current.permissions && current.permissions.formId && materialChanges.length) {
      next.permissions = Object.assign({}, current.permissions, {
        status: "Outdated",
        outdatedAt: next.updatedAt,
        outdatedReason: "Event details changed after permission generation: " + materialChanges.join(", ")
      });
    }
    if (current.risk && current.risk.status === "Approved" && materialChanges.length) next.risk = Object.assign({}, current.risk, { status: "In review", approvedAt: "", approvedBy: "", outdatedReason: "Event details changed after risk approval: " + materialChanges.join(", ") });
    if (current.communications && current.communications.notificationIds && current.communications.notificationIds.length && materialChanges.length) next.communications = Object.assign({}, current.communications, { status: "Outdated", outdatedAt: next.updatedAt });
    if (current.attendance && current.attendance.sessions && current.attendance.sessions.length && changedFields.includes("schedule")) next.attendance = Object.assign({}, current.attendance, { status: "Outdated", outdatedAt: next.updatedAt });
    const saved = PlatformStoreService.putLarge(EVENTS, next, 500);
    recordVersion_(saved, user, "Updated", changedFields);
    audit_("EventDraftUpdated", saved, user, { version: saved.version, changedFields });
    return workspace_(saved, user);
  }

  function activate_(input, user) {
    const current = requireEvent_(input.id || input.eventId, user), validation = validateActivation_(current);
    if (validation.blockers.length) throw new Error("Event cannot be activated: " + validation.blockers.join("; "));
    const saved = persistTransition_(current, user, "Active", "EventActivated");
    return workspace_(saved, user);
  }

  function transition_(input, user, status) {
    const current = requireEvent_(input.id || input.eventId, user);
    if (!STATUSES.includes(status)) throw new Error("Unsupported event lifecycle status.");
    if (status === "Archived" && !["Completed", "Cancelled"].includes(current.status)) throw new Error("Only completed or cancelled events can be archived.");
    return workspace_(persistTransition_(current, user, status, "Event" + status), user);
  }

  function persistTransition_(current, user, status, action) {
    const saved = PlatformStoreService.putLarge(EVENTS, Object.assign({}, current, { status, version: Number(current.version || 0) + 1, updatedAt: new Date().toISOString(), updatedBy: user.email }), 500);
    recordVersion_(saved, user, status);
    audit_(action, saved, user, { status, version: saved.version });
    return saved;
  }

  function saveRoster_(input, user) {
    const current = requireEvent_(input.id || input.eventId, user);
    const participation = cleanParticipation_(input.participation || input.roster || {});
    const updatedAt = new Date().toISOString();
    const saved = PlatformStoreService.putLarge(EVENTS, Object.assign({}, current, {
      participation,
      version: Number(current.version || 0) + 1,
      updatedAt,
      updatedBy: user.email,
      permissions: current.permissions && current.permissions.formId ? Object.assign({}, current.permissions, { status: "Outdated", outdatedAt: updatedAt, outdatedReason: "The event roster changed after permission generation." }) : current.permissions,
      risk: current.risk && current.risk.status === "Approved" ? Object.assign({}, current.risk, { status: "In review", approvedAt: "", approvedBy: "", outdatedReason: "The event roster changed after risk approval." }) : current.risk,
      communications: current.communications && current.communications.notificationIds && current.communications.notificationIds.length ? Object.assign({}, current.communications, { status: "Outdated", outdatedAt: updatedAt }) : current.communications,
      attendance: current.attendance && current.attendance.sessions && current.attendance.sessions.length ? Object.assign({}, current.attendance, { status: "Outdated", outdatedAt: updatedAt }) : current.attendance
    }), 500);
    recordVersion_(saved, user, "Roster updated", ["participation"]);
    audit_("EventRosterUpdated", saved, user, rosterCounts_(participation));
    return workspace_(saved, user);
  }

  function saveRisk_(input, user, status) {
    const current = requireEvent_(input.id || input.eventId, user), supplied = input.risk || {};
    const risk = {
      id: current.risk && current.risk.id || PlatformStoreService.createId("RSK"),
      status: RISK_STATUSES.includes(status) ? status : "Draft",
      version: Number(current.risk && current.risk.version || 0) + 1,
      ownerId: String(supplied.ownerId || current.risk && current.risk.ownerId || user.staffId || user.email),
      approverId: String(supplied.approverId || current.risk && current.risk.approverId || ""),
      hazards: cleanLinks_(supplied.hazards || current.risk && current.risk.hazards || [], "hazardId", "label"),
      controls: cleanLinks_(supplied.controls || current.risk && current.risk.controls || [], "controlId", "label"),
      emergencyPlan: String(supplied.emergencyPlan || current.risk && current.risk.emergencyPlan || "").slice(0, 4000),
      healthConsiderationsRequired: supplied.healthConsiderationsRequired === undefined ? !!(current.risk && current.risk.healthConsiderationsRequired) : !!supplied.healthConsiderationsRequired,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email,
      approvedAt: status === "Approved" ? new Date().toISOString() : "",
      approvedBy: status === "Approved" ? user.email : ""
    };
    const saved = PlatformStoreService.putLarge(EVENTS, Object.assign({}, current, { risk, version: Number(current.version || 0) + 1, updatedAt: risk.updatedAt, updatedBy: user.email }), 500);
    recordVersion_(saved, user, "Risk " + risk.status, ["risk"]);
    audit_("EventRisk" + risk.status.replace(/\s+/g, ""), saved, user, { riskId: risk.id, riskVersion: risk.version, hazardCount: risk.hazards.length });
    return workspace_(saved, user);
  }

  function generateRisk_(input, user) {
    const current = requireEvent_(input.id || input.eventId, user), hazards = [], controls = [];
    const add = (code, hazard, control) => { hazards.push({ id: "HAZ-" + code, label: hazard }); controls.push({ id: "CTL-" + code, label: control }); };
    add("SUPERVISION", "Student supervision, arrival, departure or lost participant", "Confirm session-level Staff roles, roll checks, handover points and escalation contacts.");
    if ((current.schedule || []).some(item => item.venueId || item.venueName)) add("VENUE", "Venue access, public areas, emergency egress or accessibility", "Complete a venue inspection and confirm entrances, pickup, assembly and accessibility arrangements.");
    if (current.logistics && current.logistics.travelLegs && current.logistics.travelLegs.length) add("TRAVEL", "Transport delay, vehicle incident or separation during travel", "Confirm providers, supervising Staff, manifests, emergency contacts and delay communications for each travel leg.");
    if (current.logistics && current.logistics.meals && current.logistics.meals.length) add("MEALS", "Food, allergens, hydration or unsupervised meal-break movement", "Review authorised dietary alerts, catering controls, water access and meal-break supervision.");
    if (/performance|rehearsal|filming|recording|workshop|competition/i.test(String(current.eventType || ""))) add("ACTIVITY", "Activity, staging, equipment, electrical, sound or lighting hazards", "Complete activity-specific equipment checks, safe-work briefings and restricted-area controls.");
    const dates = Array.from(new Set((current.schedule || []).map(item => item.date).filter(Boolean)));
    if (dates.length > 1) add("MULTIDAY", "Fatigue, overnight or multi-day welfare arrangements", "Confirm daily welfare checks, accommodation supervision where relevant, rest breaks and escalation arrangements.");
    add("EMERGENCY", "Emergency, severe weather, Staff absence or communication failure", "Confirm emergency plan, assembly point, event contacts, backup Staff and communication channels before activation.");
    return saveRisk_({ id: current.id, risk: { ownerId: input.ownerId || current.risk && current.risk.ownerId || user.staffId || user.email, approverId: input.approverId || current.risk && current.risk.approverId || "", hazards, controls, emergencyPlan: current.risk && current.risk.emergencyPlan || "Review the venue emergency procedure and event communication plan before submitting for approval.", healthConsiderationsRequired: (current.participation && current.participation.participants || []).length > 0 } }, user, "Draft");
  }

  function approveRisk_(input, user) {
    const current = requireEvent_(input.id || input.eventId, user);
    if (!current.risk || current.risk.status !== "In review") throw new Error("Submit the risk assessment for review before approval.");
    const approverIdentities = [user.email, user.staffId].map(value => String(value || "").toLowerCase()).filter(Boolean);
    if (approverIdentities.includes(String(current.risk.updatedBy || "").toLowerCase()) || approverIdentities.includes(String(current.risk.ownerId || "").toLowerCase())) throw new Error("Risk approval must be completed by an authorised user other than the risk owner or submitter.");
    return saveRisk_({ id: current.id, risk: current.risk }, user, "Approved");
  }

  function generatePermissionForm_(input, user) {
    const current = requireEvent_(input.id || input.eventId, user);
    if (current.status !== "Active") throw new Error("Activate the event before generating permission requests.");
    if (!current.risk || current.risk.status !== "Approved") throw new Error("Approve the event risk assessment before generating permission requests.");
    const participants = current.participation && current.participation.participants || [];
    if (!participants.length) throw new Error("Add participant records with stable IDs before generating permission requests.");
    const permissionVersion = Number(current.permissions && current.permissions.version || 0) + 1;
    const form = FormResponseService.saveDefinition(buildPermissionForm_(current, permissionVersion));
    const requestIds = participants.map(participant => {
      const request = PlatformStoreService.putLarge(PERMISSION_REQUESTS, {
        id: PlatformStoreService.createId("PERM"), entityType: "EventPermissionRequest", eventId: current.id,
        participantId: participant.id, schoolId: participant.schoolId || "", formId: form.id,
        eventVersion: current.version, permissionVersion, status: "Not sent", issuedAt: "", submittedAt: "", responseId: "",
        consent: "", healthReviewStatus: "Not declared", departureResponse: "", mealLeaveResponse: "", createdAt: new Date().toISOString()
      }, 5000);
      return request.id;
    });
    const permissions = { status: "Draft form", formId: form.id, version: permissionVersion, requestIds, dueDate: String(input.dueDate || ""), generatedAt: new Date().toISOString(), generatedBy: user.email, outdatedAt: "", outdatedReason: "" };
    const saved = PlatformStoreService.putLarge(EVENTS, Object.assign({}, current, { permissions, version: Number(current.version || 0) + 1, updatedAt: new Date().toISOString(), updatedBy: user.email }), 500);
    recordVersion_(saved, user, "Permission form generated", ["permissions"]);
    audit_("EventPermissionFormGenerated", saved, user, { formId: form.id, permissionVersion, requestCount: requestIds.length });
    return workspace_(saved, user);
  }

  function prepareSchoolNotifications_(input, user) {
    const current = requireEvent_(input.id || input.eventId, user);
    if (!current.permissions || !current.permissions.formId || current.permissions.status === "Outdated") throw new Error("Generate a current permission form before preparing school notifications.");
    const participants = current.participation && current.participation.participants || [];
    const groups = current.participation && current.participation.schoolGroups || [];
    const grouped = participants.reduce((map, participant) => {
      const schoolId = String(participant.schoolId || "");
      if (!schoolId) return map;
      if (!map[schoolId]) map[schoolId] = { schoolId, schoolName: participant.schoolName || "School", participantIds: [] };
      map[schoolId].participantIds.push(participant.id);
      return map;
    }, {});
    groups.forEach(group => {
      const schoolId = String(group.schoolId || "");
      if (!schoolId) return;
      if (!grouped[schoolId]) grouped[schoolId] = { schoolId, schoolName: group.schoolName || group.label || "School", participantIds: [] };
      grouped[schoolId].groupIds = (grouped[schoolId].groupIds || []).concat(group.id);
      grouped[schoolId].schoolEmail = group.schoolEmail || grouped[schoolId].schoolEmail || "";
      grouped[schoolId].contactTeacherId = group.contactTeacherId || grouped[schoolId].contactTeacherId || "";
      grouped[schoolId].contactTeacherName = group.contactTeacherName || grouped[schoolId].contactTeacherName || "";
      grouped[schoolId].contactTeacherEmail = group.contactTeacherEmail || grouped[schoolId].contactTeacherEmail || "";
    });
    const existingNotifications = PlatformStoreService.listLarge(SCHOOL_NOTIFICATIONS).filter(item => item.eventId === current.id && item.permissionVersion === current.permissions.version);
    const ids = Object.keys(grouped).map(schoolId => {
      const group = grouped[schoolId];
      const existing = existingNotifications.find(item => item.schoolId === group.schoolId && item.status === "Draft");
      const record = PlatformStoreService.putLarge(SCHOOL_NOTIFICATIONS, {
        id: existing && existing.id || PlatformStoreService.createId("SNOTE"), entityType: "EventSchoolNotification", eventId: current.id,
        schoolId: group.schoolId, schoolName: group.schoolName, schoolEmail: group.schoolEmail || "",
        participantIds: group.participantIds, groupIds: group.groupIds || [],
        contactTeacherId: group.contactTeacherId || "", contactTeacherName: group.contactTeacherName || "", contactTeacherEmail: group.contactTeacherEmail || "",
        formId: current.permissions.formId, permissionVersion: current.permissions.version,
        status: "Draft", recipientCount: group.participantIds.length, createdAt: existing && existing.createdAt || new Date().toISOString(), createdBy: existing && existing.createdBy || user.email, updatedAt: new Date().toISOString(), updatedBy: user.email
      }, 2000);
      return record.id;
    });
    const communications = { status: ids.length ? "Draft notifications" : "Needs school links", notificationIds: ids, lastPreparedAt: new Date().toISOString() };
    const saved = PlatformStoreService.putLarge(EVENTS, Object.assign({}, current, { communications, version: Number(current.version || 0) + 1, updatedAt: new Date().toISOString(), updatedBy: user.email }), 500);
    recordVersion_(saved, user, "School notifications prepared", ["communications"]);
    audit_("EventSchoolNotificationsPrepared", saved, user, { schoolCount: ids.length, participantCount: participants.length, delivery: "Draft only" });
    return workspace_(saved, user);
  }

  function prepareAttendance_(input, user) {
    const current = requireEvent_(input.id || input.eventId, user), schedules = current.schedule || [];
    if (!schedules.length) throw new Error("Add at least one event schedule before preparing Attendance.");
    const trackedSchedules = schedules.filter(schedule => schedule.attendanceSessionEnabled !== false);
    if (!trackedSchedules.length) throw new Error("Enable Attendance tracking for at least one event schedule.");
    const sessions = trackedSchedules.map(schedule => ({
      id: PlatformStoreService.createId("ATTDRAFT"), scheduleId: schedule.id,
      name: [current.title, schedule.label || schedule.type].filter(Boolean).join(" — "), date: schedule.date,
      start: schedule.start, end: schedule.end, venueId: schedule.venueId || "", venueName: schedule.venueName || "",
      participantIds: (current.participation && current.participation.participants || []).filter(item => !item.sessionIds || !item.sessionIds.length || item.sessionIds.includes(schedule.id)).map(item => item.id),
      staffIds: (current.participation && current.participation.staff || []).filter(item => !item.sessionIds || !item.sessionIds.length || item.sessionIds.includes(schedule.id)).map(item => item.id),
      permissionVersion: current.permissions && current.permissions.version || 0, status: "Prepared"
    }));
    const attendance = { status: "Prepared", sessions, lastPreparedAt: new Date().toISOString(), adapterState: "Awaiting approved Attendance write command" };
    const saved = PlatformStoreService.putLarge(EVENTS, Object.assign({}, current, { attendance, version: Number(current.version || 0) + 1, updatedAt: new Date().toISOString(), updatedBy: user.email }), 500);
    recordVersion_(saved, user, "Attendance prepared", ["attendance"]);
    audit_("EventAttendancePrepared", saved, user, { sessionCount: sessions.length, participantCount: sessions[0] && sessions[0].participantIds.length || 0, externalWrite: false });
    return workspace_(saved, user);
  }

  function buildPermissionForm_(event, version) {
    const q = (type, label, mapping, required, options) => ({ id: PlatformStoreService.createId("Q"), type, label, help: "", mapping: mapping || "", required: !!required, options: options || [], optionRules: (options || []).map(() => ({ action: "", target: "" })), allowOther: false });
    return {
      name: event.title + " — permission v" + version,
      description: "Event permission and participation details. Event reference: " + event.id,
      source: "custom", status: "Draft", eventId: event.id, programId: event.programId || "",
      prefill: { email: true, firstName: true, lastName: true, school: true },
      eventPayload: permissionEventPayload_(event),
      questions: [
        q("short_text", "Permission request reference", "permissionRequestId", true),
        q("short_text", "Participant stable ID", "studentId", true),
        q("single_selection", "I give permission to participate in this event", "permissionDecision", true, ["Yes", "No"]),
        q("single_selection", "Have health or support details changed since the last submitted record?", "healthDetailsChanged", true, ["No", "Yes — details require staff review"]),
        q("single_selection", "Departure arrangement", "departureArrangement", true, ["School supervised departure", "Collected by nominated adult", "Independent departure where approved"]),
        q("dropdown_single", "Meal or temporary leave arrangement", "mealLeaveArrangement", false, ["Remaining with the event group", "Temporary leave requested", "Not applicable"]),
        q("short_text", "Parent or guardian name", "guardianName", true),
        q("short_text", "Relationship to participant", "guardianRelationship", true),
        q("checkbox", "I confirm I am authorised to provide this permission", "guardianAuthority", true, ["Confirmed"]),
        q("checkbox", "I confirm the information supplied is accurate", "declaration", true, ["Confirmed"])
      ]
    };
  }

  function permissionEventPayload_(event) {
    return {
      eventId: event.id,
      eventVersion: event.version,
      title: event.title,
      shortName: event.shortName || "",
      purpose: event.purpose || "",
      publicDescription: event.publicDescription || "",
      schedule: (event.schedule || []).filter(item => item.permissionRelevant !== false).map(item => ({
        id: item.id, type: item.type, label: item.label, date: item.date, start: item.start, end: item.end,
        venueName: item.venueName, meetingLocation: item.meetingLocation, pickupLocation: item.pickupLocation
      })),
      venue: event.venue || {},
      logistics: {
        participationFee: event.logistics && event.logistics.participationFee || 0,
        transportCost: event.logistics && event.logistics.transportCost || 0,
        accommodationCost: event.logistics && event.logistics.accommodationCost || 0,
        mealCost: event.logistics && event.logistics.mealCost || 0,
        totalCost: event.logistics && event.logistics.totalCost || 0,
        fundingModel: event.logistics && event.logistics.fundingModel || "No cost",
        paymentDueDate: event.logistics && event.logistics.paymentDueDate || "",
        dress: event.logistics && event.logistics.dress || "",
        footwear: event.logistics && event.logistics.footwear || "",
        equipment: event.logistics && event.logistics.equipment || "",
        travelLegs: event.logistics && event.logistics.travelLegs || [],
        meals: event.logistics && event.logistics.meals || []
      },
      emergencyContact: event.emergencyContact || {},
      permissionDeadline: event.deadlines && event.deadlines.permission || ""
    };
  }

  function workspace_(event, user) {
    const derived = secureWorkspaceEvent_(withDerived_(event), user);
    const requests = PlatformStoreService.listLarge(PERMISSION_REQUESTS).filter(item => item.eventId === event.id && (!event.permissions || !event.permissions.version || item.permissionVersion === event.permissions.version));
    const notifications = PlatformStoreService.listLarge(SCHOOL_NOTIFICATIONS).filter(item => item.eventId === event.id && (!event.permissions || !event.permissions.version || item.permissionVersion === event.permissions.version));
    const versions = UserContextService.hasCapability("Events.ViewAudit") ? PlatformStoreService.listLarge(VERSIONS).filter(item => item.eventId === event.id).slice(0, 30).map(item => secureVersion_(item, user)) : [];
    return Object.assign({}, derived, {
      validation: validateActivation_(event),
      permissionRequests: permissionProjection_(requests, user),
      schoolNotifications: schoolNotificationProjection_(notifications, user),
      history: versions,
      capabilities: capabilityModel_(user),
      generatedAt: new Date().toISOString()
    });
  }

  function secureWorkspaceEvent_(event, user) {
    const safe = JSON.parse(JSON.stringify(event));
    const canViewRoster = AuthorizationService.hasCapability(user, "Participants.View") || AuthorizationService.hasCapability(user, "Events.ManageRoster");
    const canManageCommunications = AuthorizationService.hasCapability(user, "Events.ManageCommunications");
    const canViewRisk = AuthorizationService.hasCapability(user, "Events.ManageRisk") || AuthorizationService.hasCapability(user, "Events.ApproveRisk");
    const canViewAttendance = AuthorizationService.hasCapability(user, "Attendance.View") || AuthorizationService.hasCapability(user, "Events.PrepareAttendance");
    safe.rosterCounts = rosterCounts_(safe.participation || cleanParticipation_({}));
    if (!canViewRoster) safe.participation = { mode: safe.participation && safe.participation.mode || "Mixed", participants: [], staff: [], schoolGroups: [], items: [], categories: [], restricted: true };
    else if (!canManageCommunications) (safe.participation.schoolGroups || []).forEach(group => { delete group.schoolEmail; delete group.contactTeacherEmail; });
    if (!canViewRisk) safe.risk = { id: safe.risk && safe.risk.id || "", status: safe.risk && safe.risk.status || "Not started", version: safe.risk && safe.risk.version || 0, restricted: true };
    if (!canViewAttendance && safe.attendance) safe.attendance = { status: safe.attendance.status || "Not started", sessionCount: (safe.attendance.sessions || []).length, restricted: true };
    return safe;
  }
  function secureVersion_(version, user) {
    const safe = JSON.parse(JSON.stringify(version));
    if (safe.snapshot) safe.snapshot = secureWorkspaceEvent_(safe.snapshot, user);
    return safe;
  }

  function dashboardProjection() {
    const user = UserContextService.requireCapability("Events.View"), today = todayKey_();
    return PlatformStoreService.listLarge(EVENTS).filter(event => scopeAllows_(user, event) && !["Cancelled", "Archived"].includes(event.status))
      .map(withDerived_).filter(event => !event.dateKey || event.dateKey >= today).sort((a, b) => String(a.dateKey || "9999").localeCompare(String(b.dateKey || "9999"))).slice(0, 12)
      .map(event => ({ id: event.id, title: event.title, dateKey: event.dateKey, date: event.date, start: event.start, venue: event.venueName, eventType: event.eventType, status: event.status, readiness: event.readiness, nextAction: event.nextAction, warningCount: event.warningCount }));
  }

  function recordPermissionResponse(formId, profile, responseId, mapped) {
    const event = PlatformStoreService.listLarge(EVENTS).find(item => item.permissions && item.permissions.formId === String(formId || ""));
    const requestId = String(mapped && mapped.permissionRequestId || "").trim();
    const participantId = String(mapped && mapped.studentId || "").trim();
    if (!event || !requestId || !participantId) return null;
    const request = PlatformStoreService.listLarge(PERMISSION_REQUESTS).find(item => item.id === requestId && item.eventId === event.id && item.participantId === participantId && item.permissionVersion === event.permissions.version);
    if (!request) return null;
    const consent = /^yes$/i.test(String(mapped && mapped.permissionDecision || "")) ? "Approved" : /^no$/i.test(String(mapped && mapped.permissionDecision || "")) ? "Declined" : "Submitted";
    const healthReviewRequired = /^yes/i.test(String(mapped && mapped.healthDetailsChanged || ""));
    PlatformStoreService.updateLarge(PERMISSION_REQUESTS, request.id, {
      status: consent, consent, submittedAt: new Date().toISOString(), responseId: String(responseId || ""),
      healthReviewStatus: healthReviewRequired ? "Review required" : "No change declared",
      departureResponse: String(mapped && mapped.departureArrangement || "").slice(0, 180),
      mealLeaveResponse: String(mapped && mapped.mealLeaveArrangement || "").slice(0, 180)
    }, 5000);
    const requests = PlatformStoreService.listLarge(PERMISSION_REQUESTS).filter(item => item.eventId === event.id && item.permissionVersion === event.permissions.version);
    const submitted = requests.filter(item => ["Submitted", "Approved", "Declined"].includes(item.status)).length;
    const approved = requests.filter(item => item.status === "Approved").length;
    const declined = requests.filter(item => item.status === "Declined").length;
    const permissions = Object.assign({}, event.permissions, { status: submitted === requests.length ? "Complete" : "Collecting responses", submittedCount: submitted, approvedCount: approved, declinedCount: declined, requestCount: requests.length, lastResponseAt: new Date().toISOString() });
    PlatformStoreService.putLarge(EVENTS, Object.assign({}, event, { permissions, version: Number(event.version || 0) + 1, updatedAt: new Date().toISOString(), updatedBy: "public-form-workflow" }), 500);
    if (healthReviewRequired) {
      TaskService.create({ title: "Review updated health/support details", assignedUser: event.createdBy || "", priority: "High", module: "events", entity: { type: "ManagedEvent", id: event.id }, relatedEvent: event.id, notes: "Participant " + participantId + " indicated that their existing details require authorised staff review. Open the restricted Forms response to review the submitted content." });
    }
    AuditService.record("EventPermissionResponseLinked", { type: "ManagedEvent", id: event.id }, { participantId, requestId: request.id, permissionVersion: event.permissions.version, responseId: String(responseId || ""), consent, healthReviewTaskCreated: healthReviewRequired });
    return { eventId: event.id, requestId: request.id, status: permissions.status };
  }

  function toEventSummary(event) {
    const value = withDerived_(event), first = (value.schedule || [])[0] || {};
    return {
      id: value.id, eventId: value.id, persistentEventId: value.timelineEventId || "", eventIdSource: "Managed workflow",
      title: value.title, date: value.date, dateKey: value.dateKey, dateStatus: value.dateKey ? "Scheduled" : "To be confirmed",
      start: first.start || "", finish: first.end || "", venue: value.venueName, area: value.department || "", segment: value.programId || "",
      eventType: value.eventType, status: value.status, categories: (value.participation.categories || []).map(item => item.label),
      schoolGroups: (value.participation.schoolGroups || []).map(item => item.label), studentGroups: [], individualStudents: (value.participation.participants || []).map(item => item.label),
      items: (value.participation.items || []).map(item => item.label), schools: (value.participation.participants || []).map(item => item.schoolName).filter(Boolean),
      staff: (value.participation.staff || []).map(item => item.label), notes: value.description || "", sourceRow: "", sourceRowValid: true,
      sourceHealth: value.timelineEventId ? "Managed · Timeline linked" : "Managed workflow", participantCount: value.rosterCounts && value.rosterCounts.participantCount !== undefined ? value.rosterCounts.participantCount : value.participation.participants.length,
      schoolGroupCount: value.rosterCounts && value.rosterCounts.schoolGroupCount !== undefined ? value.rosterCounts.schoolGroupCount : value.participation.schoolGroups.length, attendance: { linked: false, status: value.attendance.status, matchMethod: "managed-workflow" },
      workflow: value.readiness, warnings: readinessWarnings_(value), warningCount: value.warningCount, attentionState: value.warningCount ? "Requires Attention" : "Healthy"
    };
  }

  function cleanEvent_(input, current) {
    const base = current ? JSON.parse(JSON.stringify(current)) : {};
    const value = input || {};
    base.timelineEventId = String(value.timelineEventId !== undefined ? value.timelineEventId : base.timelineEventId || "").slice(0, 180);
    base.programId = String(value.programId !== undefined ? value.programId : base.programId || "").slice(0, 180);
    base.title = String(value.title !== undefined ? value.title : base.title || "Untitled event").trim().slice(0, 250);
    base.shortName = String(value.shortName !== undefined ? value.shortName : base.shortName || "").trim().slice(0, 100);
    base.eventType = String(value.eventType !== undefined ? value.eventType : base.eventType || "Event").trim().slice(0, 100);
    base.description = String(value.description !== undefined ? value.description : base.description || "").slice(0, 5000);
    base.purpose = String(value.purpose !== undefined ? value.purpose : base.purpose || "").slice(0, 3000);
    base.publicDescription = String(value.publicDescription !== undefined ? value.publicDescription : base.publicDescription || "").slice(0, 5000);
    base.internalNotes = String(value.internalNotes !== undefined ? value.internalNotes : base.internalNotes || "").slice(0, 5000);
    base.department = String(value.department !== undefined ? value.department : base.department || "").slice(0, 150);
    base.leadStaffId = String(value.leadStaffId !== undefined ? value.leadStaffId : base.leadStaffId || "").slice(0, 180);
    base.leadStaffName = String(value.leadStaffName !== undefined ? value.leadStaffName : base.leadStaffName || "").slice(0, 180);
    base.ownerStaffId = String(value.ownerStaffId !== undefined ? value.ownerStaffId : base.ownerStaffId || base.leadStaffId || "").slice(0, 180);
    base.operationalLeadStaffId = String(value.operationalLeadStaffId !== undefined ? value.operationalLeadStaffId : base.operationalLeadStaffId || base.leadStaffId || "").slice(0, 180);
    base.deadlines = cleanDeadlines_(value.deadlines !== undefined ? value.deadlines : base.deadlines || {});
    base.emergencyContact = cleanEmergencyContact_(value.emergencyContact !== undefined ? value.emergencyContact : base.emergencyContact || {});
    base.schedule = cleanSchedule_(value.schedule !== undefined ? value.schedule : base.schedule || []);
    base.venue = cleanVenue_(value.venue !== undefined ? value.venue : base.venue || {});
    base.participation = cleanParticipation_(value.participation !== undefined ? value.participation : base.participation || {});
    base.logistics = cleanLogistics_(value.logistics !== undefined ? value.logistics : base.logistics || {});
    return base;
  }

  function cleanSchedule_(items) { return uniqueById_((Array.isArray(items) ? items : []).slice(0, 50).map((item, index) => ({ id: String(item.id || PlatformStoreService.createId("SCH")), type: String(item.type || (index ? "Rehearsal" : "Primary event")).slice(0, 80), label: String(item.label || "").slice(0, 180), date: dateKey_(item.date), start: time_(item.start), end: time_(item.end || item.finish), timeZone: String(item.timeZone || Session.getScriptTimeZone() || "Australia/Sydney").slice(0, 80), venueId: String(item.venueId || "").slice(0, 180), venueName: String(item.venueName || "").slice(0, 250), meetingLocation: String(item.meetingLocation || "").slice(0, 300), pickupLocation: String(item.pickupLocation || "").slice(0, 300), notes: String(item.notes || "").slice(0, 1200), studentAttendanceRequired: item.studentAttendanceRequired !== false, staffAttendanceRequired: item.staffAttendanceRequired !== false, permissionRelevant: item.permissionRelevant !== false, attendanceSessionEnabled: item.attendanceSessionEnabled !== false, onlineUrl: /^https?:\/\//i.test(String(item.onlineUrl || "")) ? String(item.onlineUrl).slice(0, 1000) : "" }))); }
  function cleanVenue_(value) { value = value || {}; return { id: String(value.id || value.venueId || "").slice(0, 180), name: String(value.name || value.venueName || "").slice(0, 250), address: String(value.address || "").slice(0, 500), room: String(value.room || "").slice(0, 180), arrivalEntrance: String(value.arrivalEntrance || "").slice(0, 300), pickupPoint: String(value.pickupPoint || "").slice(0, 300), emergencyAssemblyPoint: String(value.emergencyAssemblyPoint || "").slice(0, 300), contactName: String(value.contactName || "").slice(0, 180), contactPhone: String(value.contactPhone || "").slice(0, 80), mapsUrl: /^https?:\/\//i.test(String(value.mapsUrl || "")) ? String(value.mapsUrl).slice(0, 1000) : "", accessibility: String(value.accessibility || "").slice(0, 1500), parking: String(value.parking || "").slice(0, 1500), publicTransport: String(value.publicTransport || "").slice(0, 1500), notes: String(value.notes || "").slice(0, 2000), onlineUrl: /^https?:\/\//i.test(String(value.onlineUrl || "")) ? String(value.onlineUrl).slice(0, 1000) : "" }; }
  function cleanParticipation_(value) { value = value || {}; return { mode: ["Individuals", "School groups", "Mixed"].includes(value.mode) ? value.mode : "Mixed", participants: cleanLinks_(value.participants, "participantId", "name", "participant"), staff: cleanLinks_(value.staff, "staffId", "name", "staff"), schoolGroups: cleanLinks_(value.schoolGroups, "groupId", "name", "schoolGroup"), items: cleanLinks_(value.items, "itemId", "name", "item"), categories: cleanLinks_(value.categories, "categoryId", "name", "category") }; }
  function cleanLinks_(items, idAlias, labelAlias, kind) { return uniqueById_((Array.isArray(items) ? items : []).slice(0, 500).map(item => { const record = { id: String(item.id || item[idAlias] || "").trim().slice(0, 180), label: String(item.label || item[labelAlias] || "").trim().slice(0, 250) }; if (kind === "participant") Object.assign(record, { schoolId: String(item.schoolId || "").slice(0, 180), schoolName: String(item.schoolName || item.school || "").slice(0, 250), role: String(item.role || "Participant").slice(0, 100), sessionIds: cleanIds_(item.sessionIds), status: String(item.status || "Active").slice(0, 80) }); if (kind === "staff") Object.assign(record, { role: String(item.role || "General Staff").slice(0, 100), sessionIds: cleanIds_(item.sessionIds), supervisionGroup: String(item.supervisionGroup || "").slice(0, 180), status: String(item.status || "Active").slice(0, 80) }); if (kind === "schoolGroup") Object.assign(record, { schoolId: String(item.schoolId || "").slice(0, 180), schoolName: String(item.schoolName || item.school || "").slice(0, 250), schoolEmail: String(item.schoolEmail || "").slice(0, 320), contactTeacherId: String(item.contactTeacherId || "").slice(0, 180), contactTeacherName: String(item.contactTeacherName || "").slice(0, 250), contactTeacherEmail: String(item.contactTeacherEmail || "").slice(0, 320), allocatedCount: Math.max(0, Number(item.allocatedCount) || 0), linkedParticipantIds: cleanIds_(item.linkedParticipantIds), status: String(item.status || "Provisional").slice(0, 80) }); return record; }).filter(item => item.id)); }
  function cleanLogistics_(value) { value = value || {}; return { participationFee: money_(value.participationFee), ticketPrice: money_(value.ticketPrice), transportCost: money_(value.transportCost), accommodationCost: money_(value.accommodationCost), mealCost: money_(value.mealCost), equipmentCost: money_(value.equipmentCost), otherCost: money_(value.otherCost), totalCost: money_(value.totalCost), fundingModel: String(value.fundingModel || "No cost").slice(0, 100), paymentDueDate: dateKey_(value.paymentDueDate), paymentNotes: String(value.paymentNotes || "").slice(0, 1500), dress: String(value.dress || "").slice(0, 2000), footwear: String(value.footwear || "").slice(0, 1000), hairMakeup: String(value.hairMakeup || "").slice(0, 1000), equipment: String(value.equipment || "").slice(0, 2000), prohibitedItems: String(value.prohibitedItems || "").slice(0, 1000), travelLegs: uniqueById_((value.travelLegs || []).slice(0, 30).map(item => ({ id: String(item.id || PlatformStoreService.createId("LEG")), origin: String(item.origin || item.from || "").slice(0, 250), destination: String(item.destination || item.to || "").slice(0, 250), date: dateKey_(item.date), mode: String(item.mode || "").slice(0, 80), departAt: time_(item.departAt), arriveAt: time_(item.arriveAt), supervisorIds: cleanIds_(item.supervisorIds), provider: String(item.provider || "").slice(0, 180), bookingReference: String(item.bookingReference || "").slice(0, 180), notes: String(item.notes || "").slice(0, 1000) }))), meals: uniqueById_((value.meals || []).slice(0, 20).map(item => ({ id: String(item.id || PlatformStoreService.createId("MEAL")), label: String(item.label || "").slice(0, 180), date: dateKey_(item.date), time: time_(item.time), provided: !!item.provided, studentsBring: !!item.studentsBring, leaveVenueOffered: !!item.leaveVenueOffered, supervision: String(item.supervision || "").slice(0, 1000), notes: String(item.notes || "").slice(0, 1000) }))) }; }
  function cleanDeadlines_(value) { value = value || {}; return { permission: dateKey_(value.permission), schoolNotification: dateKey_(value.schoolNotification), rsvp: dateKey_(value.rsvp) }; }
  function cleanEmergencyContact_(value) { value = value || {}; return { name: String(value.name || "").slice(0, 180), role: String(value.role || "").slice(0, 120), phone: String(value.phone || "").slice(0, 80) }; }
  function cleanIds_(items) { return Array.from(new Set((Array.isArray(items) ? items : []).map(item => String(item || "").trim().slice(0, 180)).filter(Boolean))).slice(0, 100); }
  function uniqueById_(items) { const seen = {}; return (items || []).filter(item => { const key = String(item && item.id || "").toLowerCase(); if (!key || seen[key]) return false; seen[key] = true; return true; }); }
  function defaultRisk_(user) { return { id: PlatformStoreService.createId("RSK"), status: "Not started", version: 0, ownerId: user.staffId || user.email, approverId: "", hazards: [], controls: [], emergencyPlan: "", healthConsiderationsRequired: false, updatedAt: "", updatedBy: "", approvedAt: "", approvedBy: "" }; }
  function defaultPermission_() { return { status: "Not started", formId: "", version: 0, requestIds: [], dueDate: "", generatedAt: "", generatedBy: "", outdatedAt: "", outdatedReason: "" }; }

  function withDerived_(event) {
    const copy = JSON.parse(JSON.stringify(event)), schedule = copy.schedule || [], first = schedule.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || {};
    copy.dateKey = first.date || "";
    copy.date = first.date || "";
    copy.start = first.start || "";
    copy.venueName = first.venueName || (copy.venue && copy.venue.name) || (copy.venue && copy.venue.onlineUrl ? "Online" : "");
    copy.readiness = readiness_(copy);
    copy.nextAction = nextAction_(copy);
    copy.warningCount = readinessWarnings_(copy).length;
    return copy;
  }
  function readiness_(event) { const states = summaryWorkflow_(event); const done = Object.keys(states).filter(key => states[key] === "Ready" || states[key] === "Approved" || states[key] === "Prepared").length; return { label: done === 5 ? "Ready" : done >= 3 ? "In progress" : "Needs setup", completed: done, total: 5, percent: Math.round(done / 5 * 100), states }; }
  function summaryWorkflow_(event) { return { schedule: (event.schedule || []).length ? "Ready" : "Required", roster: rosterCount_(event.participation) ? "Ready" : "Required", risk: event.risk && event.risk.status === "Approved" ? "Approved" : event.risk && event.risk.status || "Not started", permission: event.permissions && !["Not started", "Outdated"].includes(event.permissions.status) ? "Ready" : event.permissions && event.permissions.status || "Not started", attendance: event.attendance && event.attendance.status === "Prepared" ? "Prepared" : event.attendance && event.attendance.status || "Not started" }; }
  function readinessWarnings_(event) { const state = summaryWorkflow_(event), warnings = []; Object.keys(state).forEach(key => { if (!["Ready", "Approved", "Prepared"].includes(state[key])) warnings.push({ code: "WORKFLOW_" + key.toUpperCase(), severity: key === "risk" || key === "permission" ? "Warning" : "Info", title: key.charAt(0).toUpperCase() + key.slice(1) + " needs attention", message: state[key], source: "Event workflow", action: nextActionFor_(key, state[key]) }); }); return warnings; }
  function nextAction_(event) { const state = summaryWorkflow_(event), key = Object.keys(state).find(name => !["Ready", "Approved", "Prepared"].includes(state[name])); return key ? nextActionFor_(key, state[key]) : "Open event"; }
  function nextActionFor_(key) { return ({ schedule: "Add schedule", roster: "Add participants or groups", risk: "Complete and approve risk", permission: "Generate current permission form", attendance: "Prepare Attendance sessions" })[key] || "Review event"; }
  function validateActivation_(event) { const blockers = [], warnings = []; if (!String(event.title || "").trim()) blockers.push("Event name is required"); if (!String(event.eventType || "").trim()) blockers.push("Event type is required"); if (!event.leadStaffId) blockers.push("An event lead with a stable Staff ID is required"); if (!(event.schedule || []).length) blockers.push("At least one schedule is required"); (event.schedule || []).forEach((item, index) => { if (!item.date) blockers.push("Schedule " + (index + 1) + " needs a valid date"); if (!item.start || !item.end) blockers.push("Schedule " + (index + 1) + " needs start and end times"); if (item.start && item.end && item.end <= item.start) blockers.push("Schedule " + (index + 1) + " must finish after it starts"); if (!item.venueId && !item.venueName && !item.onlineUrl) blockers.push("Schedule " + (index + 1) + " needs a venue or online link"); }); if (!rosterCount_(event.participation)) warnings.push("No participants or school groups have been selected yet"); return { valid: !blockers.length, blockers: Array.from(new Set(blockers)), warnings }; }
  function changedFields_(before, after) { return ["title", "shortName", "eventType", "description", "purpose", "publicDescription", "internalNotes", "department", "leadStaffId", "ownerStaffId", "operationalLeadStaffId", "deadlines", "emergencyContact", "schedule", "venue", "participation", "logistics"].filter(field => JSON.stringify(before[field] || null) !== JSON.stringify(after[field] || null)); }
  function recordVersion_(event, user, reason, changedFields) { PlatformStoreService.putLarge(VERSIONS, { id: PlatformStoreService.createId("EVVER"), entityType: "EventVersion", eventId: event.id, version: event.version, status: event.status, reason: reason || "Updated", changedFields: changedFields || [], actor: user.email, occurredAt: new Date().toISOString(), snapshot: { title: event.title, shortName: event.shortName, eventType: event.eventType, purpose: event.purpose, publicDescription: event.publicDescription, timelineEventId: event.timelineEventId, deadlines: event.deadlines, emergencyContact: event.emergencyContact, schedule: event.schedule, venue: event.venue, participation: event.participation, logistics: event.logistics, risk: event.risk, permissions: event.permissions, communications: event.communications, attendance: event.attendance } }, 5000); }
  function audit_(action, event, user, details) { AuditService.record(action, { type: "ManagedEvent", id: event.id }, Object.assign({ eventVersion: event.version, actor: user.email }, details || {})); }
  function requireEvent_(id, user) { const event = find_(id); if (!event || !scopeAllows_(user, event)) throw new Error("The managed event is unavailable or inaccessible."); return event; }
  function find_(id) { return PlatformStoreService.listLarge(EVENTS).find(item => item.id === String(id || "")) || null; }
  function scopeAllows_(user, event) { const scope = user.scope || { type: "production", values: [] }; if (!scope.type || scope.type === "production") return true; const values = (scope.values || []).map(EntityModelService.normaliseKey); if (!values.length) return false; const candidates = scope.type === "department" ? [event.department] : scope.type === "event" ? [event.id, event.timelineEventId] : scope.type === "category" ? (event.participation && event.participation.categories || []).map(item => item.id) : scope.type === "item" ? (event.participation && event.participation.items || []).map(item => item.id) : scope.type === "school" ? (event.participation && event.participation.participants || []).map(item => item.schoolId) : []; return candidates.map(EntityModelService.normaliseKey).some(value => values.includes(value)); }
  function capabilityModel_(user) { return Object.keys(COMMANDS).reduce((output, command) => { output[command] = AuthorizationService.hasCapability(user, COMMANDS[command]); return output; }, {}); }
  function permissionProjection_(records, user) {
    const summary = summariseStatuses_(records);
    if (!AuthorizationService.hasCapability(user, "Events.ViewPermissions")) return Object.assign({}, summary, { items: [], restricted: true });
    const canViewHealth = AuthorizationService.hasCapability(user, "Events.ViewMedicalResponses");
    summary.items = records.slice(0, 100).map(item => ({
      id: item.id, eventId: item.eventId, participantId: item.participantId, schoolId: item.schoolId,
      formId: item.formId, eventVersion: item.eventVersion, permissionVersion: item.permissionVersion,
      status: item.status, consent: item.consent, issuedAt: item.issuedAt, submittedAt: item.submittedAt,
      responseId: item.responseId, departureResponse: item.departureResponse, mealLeaveResponse: item.mealLeaveResponse,
      healthReviewStatus: canViewHealth ? item.healthReviewStatus : item.healthReviewStatus === "Review required" ? "Restricted review required" : "Restricted"
    }));
    return summary;
  }
  function schoolNotificationProjection_(records, user) {
    const summary = summariseStatuses_(records);
    if (!AuthorizationService.hasCapability(user, "Events.ManageCommunications")) return Object.assign({}, summary, { items: [], restricted: true });
    return summary;
  }
  function summariseStatuses_(records) { return { total: records.length, byStatus: records.reduce((map, item) => { map[item.status || "Unknown"] = (map[item.status || "Unknown"] || 0) + 1; return map; }, {}), items: records.slice(0, 100) }; }
  function rosterCounts_(value) { return { participantCount: (value.participants || []).length, staffCount: (value.staff || []).length, schoolGroupCount: (value.schoolGroups || []).length, itemCount: (value.items || []).length, categoryCount: (value.categories || []).length }; }
  function rosterCount_(value) { value = value || {}; return (value.participants || []).length + (value.schoolGroups || []).length; }
  function money_(value) { const amount = Number(value); return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0; }
  function dateKey_(value) { const text = String(value || "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ""; }
  function time_(value) { const text = String(value || "").trim(); const match = text.match(/^(\d{1,2}):(\d{2})/); if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return ""; return String(Number(match[1])).padStart(2, "0") + ":" + match[2]; }
  function todayKey_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"); }
  function success_(command, data) { return { ok: true, command, data, generatedAt: new Date().toISOString() }; }
  function failure_(command, code, message) { return { ok: false, command, errorCode: code, error: String(message || "Event command failed."), generatedAt: new Date().toISOString() }; }
  return { list, get, getByReference, execute, dashboardProjection, toEventSummary, recordPermissionResponse, commands: () => Object.assign({}, COMMANDS), statuses: () => STATUSES.slice() };
})();
