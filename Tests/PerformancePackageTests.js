/** Manual/CI-safe regression checks for the first performance package. */
function runPerformancePackageTests() {
  const results = [];
  const assert = (name, condition, detail) => { results.push({ name, passed: !!condition, detail: detail || "" }); if (!condition) throw new Error("Test failed: " + name + (detail ? " · " + JSON.stringify(detail) : "")); };
  const original = {
    userGet: UserContextService.getCurrent,
    userHas: UserContextService.hasCapability,
    userRequire: UserContextService.requireCapability,
    userMetric: UserContextService.recordMetric,
    controlGet: PlatformControlService.getConfig,
    controlNamespace: PlatformControlService.getCacheNamespace,
    authHas: AuthorizationService.hasCapability,
    participantAll: ParticipantService.getAll,
    participantPortal: ParticipantService.getPortalData,
    participantOverview: ParticipantService.getProductionOverview,
    listCache: PerformanceCacheService.getOrLoadUserDetailed,
    timelineSummary: TimelineService.getDashboardSummary,
    announcementActive: AnnouncementService.getActive,
    notificationCurrent: NotificationService.getForCurrentUser,
    taskList: TaskService.list,
    queueSummary: OperationsQueueService.summary,
    auditList: AuditService.list,
    dashboardSnapshot: ParticipantProjectionService.getDashboardSnapshot,
    secureImages: SecureImageService.resolveMany,
    attendanceWebUrl: AttendanceService.getWebAppUrl,
    attendanceSummary: AttendanceService.getSummary,
    attendanceEvents: AttendanceService.getEvents
  };
  const user = { email: "test@example.invalid", displayName: "Test User", firstName: "Test", role: "Operations", department: "Test", status: "Active", isMatched: true, isAdmin: true, isOperations: true, permissions: ["Participants.View"], capabilities: ["Participants.View", "Attendance.View"], scope: { type: "production", values: [] }, performance: { cache: "Test" } };
  const throwParticipantLoad = () => { throw new Error("FULL_PARTICIPANT_LOADER_INVOKED"); };

  try {
    UserContextService.getCurrent = () => JSON.parse(JSON.stringify(user));
    UserContextService.hasCapability = capability => capability === "Calendar.View" ? false : user.capabilities.includes(capability);
    UserContextService.requireCapability = capability => { if (!user.capabilities.includes(capability)) throw new Error(capability + " is required."); return JSON.parse(JSON.stringify(user)); };
    UserContextService.recordMetric = () => user;
    AuthorizationService.hasCapability = (actor, capability) => !capability || (actor.capabilities || []).includes(capability);
    PlatformControlService.getConfig = () => ({ environment: "test", schemaVersion: "test-v1", buildVersion: "test", configEpoch: 1, cacheEpoch: 1, maintenanceMode: false, featureFlags: { lightweightBootstrap: true, attendanceEnabled: true } });
    ParticipantService.getAll = throwParticipantLoad;
    ParticipantService.getPortalData = throwParticipantLoad;

    const bootstrap = BootstrapService.getContext();
    assert("bootstrap does not invoke full participant loader", bootstrap.contract === "spec-central-bootstrap-v2");
    assert("bootstrap contains no participant collection", bootstrap.participants === undefined && bootstrap.groups === undefined && bootstrap.schools === undefined);
    assert("bootstrap returns explicit module and action permissions", bootstrap.permissions.modules.dashboard === true && bootstrap.permissions.modules.participants === true && bootstrap.permissions.actions["Participants.View"] === true);
    assert("bootstrap returns versioned platform control data", bootstrap.platform.applicationName === "SpecCentral" && bootstrap.platform.environment === "test" && bootstrap.platform.configEpoch === 1 && bootstrap.platform.cacheEpoch === 1);
    assert("bootstrap contains no participant records or headshot references", bootstrap.participants === undefined && !/(headshot|photoUrl|photoId)/i.test(JSON.stringify(bootstrap)));
    UserContextService.getCurrent = () => ({ email: "" });
    let authenticationDenied = false;
    try { BootstrapService.getContext(); } catch (error) { authenticationDenied = error && error.code === "AUTHENTICATION_REQUIRED"; }
    assert("bootstrap rejects unauthenticated requests", authenticationDenied);
    UserContextService.getCurrent = () => JSON.parse(JSON.stringify(user));

    TimelineService.getDashboardSummary = () => ({});
    AnnouncementService.getActive = () => [];
    NotificationService.getForCurrentUser = () => [];
    TaskService.list = () => [];
    OperationsQueueService.summary = () => ({});
    AuditService.list = () => [];
    AttendanceService.getSummary = throwParticipantLoad;
    AttendanceService.getEvents = throwParticipantLoad;
    AttendanceService.getWebAppUrl = () => "";
    SecureImageService.resolveMany = throwParticipantLoad;
    ParticipantProjectionService.getDashboardSnapshot = () => ({ categories: [{ name: "Dance", participants: 2 }], totalParticipants: 2, status: "Connected", projection: "dashboard-participant-summary-v1" });
    const dashboard = DashboardService.getProjection();
    assert("Dashboard projection does not invoke full participant loader", dashboard.participantSummary.totalParticipants === 2);
    assert("Dashboard projection contains summaries, not records", dashboard.participants === undefined && dashboard.participantSummary.categories[0].participants === 2);
    assert("Dashboard projection does not scan Attendance or request headshots", dashboard.attendanceEvents.length === 0 && dashboard.attendanceStatus === "Lazy loaded");

    PerformanceCacheService.getOrLoadUserDetailed = (key, ttl, loader) => ({ value: loader(), meta: { cache: "test-miss", durationMs: 1 } });
    ParticipantService.getPortalData = () => ({
      participants: [{ id: "P1", studentKey: "KEY-1", firstName: "Ada", lastName: "Example", name: "Ada Example", school: "Example School", year: "8", category: "Dance", item: "Item A, Item B", studentEmail: "private@example.invalid", parentEmail: "private@example.invalid", photoId: "private-drive-id" }],
      groups: [], schools: [{ id: "S1", schoolName: "Example School", schoolEmail: "private@example.invalid" }], photos: {}
    });
    ParticipantService.getAll = () => ParticipantService.getPortalData().participants;
    const list = ParticipantProjectionService.getList(user);
    assert("Participants module loads participant-list projection", list.projection === "participant-list-v2" && list.participants.length === 1);
    assert("participant-list excludes contact and storage fields", list.participants[0].studentEmail === undefined && list.participants[0].parentEmail === undefined && list.participants[0].photoId === undefined && list.schools[0].schoolEmail === undefined);
    const pageKey = ParticipantProjectionService.pageQueryKey({ page: 1, pageSize: 50 });
    const page = ParticipantProjectionService.getPage({ page: 1, pageSize: 50 }, user);
    assert("participant first-page query key is stable", pageKey === "participant-list-page-v2:page=1:pageSize=50" && page.queryKey === pageKey);
    assert("participant first page is safe for session persistence", page.participants.length === 1 && page.participants[0].studentEmail === undefined && page.participants[0].parentEmail === undefined && page.participants[0].hasMedicalAlert === undefined && page.participants[0].photoId === undefined);
    assert("participant list does not embed detail-only flags", page.participants[0].hasSupportPlan === undefined && page.participants[0].hasSupportAdjustments === undefined && page.participants[0].outstandingForms === undefined);
    assert("participant first-page payload remains bounded", JSON.stringify(page).length < 20000);

    const filters = ParticipantProjectionService.getFilters(user);
    assert("participant-filter projection contains approved lookup values only", filters.projection === "participant-filter-v2" && filters.values.schools[0] === "Example School" && Object.keys(filters.values).every(field => ProjectionContractService.FILTER_FIELDS.includes(field)));
    assert("participant item facets split comma-separated source values", filters.values.items.join("|") === "Item A|Item B", filters.values.items);
    let duplicateRejected = false;
    try { ProjectionContractService.validate("participantList", { projection: "participant-list-v2", generatedAt: new Date().toISOString(), participants: [{ id: "DUP", studentKey: "DUP" }, { id: "DUP", studentKey: "DUP" }] }); } catch (error) { duplicateRejected = error && error.code === "PROJECTION_VALIDATION_FAILED"; }
    assert("duplicate stable participant IDs fail projection validation", duplicateRejected);
    let malformedRejected = false;
    try { ProjectionContractService.validate("participantPage", { projection: "participant-list-page-v2", generatedAt: "not-a-date", participants: [{ id: "P", studentKey: "P", parentEmail: "private@example.invalid" }] }); } catch (error) { malformedRejected = error && error.code === "PROJECTION_VALIDATION_FAILED"; }
    assert("malformed or sensitive participant projection is rejected", malformedRejected);

    AttendanceService.getSummary = () => ({ ok: true, data: { totalEvents: 2, upcomingEvents: 1, countsByStatus: { Present: 4 }, lastUpdated: "2026-07-15T00:00:00.000Z" } });
    AttendanceService.getEvents = () => ({ ok: true, data: [{ sessionId: "EVT-1", date: "15 Jul", dateKey: "2026-07-15", eventName: "Rehearsal", location: "Studio", attendanceCounts: { total: 4, byStatus: { Present: 4 } }, participants: [{ studentKey: "PRIVATE" }] }] });
    const activeAttendance = AttendanceProjectionService.getActive();
    assert("active Attendance projection contains summaries without participant rows", activeAttendance.projection === "attendance-active-v1" && activeAttendance.events.length === 1 && activeAttendance.events[0].participants === undefined && activeAttendance.history === undefined);

    ParticipantService.getAll = () => [{ id: "P1", studentKey: "KEY-1", name: "Ada Example", studentEmail: "detail@example.invalid", photoId: "private-drive-id" }];
    const detail = portalGetParticipantDetail("KEY-1");
    assert("participant detail uses stable key and retains permitted detail", detail.participant.studentKey === "KEY-1" && detail.participant.studentEmail === "detail@example.invalid");
    assert("participant detail hides raw headshot reference", detail.participant.photoId === undefined && detail.participant.photoUrl === undefined);
    UserContextService.requireCapability = () => { throw new Error("Participants.View is required."); };
    let detailDenied = false; try { portalGetParticipantDetail("KEY-1"); } catch (_) { detailDenied = true; }
    assert("participant detail remains permission checked", detailDenied);

    // Real cache service: a second caller observes the completed publication
    // and does not execute its loader. Failed loaders never publish a manifest.
    UserContextService.requireCapability = original.userRequire;
    const cacheKey = "test:single-flight:" + Date.now(), failedKey = cacheKey + ":failed";
    let loads = 0;
    const first = PerformanceCacheService.getOrLoadDetailed(cacheKey, 60, () => { loads++; return { ok: true }; });
    const second = PerformanceCacheService.getOrLoadDetailed(cacheKey, 60, () => { loads++; return { ok: false }; });
    assert("cache lock/single-flight publishes one rebuild", loads === 1 && first.value.ok && second.value.ok, { loads, first: first.meta, second: second.meta });
    let failed = false; try { PerformanceCacheService.getOrLoadDetailed(failedKey, 60, () => { throw new Error("expected"); }); } catch (_) { failed = true; }
    assert("failed cache generation publishes no partial value", failed && PerformanceCacheService.peek(failedKey) === null);
    PerformanceCacheService.remove(cacheKey); PerformanceCacheService.remove(failedKey);

    const swrKey = "test:swr:" + Date.now(), realNow = Date.now;
    let clock = realNow(), swrLoads = 0;
    try {
      Date.now = () => clock;
      const initial = PerformanceCacheService.getOrLoadStaleWhileRevalidateUser(swrKey, 30, 90, () => ({ version: ++swrLoads }));
      clock += 31 * 1000;
      const stale = PerformanceCacheService.getOrLoadStaleWhileRevalidateUser(swrKey, 30, 90, () => ({ version: ++swrLoads }));
      assert("stale projection returns immediately without rebuilding", initial.value.version === 1 && stale.value.version === 1 && stale.meta.isStale && swrLoads === 1);
      const refreshed = PerformanceCacheService.getOrLoadStaleWhileRevalidateUser(swrKey, 30, 90, () => ({ version: ++swrLoads }), { refresh: true });
      assert("stale projection refresh publishes only a complete replacement", refreshed.value.version === 2 && !refreshed.meta.isStale && swrLoads === 2);
      clock += 31 * 1000;
      const preserved = PerformanceCacheService.getOrLoadStaleWhileRevalidateUser(swrKey, 30, 90, () => { throw new Error("expected refresh failure"); }, { refresh: true });
      assert("failed stale refresh preserves the last complete value", preserved.value.version === 2 && preserved.meta.isStale && preserved.meta.cache === "stale-refresh-failed");
    } finally { Date.now = realNow; PerformanceCacheService.removeUser(swrKey); }

    const atomicKey = "test:atomic:" + Date.now(), atomicBase = PerformanceCacheService.debugKey(atomicKey), atomicCache = CacheService.getScriptCache();
    let atomicClock = realNow(), atomicLoads = 0;
    try {
      Date.now = () => atomicClock;
      PerformanceCacheService.getOrLoadStaleWhileRevalidate(atomicKey, 30, 120, () => ({ version: ++atomicLoads }));
      const firstPointer = JSON.parse(atomicCache.get(atomicBase));
      atomicClock += 31 * 1000;
      PerformanceCacheService.getOrLoadStaleWhileRevalidate(atomicKey, 30, 120, () => ({ version: ++atomicLoads }), { refresh: true });
      const secondPointer = JSON.parse(atomicCache.get(atomicBase));
      assert("atomic publication swaps complete cache generations", firstPointer.generation !== secondPointer.generation && !!atomicCache.get(atomicBase + ":" + firstPointer.generation + ":manifest") && !!atomicCache.get(atomicBase + ":" + secondPointer.generation + ":manifest"));
      atomicClock += 31 * 1000;
      const rejected = PerformanceCacheService.getOrLoadStaleWhileRevalidate(atomicKey, 30, 120, () => ({ version: 99 }), { refresh: true, validator: () => { throw new Error("invalid projection"); } });
      const preservedPointer = JSON.parse(atomicCache.get(atomicBase));
      assert("failed validation cannot replace the active generation", rejected.value.version === 2 && preservedPointer.generation === secondPointer.generation);
      atomicCache.remove(atomicBase + ":" + secondPointer.generation + ":0");
      const previousFallback = PerformanceCacheService.peek(atomicKey);
      assert("incomplete active generation falls back to the previous complete generation", previousFallback && previousFallback.value ? previousFallback.value.version === 1 : previousFallback.version === 1);
    } finally { Date.now = realNow; PerformanceCacheService.remove(atomicKey); }

    const expiredLeaseKey = "test:expired-lease:" + Date.now(), expiredLeaseBase = PerformanceCacheService.debugKey(expiredLeaseKey);
    CacheService.getScriptCache().put(expiredLeaseBase + ":lease", JSON.stringify({ token: "old", expiresAt: Date.now() - 1 }), 60);
    const afterExpiredLease = PerformanceCacheService.getOrLoadDetailed(expiredLeaseKey, 60, () => ({ ok: true }));
    assert("expired projection leases do not orphan rebuilds", afterExpiredLease.value.ok === true && afterExpiredLease.meta.cache === "miss-published");
    PerformanceCacheService.remove(expiredLeaseKey);

    let namespace = "schema:1";
    PlatformControlService.getCacheNamespace = () => namespace;
    const versionOne = PerformanceCacheService.debugKey("participant-list");
    namespace = "schema:2";
    const versionTwo = PerformanceCacheService.debugKey("participant-list");
    assert("cache key changes with schema/cache epoch", versionOne !== versionTwo);

    const unrelatedBefore = ProjectionContractService.cacheKey("activeAttendance", { range: "active" }, null);
    PropertiesService.getScriptProperties().setProperty("SC_PARTICIPANT_PROJECTION_EPOCH", "2");
    const participantEpochKey = ProjectionContractService.cacheKey("participantList", {}, user);
    const unrelatedAfter = ProjectionContractService.cacheKey("activeAttendance", { range: "active" }, null);
    assert("targeted participant epoch does not invalidate unrelated projections", unrelatedBefore === unrelatedAfter && participantEpochKey.indexOf("domain=2") >= 0);

    SecureImageService.resolveMany = original.secureImages;
    UserContextService.getCurrent = () => Object.assign({}, user, { capabilities: [] });
    AuthorizationService.hasCapability = () => false;
    ParticipantService.getAll = () => [{ id: "P1", studentKey: "KEY-1", name: "Ada Example" }];
    const originalPhotos = ProfilePhotoService.getStudentPhotos;
    try {
      ProfilePhotoService.getStudentPhotos = () => ({});
      const denied = HeadshotAssetService.resolveMany([{ entityType: "participant", stableId: "KEY-1", size: "small" }]);
      assert("headshot resolution denies unauthorised users", denied.length === 1 && !denied[0].ok && denied[0].errorCategory === "PERMISSION_SCOPE_DENIED");
    } finally { ProfilePhotoService.getStudentPhotos = originalPhotos; }
    assert("headshot interface is stable-ID and storage agnostic", HeadshotAssetService.getContract().version === "headshot-asset-v3" && HeadshotAssetService.getContract().ownerKey === "stableId" && HeadshotAssetService.getContract().futureStorage.indexOf("Cloud Storage") >= 0);
    assert("headshot contract exposes variants without storage references", HeadshotAssetService.getContract().sizes.join(",") === "small,medium,large" && HeadshotAssetService.getContract().rawStorageReferencesExposed === false);
  } finally {
    UserContextService.getCurrent = original.userGet; UserContextService.hasCapability = original.userHas; UserContextService.requireCapability = original.userRequire; UserContextService.recordMetric = original.userMetric;
    PlatformControlService.getConfig = original.controlGet; PlatformControlService.getCacheNamespace = original.controlNamespace; AuthorizationService.hasCapability = original.authHas;
    ParticipantService.getAll = original.participantAll; ParticipantService.getPortalData = original.participantPortal; ParticipantService.getProductionOverview = original.participantOverview;
    PerformanceCacheService.getOrLoadUserDetailed = original.listCache; TimelineService.getDashboardSummary = original.timelineSummary; AnnouncementService.getActive = original.announcementActive;
    NotificationService.getForCurrentUser = original.notificationCurrent; TaskService.list = original.taskList; OperationsQueueService.summary = original.queueSummary; AuditService.list = original.auditList;
    ParticipantProjectionService.getDashboardSnapshot = original.dashboardSnapshot; SecureImageService.resolveMany = original.secureImages;
    AttendanceService.getWebAppUrl = original.attendanceWebUrl; AttendanceService.getSummary = original.attendanceSummary; AttendanceService.getEvents = original.attendanceEvents;
  }
  return { passed: results.every(item => item.passed), count: results.length, results, generatedAt: new Date().toISOString() };
}
