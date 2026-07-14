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
  const formId = String((e && e.parameter && e.parameter.form) || "").trim();

  if (formId) {
    const template = HtmlService.createTemplateFromFile("PublicForm");
    template.formJson = JSON.stringify(FormResponseService.getPublicDefinition(formId, {
      parentResponseId: String((e && e.parameter && e.parameter.parentResponse) || ""),
      workflowStepId: String((e && e.parameter && e.parameter.workflowStep) || "")
    }));
    return template.evaluate()
      .setTitle("SpecCentral form")
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }

  if (app === "mobile") {
    return openMobileSearchWebApp();
  }

  return HtmlService
    .createTemplateFromFile("SpecCentral")
    .evaluate()
    .setTitle("Spec Central")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function portalListFormDefinitions() {
  requirePortalCapability_("Operations.View");
  return FormResponseService.listDefinitions();
}

function portalGetFormsWorkspaceData(formId) {
  requirePortalCapability_("Operations.View");
  return FormResponseService.getWorkspaceData(String(formId || ""));
}

function portalSetFormStatus(formId, status) {
  requirePortalCapability_("Operations.View");
  return FormResponseService.setStatus(formId, status);
}

function portalSaveFormDefinition(form) {
  requirePortalCapability_("Operations.View");
  return FormResponseService.saveDefinition(form || {});
}

function portalPublishFormDefinition(form) {
  requirePortalCapability_("Operations.View");
  return FormResponseService.publishDefinition(form || {});
}

function portalSubmitFormResponse(request) {
  return FormResponseService.submitResponse(request || {});
}

function portalGetProfileFormResponses(type, id, email) {
  requirePortalCapability_("Participants.View");
  return FormResponseService.responsesForProfile(type, id, email);
}

function openSpecPortalOnOpen_() {
  openSpecPortalHome();
}

function getCurrentStaffContext() {
  const context = Object.assign({}, UserContextService.getCurrent());
  context.hasPhoto = !!context.photo;
  delete context.photo;
  return context;
}

function portalGetAuthorizationModel() {
  requirePortalCapability_("Administration.View");
  const user = UserContextService.getCurrent();
  return {
    grants: AuthorizationService.resolveGrants(user),
    model: AuthorizationService.getModel(),
    modules: SourceRegistryService.getForUser(user),
    sources: SourceRegistryService.getForUser(user),
    adminMode: !!user.isAdmin
  };
}

function portalGetPlatformRegistry() {
  requirePortalCapability_("Administration.View");
  const user = UserContextService.getCurrent();
  return {
    entities: Object.keys(EntityModelService.TYPES).map(key => EntityModelService.TYPES[key]),
    relationships: RelationshipService.getModel(),
    sources: SourceRegistryService.getForUser(user),
    capabilities: AuthorizationService.getModel(),
    generatedAt: new Date().toISOString()
  };
}

function portalGetStableIdMigrationReport() {
  requirePortalCapability_("Operations.Admin");
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

function portalGetProductionExceptions() {
  return ProductionExceptionService.getData();
}

function portalGetAdministrationData() {
  const user = UserContextService.getCurrent();
  requirePortalCapability_("Administration.View");
  const staffEpoch = CacheService.getScriptCache().get("SC_STAFF_EPOCH") || "0";
  return PerformanceCacheService.getOrLoadUser(
    PerformanceCacheService.userProjectionKey(`administration:${staffEpoch}`, user),
    5 * 60,
    () => AdministrationService.getData()
  );
}

function portalUpdateStaffAccessRole(request) {
  requirePortalCapability_("Permissions.Manage");
  return StaffAccessService.updateRole(request || {});
}

function portalSyncData(request) {
  return DataSyncService.sync(request || {});
}

function portalRefreshPageData(module) {
  return DataSyncService.refreshPage(String(module || "dashboard").toLowerCase());
}

function portalGetPerformanceDiagnostics() {
  requirePortalCapability_("Administration.View");
  return {
    generatedAt: new Date().toISOString(),
    cache: { client: "permission-scoped in-memory", server: "compressed script/user CacheService", participantSeconds: 600, timelineSeconds: 300, staffSeconds: 300, dashboardSeconds: 120, attendanceSummarySeconds: 120 },
    sync: DataSyncService.getArchitecture(),
    identity: UserContextService.getDiagnostics()
  };
}

function portalGetUserContextDiagnostics() {
  return UserContextService.getDiagnostics();
}

function portalRefreshUserContext() {
  return UserContextService.refresh();
}

function portalGetMyStaffProfile() {
  return StaffProfileService.getMyProfile();
}

function portalUpdateMyStaffProfile(profile) {
  return StaffProfileService.updateMyProfile(profile || {});
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
  return UserContextService.requireCapability(capability);
}

function filterParticipantsForUser_(participants, user) {
  const scope = user && user.scope || { type: "production", values: [] };
  if (!scope.type || scope.type === "production" || user.isAdmin) return participants || [];
  const allowed = (scope.values || []).map(value => String(value || "").toLowerCase()).filter(Boolean);
  if (!allowed.length) return [];
  return (participants || []).filter(participant => {
    const candidates = scope.type === "category" ? [participant.category, participant.discipline, participant.subDiscipline]
      : scope.type === "item" ? [participant.item]
      : scope.type === "school" ? [participant.school]
      : scope.type === "department" ? [participant.directorate]
      : [];
    return scopeValuesMatch_(candidates, allowed);
  });
}

function filterGroupsForUser_(groups, user) {
  const scope = user && user.scope || { type: "production", values: [] };
  if (!scope.type || scope.type === "production" || user.isAdmin) return groups || [];
  const allowed = (scope.values || []).map(value => String(value || "").toLowerCase()).filter(Boolean);
  return (groups || []).filter(group => {
    const candidates = scope.type === "category" ? [group.category, group.discipline]
      : scope.type === "item" ? [group.item, group.groupName]
      : scope.type === "school" ? [group.school]
      : scope.type === "department" ? [group.directorate, group.department]
      : [];
    return scopeValuesMatch_(candidates, allowed);
  });
}

function filterEventsForUser_(events, user) {
  const scope = user && user.scope || { type: "production", values: [] };
  if (!scope.type || scope.type === "production" || user.isAdmin) return events || [];
  const allowed = (scope.values || []).map(value => String(value || "").toLowerCase()).filter(Boolean);
  if (!allowed.length) return [];
  return (events || []).filter(event => {
    const categories = [].concat(event.categories || event.category || [], event.studentGroups || [], event.schoolGroups || []);
    const candidates = scope.type === "category" ? categories.concat([event.area, event.discipline, event.subDiscipline])
      : scope.type === "item" ? [event.item].concat(event.studentGroups || [])
      : scope.type === "school" ? [].concat(event.schools || [], event.schoolGroups || [])
      : scope.type === "department" ? [event.department, event.area]
      : [];
    return scopeValuesMatch_(candidates, allowed);
  });
}

function scopeValuesMatch_(candidates, allowed) {
  return (candidates || [])
    .flatMap(value => Array.isArray(value) ? value : String(value || "").split(/[,;\n]+/))
    .map(value => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .some(value => allowed.includes(value));
}

function portalApplyStableIdMigration(request) {
  return StableIdMigrationService.apply(request);
}

function portalPlatformSearch(query, options) {
  const context = UserContextService.getCurrent();
  if (!context.email) throw new Error("Authentication is required.");
  const searchEpoch = CacheService.getScriptCache().get("SC_SEARCH_EPOCH") || "0";
  const key = PerformanceCacheService.userProjectionKey(`search:${searchEpoch}:${String(query || "").toLowerCase()}:${Number(options && options.limit) || 50}`, context);
  return PerformanceCacheService.getOrLoadUser(key, 60, () => PlatformSearchService.search(query, options));
}

function portalGetRelationship(request) {
  if (!UserContextService.hasCapability("Participants.View")) {
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
  const user = UserContextService.getCurrent();
  return PerformanceCacheService.getOrLoadUser(
    PerformanceCacheService.userProjectionKey("dashboard", user),
    2 * 60,
    () => DashboardService.getContext()
  );
}

function portalSearchParticipants(query) {
  requirePortalCapability_("Participants.View");
  return ParticipantService.search(query);
}

function portalGetAllParticipants() {
  const user = requirePortalCapability_("Participants.View");
  return filterParticipantsForUser_(PerformanceCacheService.getOrLoad("participants:all", 30 * 60, () => ParticipantService.getAll()), user).map(participant => toSafePortalParticipant_(participant, null));
}

function portalGetProductionOverview() {
  const user = requirePortalCapability_("Participants.View");
  const started = Date.now();
  try {
    return PerformanceCacheService.getOrLoadUser(
      PerformanceCacheService.userProjectionKey("production-overview:v2", user),
      10 * 60,
      () => {
        const all = ParticipantService.getAll();
        const participants = filterParticipantsForUser_(all, user);
        const categories = ParticipantService.getProductionOverview(participants);
        return { ok: true, generatedAt: new Date().toISOString(), lastRefreshed: new Date().toISOString(), categories, diagnostics: { sourceRowCount: all.length, visibleParticipantCount: participants.length, categoryCount: categories.length, cacheSeconds: 600 } };
      }
    );
  } catch (err) {
    return { ok: false, generatedAt: new Date().toISOString(), categories: [], errorCategory: "PARTICIPANT_SOURCE_UNAVAILABLE", error: err && err.message ? err.message : String(err), diagnostics: { responseMs: Date.now() - started } };
  }
}

function portalGetAllGroups() {
  requirePortalCapability_("Participants.View");
  return ParticipantService.getGroups();
}

function portalGetSchoolsMasterData() {
  requirePortalCapability_("Participants.View");
  return ParticipantService.getSchoolsMasterData();
}

function portalGetSchoolProfile(schoolName) {
  requirePortalCapability_("Participants.View");
  return ParticipantService.getSchoolProfile(schoolName);
}

function portalGetStudentPhotos() {
  requirePortalCapability_("Participants.View");
  return {};
}

function portalGetPhotoDiagnostics() {
  requirePortalCapability_("Participants.View");
  return ProfilePhotoService.getPhotoDiagnostics();
}

function portalResolveSecureImages(requests) {
  return SecureImageService.resolveMany(requests || []);
}

function portalGetSecureImageHealth() {
  return SecureImageService.getHealth();
}

function portalRefreshPhotoCache() {
  requirePortalCapability_("Participants.View");
  return ProfilePhotoService.refreshStudentPhotos();
}

function portalGetPortalData() {
  const user = requirePortalCapability_("Participants.View");
  const canonical = PerformanceCacheService.getOrLoad("participants:portal", 30 * 60, () => ParticipantService.getPortalData());
  const participants = filterParticipantsForUser_(canonical.participants || [], user);
  const groups = filterGroupsForUser_(canonical.groups || [], user);
  const schools = new Set(participants.concat(groups).map(item => String(item.school || "").toLowerCase()).filter(Boolean));
  const scope = user.scope || { type: "production", values: [] };
  const canUseCanonicalPhotos = !scope.type || scope.type === "production" || user.isAdmin;
  return {
    participants: participants.map(participant => toSafePortalParticipant_(participant, canonical.photos || {})),
    groups,
    schools: canUseCanonicalPhotos ? (canonical.schools || []) : (canonical.schools || []).filter(item => schools.has(String(item.schoolName || item.name || "").toLowerCase())),
    photos: {}
  };
}

function toSafePortalParticipant_(participant, photoIndex) {
  const value = Object.assign({}, participant || {});
  const photoKey = String(value.name || [value.firstName, value.lastName].filter(Boolean).join(" ")).replace(/\.[^.]+$/, "").replace(/\s*-\s*Headshot$/i, "").replace(/[\-_]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  value.hasPhoto = !!(value.photoId || value.photoUrl || (photoIndex && photoIndex[photoKey]));
  delete value.photoId;
  delete value.photoUrl;
  return value;
}

function portalGetStaffProductionTeam() {
  requirePortalCapability_("Operations.View");
  return StaffDirectoryService.getDirectoryData().staff;
}

function portalGetStaffDirectory() {
  const user = requirePortalCapability_("Operations.View");
  const epoch = CacheService.getScriptCache().get("SC_STAFF_EPOCH") || "0";
  return PerformanceCacheService.getOrLoadUser(
    PerformanceCacheService.userProjectionKey(`staff-directory:${epoch}`, user),
    5 * 60,
    () => StaffDirectoryService.getDirectoryData()
  );
}

function portalGetStaffProfile(staffId) {
  const user = requirePortalCapability_("Operations.View");
  const safeId = String(staffId || "").trim();
  if (!safeId || safeId.length > 180) throw new Error("A valid Staff ID is required.");
  const epoch = CacheService.getScriptCache().get("SC_STAFF_EPOCH") || "0";
  const result = PerformanceCacheService.getOrLoadUser(
    PerformanceCacheService.userProjectionKey(`staff-profile:${epoch}:${safeId}`, user),
    2 * 60,
    () => StaffDirectoryService.getProfile(safeId)
  );
  const profile = result && result.profile || {};
  profile.formResponses = FormResponseService.responsesForProfile("staff", profile.id || profile.staffId || safeId, profile.email || "");
  return result;
}

function portalGetRehearsals() {
  const user = requirePortalCapability_("Calendar.View");
  return filterEventsForUser_(TimelineService.getTimelineEvents({ rehearsalsOnly: true }), user);
}

function portalRefreshRehearsals() {
  const user = requirePortalCapability_("Calendar.View");
  RehearsalService.refresh();
  return filterEventsForUser_(TimelineService.getTimelineEvents({ rehearsalsOnly: true }), user);
}

function portalGetCalendarData() {
  const user = requirePortalCapability_("Calendar.View");
  return PerformanceCacheService.getOrLoadUser(
    PerformanceCacheService.userProjectionKey("calendar", user),
    3 * 60,
    () => {
      const data = TimelineService.getCalendarData();
      return Object.assign({}, data, { events: filterEventsForUser_(data.events || [], user) });
    }
  );
}

function portalGetEventManagerLanding() {
  return EventManagerService.getLanding();
}

function portalGetEventWorkspace(eventId, section, options) {
  return EventManagerService.getWorkspace(eventId, section, options || {});
}

function portalGetCommandArchitecture() {
  return CommandService.getArchitecture();
}

function portalExecuteCommand(request) {
  return CommandService.execute(request || {});
}

function portalGetAttendanceConfig() {
  requirePortalCapability_("Attendance.View");
  return AttendanceService.getConfig();
}

function portalGetAttendanceSummary() {
  requirePortalCapability_("Attendance.View");
  return AttendanceService.getSummary();
}

function portalGetAttendanceEvents() {
  requirePortalCapability_("Attendance.View");
  return AttendanceService.getEvents();
}

function portalGetAttendanceEvent(identifier) {
  requirePortalCapability_("Attendance.View");
  return AttendanceService.getEvent(identifier);
}

function portalGetAttendanceHealth() {
  requirePortalCapability_("Attendance.View");
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

  if (!UserContextService.hasCapability("Participants.View")) {
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
  if (!key || !UserContextService.hasCapability("Participants.View")) {
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
