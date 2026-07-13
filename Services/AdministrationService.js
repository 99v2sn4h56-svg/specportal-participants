/** Read-only Administration Centre aggregate built from existing platform services. */
const AdministrationService = (() => {
  function getData() {
    const currentUser = UserContextService.getCurrent();
    if (!AuthorizationService.hasCapability(currentUser, "Administration.View")) {
      throw new Error("Administration.View is required.");
    }
    const users = StaffService.getAll().map(buildUser_);
    const sources = SourceRegistryService.getForUser(currentUser).map(source => Object.assign({}, source, {
      health: source.source === "Not connected" || source.direction === "none" ? "Not Connected" : "Registered",
      cache: source.cacheSeconds ? `${source.cacheSeconds}s` : "None",
      cacheAge: "Not measured",
      spreadsheet: source.source,
      sheetNames: sheetNamesFor_(source.id),
      lastSync: "Not tracked",
      stableId: source.identityField,
      readCapability: readCapabilityFor_(source.id),
      interaction: source.editable ? "Preview and capability metadata" : "Read-only projection"
    }));
    const consoleData = safeCall_("Operations Console", () => OperationsConsoleService.getData(), emptyConsole_());
    const workflows = WorkflowRegistryService.getAll();
    const authorization = AuthorizationService.getModel();
    return {
      generatedAt: new Date().toISOString(),
      currentUser: buildUser_(currentUser),
      users,
      permissions: { capabilities: authorization.capabilities, roles: authorization.roles, matrix: users.map(buildPermissionRow_) },
      modules: sources,
      sources,
      workflows,
      jobs: consoleData.jobs || [],
      jobRegistry: consoleData.jobRegistry || [],
      automationRules: consoleData.automationRules || [],
      notifications: consoleData.notifications || [],
      notificationChannels: consoleData.notificationChannels || [],
      audit: consoleData.audit || [],
      health: buildHealth_(users, sources, workflows, consoleData),
      authentication: buildAuthentication_(currentUser),
      registry: {
        entities: Object.keys(EntityModelService.TYPES).map(key => EntityModelService.TYPES[key]),
        relationships: RelationshipService.getModel(),
        sources,
        workflows,
        capabilities: authorization.capabilities,
        actions: sources.flatMap(source => (source.actions || []).map(action => ({ module: source.id, action }))),
        aiExtensions: consoleData.aiExtensions || []
      }
    };
  }

  function buildUser_(staff) {
    const user = staff || {};
    const effective = AuthorizationService.resolveGrants(user).map(grant => grant.capability);
    return {
      id: user.id || EntityModelService.stableId("STF", user.email || user.name),
      name: user.name || user.displayName || "Authenticated user",
      email: user.email || "",
      role: user.role || "Production Team Member",
      capabilities: effective,
      productionArea: user.team || user.department || "",
      department: user.department || user.team || "",
      administrator: effective.includes("Administration.View") || effective.includes("Operations.Admin"),
      status: user.status || "Active",
      lastSeen: "Not tracked",
      authenticationSource: "Google Workspace",
      source: user.source || "Staff Production Team spreadsheet",
      scope: user.scope || { type: "production", values: [] },
      rawPermissions: user.permissions || [],
      rawAccess: user.access || []
    };
  }

  function buildPermissionRow_(user) {
    const roleCapabilities = AuthorizationService.getRoleCapabilities(user.role);
    const direct = (user.rawPermissions || []).concat(user.rawAccess || []).map(AuthorizationService.normaliseCapability);
    const grants = {};
    AuthorizationService.getModel().capabilities.forEach(capability => {
      grants[capability] = direct.includes(capability) ? "Granted" : roleCapabilities.includes(capability) ? "Inherited" : "Unavailable";
    });
    return { id: user.id, name: user.name, email: user.email, role: user.role, scope: user.scope, grants };
  }

  function buildHealth_(users, sources, workflows, consoleData) {
    return [
      health_("Attendance", () => AttendanceService.getSummary(), result => result && result.ok, result => result && result.data && result.data.totalEvents),
      health_("Timeline", () => TimelineService.getTimelineEvents(), Array.isArray, result => result.length),
      health_("Participants", () => ParticipantService.getAll(), Array.isArray, result => result.length),
      health_("Staff", () => StaffService.getAll(), Array.isArray, result => result.length),
      health_("Production Overview", () => portalGetProductionOverview(), result => result && result.ok !== false && Array.isArray(result.categories), result => result.categories.length),
      safeHealth_("Headshot delivery", () => SecureImageService.getHealth()),
      safeHealth_("Attendance API", () => AttendanceService.getServiceHealth()),
      health_("Calendar", () => TimelineService.getCalendarData(), result => result && Array.isArray(result.events), result => result.events.length),
      staticHealth_("Dashboard", "Registered", "DashboardService"),
      staticHealth_("Search", "Registered", "PlatformSearchService"),
      staticHealth_("Relationships", "Registered", `${RelationshipService.getModel().length} relationships`),
      health_("Stable IDs", () => StableIdMigrationService.dryRun(), result => result && result.ok, result => (result.timeline.missingIds || 0) + (result.groups.missingIds || 0), "missing IDs"),
      staticHealth_("Permissions", "Registered", `${users.length} users`),
      staticHealth_("Workflow Engine", workflows.some(item => item.enabled) ? "Enabled" : "Disabled", `${workflows.length} workflows`),
      staticHealth_("Notification Engine", "Adapter Only", `${(consoleData.notificationChannels || []).filter(item => item.connected).length} transports`),
      staticHealth_("Jobs", "Adapter Only", `${(consoleData.jobRegistry || []).filter(item => item.adapterConnected).length} adapters`),
      staticHealth_("AI", "Adapter Only", `${(consoleData.aiExtensions || []).filter(item => item.connected).length} hooks`),
      staticHealth_("Registry", "Registered", `${sources.length} sources`)
    ];
  }

  function buildAuthentication_(currentUser) {
    const diagnostics = UserContextService.getDiagnostics();
    return {
      currentUser: {
        displayName: currentUser.displayName,
        googleAccount: currentUser.email,
        matchedStaffRecord: currentUser.isMatched,
        role: currentUser.role,
        department: currentUser.department,
        departments: currentUser.departments || [],
        capabilities: currentUser.capabilities || [],
        scope: currentUser.scope,
        status: currentUser.status
      },
      resolution: currentUser.identity || {},
      cache: currentUser.performance || {},
      lookupTimeMs: diagnostics.lookupTimeMs,
      checks: diagnostics.checks,
      conflicts: StaffService.getIdentityConflicts()
    };
  }

  function health_(name, callback, isHealthy, count, countLabel) {
    const started = Date.now();
    try {
      const result = callback();
      const healthy = isHealthy(result);
      return { name, status: healthy ? "Connected" : "Degraded", cache: "Service managed", responseMs: Date.now() - started, entityCount: count(result) || 0, entityLabel: countLabel || "entities", lastRefresh: new Date().toISOString(), errors: healthy ? "" : (result && result.error || "Health check failed"), dependencies: name };
    } catch (err) {
      return { name, status: "Unavailable", cache: "Unknown", responseMs: Date.now() - started, entityCount: 0, entityLabel: countLabel || "entities", lastRefresh: new Date().toISOString(), errors: err && err.message ? err.message : String(err), dependencies: name };
    }
  }

  function staticHealth_(name, status, dependencies) {
    return { name, status, cache: "N/A", responseMs: 0, entityCount: 0, entityLabel: "entities", lastRefresh: new Date().toISOString(), errors: "", dependencies };
  }

  function safeHealth_(name, callback) {
    try {
      const value = callback() || {};
      return { name, status: value.status || "Unknown", cache: value.cacheAge || "Service managed", responseMs: value.responseMs || 0, entityCount: value.recordCount || 0, entityLabel: "records", lastRefresh: value.lastAttempted || new Date().toISOString(), errors: value.error || "", dependencies: name };
    } catch (err) {
      return { name, status: "Unavailable", cache: "Unknown", responseMs: 0, entityCount: 0, entityLabel: "records", lastRefresh: new Date().toISOString(), errors: err && err.message ? err.message : String(err), dependencies: name };
    }
  }

  function readCapabilityFor_(id) {
    const map = { participants: "Participants.View", schools: "Participants.View", groups: "Participants.View", teachers: "Participants.View", items: "Participants.View", categories: "Participants.View", attendance: "Attendance.View", timeline: "Calendar.View", calendar: "Calendar.View", staff: "Operations.View", users: "Administration.View", workflows: "Workflow.Run", jobs: "Jobs.Run", notifications: "Notifications.View" };
    return map[id] || "Operations.View";
  }

  function sheetNamesFor_(id) {
    const map = { timeline: "Operation Schedule", participants: "INDIVIDUALS(YES)", groups: "GROUPS(YES)", schools: "Schools Master Dataset", staff: "Staff Production Team", attendance: "Event Index + event sheets" };
    return map[id] || "Service managed";
  }

  function safeCall_(label, callback, fallback) {
    try { return callback(); }
    catch (err) { Logger.log(`${label} failed: ${err && err.message ? err.message : err}`); return fallback; }
  }

  function emptyConsole_() { return { jobs: [], jobRegistry: [], automationRules: [], notifications: [], notificationChannels: [], audit: [], aiExtensions: [] }; }
  return { getData };
})();
