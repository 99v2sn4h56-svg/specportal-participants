/**
 * Lightweight shell bootstrap.
 *
 * Boundary rule: this service must never read ParticipantService, participant
 * spreadsheets, participant projections, headshots, or participant caches.
 */
const BootstrapService = (() => {
  const CONTRACT = "spec-central-bootstrap-v2";
  const MODULES = Object.freeze({
    dashboard: "",
    participants: "Participants.View",
    attendance: "Attendance.View",
    calendar: "Calendar.View",
    staff: "Operations.View",
    forms: "Operations.View",
    communications: "Communications.View",
    operations: "Operations.View",
    finance: "Reports.Export",
    reports: "Reports.Export",
    administration: "Administration.View",
    settings: "Settings.Admin"
  });

  function getContext() {
    const started = Date.now();
    const user = UserContextService.getCurrent();
    if (!user || !user.email) throw authenticationError_();

    const control = PlatformControlService.getConfig();
    const permissions = buildPermissions_(user);
    const identity = cacheIdentity_(user.email);
    const response = {
      generatedAt: new Date().toISOString(),
      contract: CONTRACT,
      user: {
        id: user.staffId || identity,
        displayName: user.displayName || "Authenticated user",
        email: user.email,
        firstName: user.firstName || "",
        surname: user.surname || "",
        staffId: user.staffId || "",
        role: user.role || "",
        department: user.department || "",
        status: user.status || "",
        isMatched: !!user.isMatched,
        isAdmin: !!user.isAdmin,
        isOperations: !!user.isOperations,
        permissionLevel: user.permissionLevel || "",
        scope: user.scope || { type: "production", values: [] },
        hasPhoto: !!user.photo,
        cacheIdentity: identity
      },
      permissions,
      featureFlags: Object.assign({}, control.featureFlags),
      platform: {
        applicationName: "SpecCentral",
        environment: control.environment,
        buildVersion: control.buildVersion,
        schemaVersion: control.schemaVersion,
        configEpoch: control.configEpoch,
        cacheEpoch: control.cacheEpoch,
        maintenanceMode: !!control.maintenanceMode
      }
    };

    validate_(response);
    response.performance = {
      bootstrapMs: Date.now() - started,
      payloadBytes: JSON.stringify(response).length
    };
    PerformanceTelemetryService.record("startup.bootstrap.server", response.performance.bootstrapMs, {
      payloadBytes: response.performance.payloadBytes,
      projection: "bootstrap",
      status: "completed"
    });
    return response;
  }

  function buildPermissions_(user) {
    const modules = Object.keys(MODULES).reduce((output, moduleName) => {
      const capability = MODULES[moduleName];
      output[moduleName] = !capability || AuthorizationService.hasCapability(user, capability);
      return output;
    }, {});
    const actions = unique_([].concat(user.permissions || [], user.capabilities || [])).reduce((output, action) => {
      output[action] = true;
      return output;
    }, {});
    return {
      roles: unique_([user.role || "Authenticated user"]),
      modules,
      actions
    };
  }

  function validate_(value) {
    if (!isRecord_(value) || !isRecord_(value.user) || !isRecord_(value.permissions) || !isRecord_(value.permissions.modules) || !isRecord_(value.permissions.actions) || !isRecord_(value.featureFlags) || !isRecord_(value.platform)) {
      throw contractError_("The bootstrap response is missing required fields.");
    }
    if (!value.user.id || !value.user.email || !value.user.displayName) throw contractError_("The bootstrap user identity is incomplete.");
    if (value.platform.applicationName !== "SpecCentral" || !value.platform.schemaVersion || !value.platform.buildVersion) throw contractError_("The bootstrap platform contract is incomplete.");
    return value;
  }

  function authenticationError_() {
    const error = new Error("Authentication is required.");
    error.name = "BootstrapAuthenticationError";
    error.code = "AUTHENTICATION_REQUIRED";
    return error;
  }

  function contractError_(message) {
    const error = new Error(message || "The bootstrap response is invalid.");
    error.name = "BootstrapContractError";
    error.code = "INVALID_BOOTSTRAP_RESPONSE";
    return error;
  }

  function isRecord_(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function unique_(values) { return Array.from(new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))).sort(); }
  function cacheIdentity_(email) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(email || "").toLowerCase())).replace(/=+$/, "").slice(0, 24); }

  return { getContext, validate: validate_, getContract: () => CONTRACT };
})();
