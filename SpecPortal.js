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

/** Secret-authenticated service endpoint used only by the Attendance adapter. */
function doPost(e) {
  const generatedAt = new Date().toISOString();
  try {
    const request = JSON.parse(String(e && e.postData && e.postData.contents || "{}"));
    if (request.action !== "resolve-headshots") throw new Error("UNKNOWN_ASSET_ACTION");
    const expected = String(PropertiesService.getScriptProperties().getProperty("SC_ASSET_SERVICE_SECRET") || "");
    const provided = String(request.secret || "");
    if (expected.length < 32 || provided.length !== expected.length || provided !== expected) throw new Error("ASSET_SERVICE_AUTHENTICATION_FAILED");
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: request.action, generatedAt, data: HeadshotAssetService.resolveTrustedMany(request.requests || []) })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, action: "resolve-headshots", generatedAt, errorCategory: /AUTHENTICATION/.test(String(error && error.message)) ? "AUTHENTICATION_FAILED" : "ASSET_REQUEST_FAILED" })).setMimeType(ContentService.MimeType.JSON);
  }
}

function portalGetFormsWorkspaceData(formId) {
  return PerformanceTelemetryService.measureJourney("forms-loading", () => {
    requirePortalCapability_("Operations.View");
    return FormResponseService.getWorkspaceData(String(formId || ""));
  }, { route: "forms", phase: "workspace", projection: "forms-workspace" });
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

function portalImportGoogleFormQuestions(url) {
  requirePortalCapability_("Operations.View");
  return FormResponseService.importGoogleFormQuestions(url);
}

function portalSubmitFormResponse(request) {
  return FormResponseService.submitResponse(request || {});
}

function portalStartFormUpload(request) {
  return FormResponseService.startResumableUpload(request || {});
}

function portalUploadFormChunk(request) {
  return FormResponseService.uploadResumableChunk(request || {});
}

function portalGetProfileFormResponses(type, id, email) {
  requirePortalCapability_("Participants.View");
  return FormResponseService.responsesForProfile(type, id, email);
}

function portalGetCommunicationsWorkspace() {
  return PerformanceTelemetryService.measureJourney("communications-loading", () => CommunicationService.getWorkspace(), { route: "communications", phase: "workspace", projection: "communications-workspace" });
}

function portalExecuteCommunicationCommand(commandName, input) {
  return CommunicationService.execute(String(commandName || ""), input || {});
}

function openSpecPortalOnOpen_() {
  openSpecPortalHome();
}

function getCurrentStaffContext() {
  const context = Object.assign({}, UserContextService.getCurrent());
  context.hasPhoto = !!context.photo;
  context.cacheIdentity = context.email ? Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(context.email).toLowerCase())).replace(/=+$/, "").slice(0, 24) : "anonymous";
  delete context.photo;
  return context;
}

/** Lightweight authenticated shell bootstrap. Contract: spec-central-bootstrap-v2. */
function portalBootstrap() {
  return PerformanceTelemetryService.measureJourney("dashboard-bootstrap", () => BootstrapService.getContext(), { route: "dashboard", phase: "bootstrap", projection: "bootstrap" });
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
    identity: UserContextService.getDiagnostics(),
    telemetry: PerformanceTelemetryService.getDiagnostics(),
    control: PlatformControlService.getConfig(),
    headshots: HeadshotAssetService.getContract()
  };
}

// TEMPORARY -- checking real recorded latency for the Participants page
// specifically. Remove once resolved.
function adminLogParticipantPerformanceSummary() {
  requirePortalCapability_("Administration.View");
  var diagnostics = PerformanceTelemetryService.getDiagnostics();
  var result = {
    sampleCount: diagnostics.sampleCount,
    degraded: diagnostics.degraded,
    degradedReasons: diagnostics.degradedReasons,
    counters: diagnostics.counters,
    participantSummary: (diagnostics.summary || []).filter(function (row) {
      return /participant/i.test(row.route || "") || /participant/i.test(row.projection || "") || /participant/i.test(row.name || "");
    })
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function portalRecordClientPerformanceBatch(metrics, batchId) {
  const user = UserContextService.getCurrent();
  if (!user.email) throw new Error("Authentication is required.");
  return PerformanceTelemetryService.recordClientBatch(metrics, batchId);
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

function portalPlatformSearch(query, options) {
  return PerformanceTelemetryService.measureJourney("participant-search", () => {
    const context = UserContextService.getCurrent();
    if (!context.email) throw new Error("Authentication is required.");
    const searchEpoch = CacheService.getScriptCache().get("SC_SEARCH_EPOCH") || "0";
    const key = PerformanceCacheService.userProjectionKey(`search:${searchEpoch}:${String(query || "").toLowerCase()}:${Number(options && options.limit) || 50}`, context);
    return PerformanceCacheService.getOrLoadUser(key, 60, () => PlatformSearchService.search(query, options));
  }, { route: "search", phase: "platform-search", projection: "platform-search" });
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
  return PerformanceTelemetryService.measureJourney("dashboard-bootstrap", () => {
    const user = UserContextService.getCurrent();
    const cached = PerformanceCacheService.getOrLoadUserDetailed(
      PerformanceCacheService.userProjectionKey("dashboard", user),
      60,
      () => DashboardService.getProjection()
    );
    const control = PlatformControlService.getConfig();
    return Object.assign({}, cached.value, { requestMeta: { cache: cached.meta.cache, cacheStatus: cached.meta.cache, durationMs: cached.meta.durationMs, isStale: false, schemaVersion: control.schemaVersion, cacheEpoch: control.cacheEpoch, payloadBytes: JSON.stringify(cached.value || {}).length } });
  }, { route: "dashboard", phase: "dashboard", projection: "dashboard" });
}

function portalGetDashboardProjection() {
  return portalGetSpecCentralConfig();
}

function portalGetProductionOverview() {
  const user = requirePortalCapability_("Participants.View");
  const started = Date.now();
  try {
    const scope = user.scope || { type: "production", values: [] };
    if (!user.isAdmin && scope.type && scope.type !== "production") return { ok: true, generatedAt: new Date().toISOString(), lastRefreshed: "", categories: [], diagnostics: { sourceRowCount: 0, categoryCount: 0, cache: "scoped-route-only", sourceScans: 0 } };
    const snapshot = ParticipantProjectionService.getDashboardSnapshot();
    return { ok: snapshot.status !== "Not warmed", generatedAt: snapshot.generatedAt || new Date().toISOString(), lastRefreshed: snapshot.generatedAt || "", categories: snapshot.categories || [], diagnostics: { sourceRowCount: snapshot.totalParticipants || 0, categoryCount: (snapshot.categories || []).length, cache: snapshot.cache, sourceScans: 0 } };
  } catch (err) {
    return { ok: false, generatedAt: new Date().toISOString(), categories: [], errorCategory: "PARTICIPANT_SOURCE_UNAVAILABLE", error: err && err.message ? err.message : String(err), diagnostics: { responseMs: Date.now() - started } };
  }
}

function portalResolveSecureImages(requests) {
  return HeadshotAssetService.resolveMany(requests || []);
}

/** Admin-only headshot operations. These never expose Drive file IDs. */
function adminRunHeadshotDiagnostics() {
  requirePortalCapability_("Administration.View");
  const result = { generatedAt: new Date().toISOString(), assets: HeadshotAssetService.diagnostics(), delivery: SecureImageService.getHealth() };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function adminRefreshHeadshotAssets() {
  requirePortalCapability_("Administration.View");
  const refreshed = HeadshotAssetService.refresh();
  ParticipantProjectionService.invalidate(UserContextService.getCurrent());
  PerformanceCacheService.remove("staff:directory");
  if (typeof clearParticipantSearchCache_ === "function") clearParticipantSearchCache_();
  return { refreshedAt: new Date().toISOString(), assets: refreshed };
}

// TEMPORARY -- verifying headshot resolution for a single entity while
// diagnosing photo-loading issues. Remove once resolved.
function adminTestHeadshotResolution(entityType, stableEntityId) {
  requirePortalCapability_("Administration.View");
  return HeadshotAssetService.testResolution(entityType, stableEntityId);
}

function portalGetPortalData() {
  const user = requirePortalCapability_("Participants.View");
  return ParticipantProjectionService.getList(user);
}

function portalGetParticipantListProjection() {
  return ParticipantProjectionService.getList(requirePortalCapability_("Participants.View"));
}

function portalGetParticipantListPage(query, options) {
  return ParticipantProjectionService.getPage(query || {}, requirePortalCapability_("Participants.View"), options || {});
}

function portalGetParticipantFilterProjection(options) {
  return ParticipantProjectionService.getFilters(requirePortalCapability_("Participants.View"), options || {});
}

function portalGetParticipantGroupsProjection(options) {
  return ParticipantProjectionService.getGroups(requirePortalCapability_("Participants.View"), options || {});
}

// Same capability as the detail view, which already exposes this same
// contact data one record at a time -- these just make it reachable for a
// deliberate copy-to-clipboard action instead of a new/looser permission.
function portalGetParticipantContactEmailsFor(studentKey) {
  return ParticipantProjectionService.getContactEmailsFor(studentKey, requirePortalCapability_("Participants.View"));
}

function portalGetParticipantContactEmails(query) {
  return ParticipantProjectionService.getContactEmails(query, requirePortalCapability_("Participants.View"));
}

function portalGetGroupContactEmails() {
  return ParticipantProjectionService.getGroupContactEmails(requirePortalCapability_("Participants.View"));
}

function portalGetParticipantDetail(studentKey) {
  return PerformanceTelemetryService.measureJourney("participant-passport", () => ParticipantProjectionService.getDetail(studentKey, requirePortalCapability_("Participants.View")), { route: "participants", phase: "detail", projection: "participant-detail", records: 1 });
}

/** Trigger-safe shared warming. Install only after an administrator opts in. */
function warmSpecCentralSharedProjections() {
  const participants = ParticipantProjectionService.warmShared();
  let attendance = { status: "Not warmed" };
  try { attendance = AttendanceProjectionService.warm(); } catch (error) { attendance = { status: "Unavailable", errorCategory: "ATTENDANCE_WARM_FAILED" }; }
  return { generatedAt: new Date().toISOString(), participants, attendance };
}

function warmSpecCentralActiveAttendanceProjection() {
  return AttendanceProjectionService.warm();
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

function portalGetCalendarData() {
  return PerformanceTelemetryService.measureJourney("event-loading", () => {
    const user = requirePortalCapability_("Calendar.View");
    return PerformanceCacheService.getOrLoadUser(
      PerformanceCacheService.userProjectionKey("calendar", user),
      3 * 60,
      () => {
        const data = TimelineService.getCalendarData();
        return Object.assign({}, data, { events: filterEventsForUser_(data.events || [], user) });
      }
    );
  }, { route: "calendar", phase: "calendar", projection: "calendar" });
}

function portalGetEventManagerLanding() {
  return PerformanceTelemetryService.measureJourney("event-loading", () => EventManagerService.getLanding(), { route: "operations", phase: "landing", projection: "event-manager" });
}

function portalGetEventWorkspace(eventId, section, options) {
  return PerformanceTelemetryService.measureJourney("event-loading", () => EventManagerService.getWorkspace(eventId, section, options || {}), { route: "operations", phase: "workspace", projection: "event-workspace" });
}

function portalGetManagedEventWorkflow(eventId) {
  return EventWorkflowService.get(String(eventId || ""));
}

function portalGetEventBuilderOptions(type, query) {
  return PerformanceTelemetryService.measureJourney("event-loading", () => EventWorkflowService.getBuilderOptions(type, query || {}), { route: "operations", phase: "builder-options", projection: "event-builder-options" });
}

function portalExecuteEventWorkflowCommand(commandName, input) {
  return EventWorkflowService.execute(String(commandName || ""), input || {});
}

function portalGetAttendanceSummary() {
  requirePortalCapability_("Attendance.View");
  return AttendanceService.getSummary();
}

function portalPeekAttendanceSummary() {
  requirePortalCapability_("Attendance.View");
  return AttendanceService.peekSummary();
}

function portalGetAttendanceEvents() {
  requirePortalCapability_("Attendance.View");
  return AttendanceService.getEvents();
}

function portalIssueAttendanceCheckinToken(sessionId) {
  requirePortalCapability_("Attendance.View");
  const id = String(sessionId || "").trim();
  if (!id) {
    return { ok: false, action: "issue-checkin-token", error: "Session ID is required." };
  }
  return AttendanceService.issueCheckinToken(id);
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
