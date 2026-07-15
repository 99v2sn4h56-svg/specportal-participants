/** Manual regression checks for the connected Event Manager workflow. */
function runEventWorkflowTests() {
  const results = [];
  const assert = (name, condition, detail) => { results.push({ name, passed: !!condition, detail: detail || "" }); if (!condition) throw new Error("Test failed: " + name + (detail ? " · " + JSON.stringify(detail) : "")); };
  const originals = {
    listLarge: PlatformStoreService.listLarge, putLarge: PlatformStoreService.putLarge, updateLarge: PlatformStoreService.updateLarge,
    createId: PlatformStoreService.createId, requireCapability: UserContextService.requireCapability,
    hasCapability: UserContextService.hasCapability, authHas: AuthorizationService.hasCapability,
    audit: AuditService.record, formSave: FormResponseService.saveDefinition, taskCreate: TaskService.create
  };
  const memory = {}, clone = value => JSON.parse(JSON.stringify(value));
  let sequence = 0, savedForm = null, createdTasks = [], actor = { email: "coordinator@example.invalid", staffId: "STAFF-COORD", scope: { type: "production", values: [] } };
  try {
    PlatformStoreService.listLarge = collection => clone(memory[collection] || []);
    PlatformStoreService.putLarge = (collection, record, limit) => { const safe = clone(record), rows = (memory[collection] || []).filter(item => item.id !== safe.id); rows.unshift(safe); memory[collection] = rows.slice(0, limit || 2000); return clone(safe); };
    PlatformStoreService.updateLarge = (collection, id, changes, limit) => { const current = (memory[collection] || []).find(item => item.id === id); if (!current) throw new Error("not found"); return PlatformStoreService.putLarge(collection, Object.assign({}, current, changes, { id }), limit); };
    PlatformStoreService.createId = prefix => prefix + "-TEST-" + (++sequence);
    UserContextService.requireCapability = () => clone(actor);
    UserContextService.hasCapability = () => true;
    AuthorizationService.hasCapability = () => true;
    AuditService.record = () => ({});
    FormResponseService.saveDefinition = form => { savedForm = Object.assign({}, clone(form), { id: form.id || "FORM-TEST-" + (++sequence) }); return savedForm; };
    TaskService.create = input => { const task = Object.assign({ id: "TASK-TEST-" + (++sequence) }, clone(input)); createdTasks.push(task); return task; };

    let result = EventWorkflowService.execute("CreateEventDraft", { title: "Regional workshop", eventType: "Workshop", leadStaffId: "STAFF-LEAD", schedule: [{ date: "2026-09-12", start: "09:00", end: "15:00", venueId: "VEN-1", venueName: "Studio A" }] });
    assert("authorised coordinator can create a draft", result.ok && result.data.status === "Draft", result);
    const eventId = result.data.id;
    const draftProjection = EventWorkflowService.dashboardProjection();
    assert("saved upcoming drafts appear in the lightweight Dashboard projection", draftProjection.length === 1 && draftProjection[0].status === "Draft" && draftProjection[0].participation === undefined, draftProjection);
    result = EventWorkflowService.execute("SaveEventRoster", { id: eventId, participation: { mode: "Mixed", participants: [{ id: "STUDENT-1", label: "Ada Example", schoolId: "SCHOOL-1", schoolName: "Example High" }, { id: "student-1", label: "Duplicate Ada", schoolId: "SCHOOL-1", schoolName: "Example High" }, { id: "STUDENT-2", label: "Sam Example", schoolId: "SCHOOL-1", schoolName: "Example High" }], staff: [{ id: "STAFF-LEAD", label: "Lead Teacher", role: "Event lead" }], schoolGroups: [{ id: "GROUP-1", label: "Senior ensemble", schoolId: "SCHOOL-1", schoolName: "Example High", contactTeacherId: "TEACHER-1", contactTeacherName: "Taylor Teacher", contactTeacherEmail: "teacher@example.invalid", schoolEmail: "school@example.invalid", allocatedCount: 12 }], items: [], categories: [] } });
    assert("roster keeps stable participant and school IDs", result.ok && result.data.participation.participants[0].id === "STUDENT-1" && result.data.participation.participants[0].schoolId === "SCHOOL-1");
    assert("roster deduplicates stable IDs without name matching", result.data.participation.participants.length === 2, result.data.participation.participants);
    assert("school groups retain stable school and contact-teacher relationships", result.data.participation.schoolGroups[0].schoolId === "SCHOOL-1" && result.data.participation.schoolGroups[0].contactTeacherId === "TEACHER-1", result.data.participation.schoolGroups[0]);
    const attemptedRosterSmuggle = EventWorkflowService.execute("SaveEventDraft", Object.assign({}, result.data, { title: "Regional workshop updated", participation: { participants: [] } }));
    assert("general event editing cannot bypass the roster capability boundary", attemptedRosterSmuggle.ok && attemptedRosterSmuggle.data.participation.participants.length === 2, attemptedRosterSmuggle);
    result = EventWorkflowService.execute("ActivateEvent", { id: eventId });
    assert("valid core event activates", result.ok && result.data.status === "Active", result);

    result = EventWorkflowService.execute("GenerateRiskAssessment", { id: eventId });
    assert("risk generation creates a human-review draft and never approves it", result.ok && result.data.risk.status === "Draft" && result.data.risk.hazards.length >= 2 && !result.data.risk.approvedAt, result.data.risk);
    result = EventWorkflowService.execute("SaveRiskAssessment", { id: eventId, risk: { ownerId: "STAFF-COORD", approverId: "STAFF-APPROVER", hazards: [{ id: "HAZ-1", label: "Slips" }], controls: [{ id: "CTL-1", label: "Pre-event venue inspection" }], emergencyPlan: "Follow venue evacuation plan." } });
    assert("risk draft is versioned", result.ok && result.data.risk.status === "Draft" && result.data.risk.version === 2);
    result = EventWorkflowService.execute("SubmitRiskAssessment", { id: eventId, risk: result.data.risk });
    assert("risk can enter review", result.ok && result.data.risk.status === "In review");
    actor = { email: "approver@example.invalid", staffId: "STAFF-APPROVER", scope: { type: "production", values: [] } };
    result = EventWorkflowService.execute("ApproveRiskAssessment", { id: eventId, risk: result.data.risk });
    assert("a separate authorised user approves risk", result.ok && result.data.risk.status === "Approved" && result.data.risk.approvedBy === actor.email, result);

    result = EventWorkflowService.execute("GeneratePermissionForm", { id: eventId, dueDate: "2026-08-31" });
    assert("permission generation creates a versioned Forms draft and one request per participant", result.ok && result.data.permissions.formId && result.data.permissions.version === 1 && result.data.permissionRequests.total === 2, result);
    assert("permission Forms payload carries event/version data and requires a unique request reference", savedForm.eventPayload.eventId === eventId && savedForm.eventPayload.eventVersion > 0 && savedForm.questions.some(question => question.mapping === "permissionRequestId" && question.required), savedForm);
    const firstRequest = result.data.permissionRequests.items.find(item => item.participantId === "STUDENT-1");
    const linked = EventWorkflowService.recordPermissionResponse(result.data.permissions.formId, { type: "", id: "", email: "guardian@example.invalid" }, "RESPONSE-1", { permissionRequestId: firstRequest.id, studentId: "STUDENT-1", permissionDecision: "Yes", healthDetailsChanged: "Yes — details require staff review", departureArrangement: "Independent departure where approved", mealLeaveArrangement: "Remaining with the event group" });
    result = EventWorkflowService.get(eventId);
    assert("permission response links by request and participant stable IDs", linked && result.permissionRequests.byStatus.Approved === 1 && result.permissionRequests.items.find(item => item.id === firstRequest.id).departureResponse === "Independent departure where approved", result.permissionRequests);
    assert("health changes create a restricted review flag and task without copying response content", result.permissionRequests.items.find(item => item.id === firstRequest.id).healthReviewStatus === "Review required" && createdTasks.length === 1 && createdTasks[0].notes.indexOf("restricted Forms response") >= 0, createdTasks);
    const liveAuthHas = AuthorizationService.hasCapability;
    AuthorizationService.hasCapability = (user, capability) => !["Events.ViewPermissions", "Events.ViewMedicalResponses", "Participants.View", "Events.ManageRoster", "Events.ManageRisk", "Events.ApproveRisk", "Attendance.View", "Events.PrepareAttendance", "Events.ManageCommunications"].includes(capability);
    const restrictedWorkspace = EventWorkflowService.get(eventId);
    assert("permission request detail is withheld without its dedicated capability", restrictedWorkspace.permissionRequests.restricted === true && restrictedWorkspace.permissionRequests.items.length === 0, restrictedWorkspace.permissionRequests);
    assert("broad event view omits roster, risk, contact and Attendance detail", restrictedWorkspace.participation.restricted === true && restrictedWorkspace.participation.participants.length === 0 && restrictedWorkspace.risk.restricted === true && restrictedWorkspace.attendance.restricted === true && JSON.stringify(restrictedWorkspace).indexOf("teacher@example.invalid") < 0, restrictedWorkspace);
    AuthorizationService.hasCapability = liveAuthHas;
    result = EventWorkflowService.execute("PrepareSchoolNotifications", { id: eventId });
    assert("school notifications batch by stable School ID", result.ok && result.data.schoolNotifications.total === 1 && result.data.schoolNotifications.items[0].recipientCount === 2 && result.data.schoolNotifications.items[0].contactTeacherId === "TEACHER-1", result);
    result = EventWorkflowService.execute("PrepareAttendanceSessions", { id: eventId });
    assert("Attendance preparation creates schedule-linked drafts without external writes", result.ok && result.data.attendance.sessions.length === 1 && result.data.attendance.adapterState.indexOf("Awaiting") === 0, result);

    result = EventWorkflowService.execute("SaveEventDraft", Object.assign({}, result.data, { schedule: [{ date: "2026-09-13", start: "09:00", end: "15:00", venueId: "VEN-1", venueName: "Studio A" }] }));
    assert("material change invalidates generated permission", result.ok && result.data.permissions.status === "Outdated" && /schedule/.test(result.data.permissions.outdatedReason), result);
    const projection = EventWorkflowService.dashboardProjection();
    assert("dashboard projection is lightweight and includes readiness", projection.length === 1 && projection[0].readiness && projection[0].participation === undefined, projection);

    UserContextService.requireCapability = () => { throw new Error("Events.Create is required."); };
    const denied = EventWorkflowService.execute("CreateEventDraft", { title: "Denied" });
    assert("unauthorised event mutation is rejected", !denied.ok && denied.errorCode === "PERMISSION_DENIED", denied);
  } finally {
    PlatformStoreService.listLarge = originals.listLarge; PlatformStoreService.putLarge = originals.putLarge; PlatformStoreService.updateLarge = originals.updateLarge; PlatformStoreService.createId = originals.createId;
    UserContextService.requireCapability = originals.requireCapability; UserContextService.hasCapability = originals.hasCapability; AuthorizationService.hasCapability = originals.authHas;
    AuditService.record = originals.audit; FormResponseService.saveDefinition = originals.formSave; TaskService.create = originals.taskCreate;
  }
  return { passed: results.every(item => item.passed), results };
}
