/**
 * ==================================================
 * Spec Portal Gateway
 * --------------------------------------------------
 * Thin server-side bridge between Portal.html and the
 * backend services. Business logic should live in the
 * Services/ files, not here.
 * ==================================================
 */

function openSpecPortalHome() {
  const html = HtmlService
    .createTemplateFromFile("Portal")
    .evaluate()
    .setTitle("Spec Central");

  SpreadsheetApp.getUi().showSidebar(html);
}

function doGet(e) {
  const app = String((e && e.parameter && e.parameter.app) || "central").toLowerCase();

  if (app === "mobile") {
    return openMobileSearchWebApp();
  }

  return HtmlService
    .createTemplateFromFile("SpecCentral")
    .evaluate()
    .setTitle("Spec Central")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function openSpecPortalOnOpen_() {
  openSpecPortalHome();
}

function getCurrentStaffContext() {
  return StaffService.getCurrent();
}

function portalGetAuthorizationModel() {
  const user = StaffService.getCurrentUser();
  return {
    grants: AuthorizationService.resolveGrants(user),
    model: AuthorizationService.getModel(),
    modules: SourceRegistryService.getForUser(user),
    sources: SourceRegistryService.getForUser(user),
    adminMode: !!user.isAdmin
  };
}

function portalGetPlatformRegistry() {
  const user = StaffService.getCurrentUser();
  return {
    entities: Object.keys(EntityModelService.TYPES).map(key => EntityModelService.TYPES[key]),
    relationships: RelationshipService.getModel(),
    sources: SourceRegistryService.getForUser(user),
    capabilities: AuthorizationService.getModel(),
    generatedAt: new Date().toISOString()
  };
}

function portalGetStableIdMigrationReport() {
  return StableIdMigrationService.dryRun();
}

function portalGetWorkflowArchitecture() {
  requirePortalCapability_("Operations.View");
  return WorkflowService.getArchitecture();
}

function portalDryRunWorkflow(workflowId, inputs) {
  return WorkflowService.execute(workflowId, inputs || {}, { dryRun: true, trigger: { type: "Manual" } });
}

function portalExecuteWorkflow(workflowId, inputs) {
  return WorkflowService.execute(workflowId, inputs || {}, { trigger: { type: "Manual" } });
}

function portalGetOperationsConsole() {
  return OperationsConsoleService.getData();
}

function portalPublishPlatformEvent(eventType, payload) {
  requirePortalCapability_("Workflow.Admin");
  return WorkflowService.publishEvent(eventType, payload || {}, { source: "SpecPortal gateway" });
}

function portalEnqueueJob(jobType, payload) {
  requirePortalCapability_("Jobs.Run");
  return JobService.enqueue(jobType, payload || {});
}

function portalRunNextJob() {
  requirePortalCapability_("Workflow.Admin");
  return JobService.runNext();
}

function requirePortalCapability_(capability) {
  const email = Session.getActiveUser().getEmail();
  if (!email || !StaffService.hasPermission(email, capability)) throw new Error(`${capability} is required.`);
}

function portalApplyStableIdMigration(request) {
  return StableIdMigrationService.apply(request);
}

function portalPlatformSearch(query, options) {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error("Authentication is required.");
  return PlatformSearchService.search(query, options);
}

function portalGetRelationship(request) {
  const email = Session.getActiveUser().getEmail();
  if (!email || !StaffService.hasPermission(email, "Participants.View")) {
    throw new Error("Participants.View is required.");
  }
  const input = request || {};
  const action = String(input.action || "");
  let data;
  if (action === "participant-rehearsals") data = RelationshipService.getRehearsalsForParticipant(input.studentKey).map(toSafeEventReference_);
  else if (action === "event-participants") data = RelationshipService.getAffectedParticipants(input.eventId).map(toSafeParticipantReference_);
  else if (action === "segment-schools") data = RelationshipService.getSchoolsForSegment(input.segment);
  else if (action === "date-teachers") data = RelationshipService.getTeachersForDate(input.dateKey);
  else if (action === "venue-participants") data = RelationshipService.getParticipantsAtVenue(input.venue, input.dateKey).map(toSafeParticipantReference_);
  else throw new Error("Unknown relationship query.");
  return { ok: true, action, generatedAt: new Date().toISOString(), data };
}

function toSafeParticipantReference_(participant) {
  return { id: participant.id, studentKey: participant.studentKey, name: participant.name, school: participant.school, item: participant.item, category: participant.category || participant.discipline };
}

function toSafeEventReference_(event) {
  return { id: event.id, eventId: event.eventId, title: event.title, date: event.date, dateKey: event.dateKey, start: event.start, finish: event.finish, venue: event.venue, area: event.area, eventType: event.eventType };
}

function portalGetSpecCentralConfig() {
  return DashboardService.getContext();
}

function portalSearchParticipants(query) {
  return ParticipantService.search(query);
}

function portalGetAllParticipants() {
  return ParticipantService.getAll();
}

function portalGetAllGroups() {
  return ParticipantService.getGroups();
}

function portalGetSchoolsMasterData() {
  return ParticipantService.getSchoolsMasterData();
}

function portalGetSchoolProfile(schoolName) {
  return ParticipantService.getSchoolProfile(schoolName);
}

function portalGetStudentPhotos() {
  return ProfilePhotoService.getStudentPhotos();
}

function portalGetPhotoDiagnostics() {
  return ProfilePhotoService.getPhotoDiagnostics();
}

function portalRefreshPhotoCache() {
  return ProfilePhotoService.refreshStudentPhotos();
}

function portalGetPortalData() {
  return ParticipantService.getPortalData();
}

function portalGetStaffProductionTeam() {
  return StaffService.getAll();
}

function portalGetRehearsals() {
  return RehearsalService.getAll();
}

function portalRefreshRehearsals() {
  return RehearsalService.refresh();
}

function portalGetCalendarData() {
  return TimelineService.getCalendarData();
}

function portalGetAttendanceConfig() {
  return AttendanceService.getConfig();
}

function portalGetAttendanceSummary() {
  return AttendanceService.getSummary();
}

function portalGetAttendanceEvents() {
  return AttendanceService.getEvents();
}

function portalGetAttendanceEvent(identifier) {
  return AttendanceService.getEvent(identifier);
}

function portalGetAttendanceHealth() {
  return AttendanceService.getHealth();
}

function portalGetParticipantAttendanceHistory(studentKey) {
  const key = String(studentKey || "").trim();
  if (!key) {
    return {
      ok: false,
      action: "participant-history",
      status: "Degraded",
      generatedAt: new Date().toISOString(),
      error: "Student Key is required."
    };
  }

  const email = Session.getActiveUser().getEmail();
  if (!email || !StaffService.hasPermission(email, "participants.view")) {
    return {
      ok: false,
      action: "participant-history",
      status: "Unavailable",
      generatedAt: new Date().toISOString(),
      error: "You do not have access to this participant profile."
    };
  }

  if (!ParticipantService.hasStudentKey(key)) {
    return {
      ok: true,
      action: "participant-history",
      status: "Connected",
      generatedAt: new Date().toISOString(),
      data: []
    };
  }

  return AttendanceService.getParticipantHistory(key);
}

function portalGetParticipantSchedule(studentKey) {
  const key = String(studentKey || "").trim();
  const email = Session.getActiveUser().getEmail();
  if (!key || !email || !StaffService.hasPermission(email, "Participants.View")) {
    return { ok: false, error: "Participant schedule access denied.", data: [] };
  }
  const participant = ParticipantService.getByStudentKey(key);
  return participant
    ? { ok: true, generatedAt: new Date().toISOString(), data: RelationshipService.getRehearsalsForParticipant(key).map(toSafeEventReference_) }
    : { ok: true, generatedAt: new Date().toISOString(), data: [] };
}

function portalGetProjectManagementData() {
  return ProjectManagementService.getDashboardData();
}

function portalGetOperationsData() {
  return ProjectManagementService.getDashboardData();
}

function portalGetMediaTimelineData() {
  return MediaTimelineService.getDashboardData();
}

function createSpecPortalOpenTrigger() {
  const ss = SpreadsheetApp.getActive();

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (["openSpecPortalHome", "openSpecPortalOnOpen_"].includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("openSpecPortalOnOpen_")
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  SpreadsheetApp.getUi().alert("Spec Central auto-open trigger created.");
}
