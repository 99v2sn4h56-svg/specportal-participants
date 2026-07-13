/**
 * Canonical authenticated-user context for SpecCentral.
 *
 * This is the only service permitted to read Session.getActiveUser(). Other
 * services consume the resolved context and retain server-side authorization.
 */
const UserContextService = (() => {
  const CACHE_SECONDS = 8 * 60;
  const USER_CACHE_KEY = "SPEC_USER_CONTEXT_V1";
  const memory_ = {};

  function getCurrent(options) {
    const started = Date.now();
    const force = !!(options && options.forceRefresh);
    const googleEmail = normaliseEmail_(Session.getActiveUser().getEmail());
    if (!googleEmail) return unauthenticated_(started);
    if (force && StaffService.refresh) StaffService.refresh();
    if (!force) {
      const memory = readMemory_(googleEmail);
      if (memory) return withCachePerformance_(memory, "Memory", started);
      const userCached = readCache_(CacheService.getUserCache(), userKey_(googleEmail));
      if (userCached && userCached.email === googleEmail) return remember_(withCachePerformance_(userCached, "User Cache", started));
      const scriptCached = readCache_(CacheService.getScriptCache(), scriptKey_(googleEmail));
      if (scriptCached && scriptCached.email === googleEmail) return remember_(withCachePerformance_(scriptCached, "Script Cache", started));
    }
    const context = resolve_(googleEmail, started);
    writeCaches_(context);
    return remember_(context);
  }

  function resolve_(googleEmail, started) {
    const lookupStarted = Date.now();
    const staffRecords = StaffService.getAll();
    const match = matchStaff_(staffRecords, googleEmail);
    const lookupMs = Date.now() - lookupStarted;
    if (match.duplicates.length) Logger.log(`UserContext duplicate match for ${googleEmail}: ${match.duplicates.map(item => item.id || item.email || item.name).join(", ")}`);
    if (!match.record) return unmatched_(googleEmail, match, started, lookupMs);

    const staff = match.record;
    const permissionsStarted = Date.now();
    const permissions = StaffService.getPermissions(googleEmail, staff);
    const grants = AuthorizationService.resolveGrants(Object.assign({}, staff, { permissions }));
    const capabilities = Array.from(new Set(grants.map(item => item.capability))).sort();
    const permissionMs = Date.now() - permissionsStarted;
    const departments = unique_(staff.departments || [staff.department, staff.team]);
    const names = splitName_(staff.displayName || staff.name || displayNameFromEmail_(googleEmail));
    return {
      email: googleEmail,
      displayName: staff.displayName || staff.name || displayNameFromEmail_(googleEmail),
      firstName: staff.firstName || names.firstName,
      surname: staff.lastName || names.surname,
      staffId: staff.staffId || staff.id || "",
      role: staff.role || "Production Team Member",
      department: staff.department || staff.team || departments[0] || "",
      departments,
      permissions,
      capabilities,
      scope: staff.scope || { type: "production", values: [] },
      school: staff.school || "",
      mobile: staff.mobile || "",
      typeOfWork: staff.typeOfWork || "",
      assignedItems: unique_(staff.assignedItems),
      assignedEvents: unique_(staff.assignedEvents || staff.allocatedEvents),
      assignedGroups: unique_(staff.assignedGroups),
      allocatedEvents: unique_(staff.assignedEvents || staff.allocatedEvents),
      photo: staff.photo || staff.photoUrl || "",
      isAdmin: capabilities.includes("Administration.View") || capabilities.includes("Settings.Admin"),
      isOperations: capabilities.includes("Operations.View") || capabilities.includes("Operations.Admin"),
      isTeacher: /^teacher$/i.test(staff.role || ""),
      isVolunteer: /^volunteer$/i.test(staff.role || ""),
      permissionLevel: capabilities.includes("Administration.View") ? "Administrator" : capabilities.includes("Operations.View") ? "Operations" : "Standard",
      isMatched: true,
      cacheTimestamp: new Date().toISOString(),
      source: "Staff Production Team spreadsheet",
      status: staff.status || "Active",
      access: staff.access || [],
      visibleModules: StaffService.getVisibleModules(permissions),
      identity: { googleAccount: googleEmail, matched: true, matchedUsing: match.method, duplicateCount: 0 },
      performance: { authenticationMs: Date.now() - started, staffLookupMs: lookupMs, permissionBuildMs: permissionMs, dashboardLoadMs: 0, cache: "Miss", cacheHit: false, cacheHits: 0, cacheMisses: 1 }
    };
  }

  function matchStaff_(records, googleEmail) {
    const tiers = [
      ["Primary email", ["primaryEmail", "email"]],
      ["Secondary email", ["secondaryEmail"]],
      ["Personal email", ["personalEmail"]],
      ["Alias email", ["aliasEmails"]],
      ["Legacy email", ["legacyEmails"]]
    ];
    const allEmailFields = tiers.flatMap(tier => tier[1]);
    const allMatches = (records || []).filter(record => allEmailFields.some(field => list_(record[field]).map(normaliseEmail_).includes(googleEmail)));
    if (allMatches.length > 1) return { record: null, method: "Multiple email fields", duplicates: allMatches };
    for (const tier of tiers) {
      const matches = (records || []).filter(record => tier[1].some(field => list_(record[field]).map(normaliseEmail_).includes(googleEmail)));
      if (matches.length === 1) return { record: matches[0], method: tier[0], duplicates: [] };
      if (matches.length > 1) return { record: null, method: tier[0], duplicates: matches };
    }
    const local = googleEmail.split("@")[0];
    const staffIdMatches = (records || []).filter(record => normaliseIdentity_(record.staffId) === normaliseIdentity_(local));
    if (staffIdMatches.length === 1) return { record: staffIdMatches[0], method: "Staff ID", duplicates: [] };
    return { record: null, method: staffIdMatches.length ? "Staff ID" : "No match", duplicates: staffIdMatches };
  }

  function unmatched_(email, match, started, lookupMs) {
    const names = splitName_(displayNameFromEmail_(email));
    return {
      email,
      displayName: displayNameFromEmail_(email), firstName: names.firstName, surname: names.surname,
      staffId: "", role: "Authenticated user", department: "", departments: [],
      permissions: ["dashboard.view"], capabilities: [], scope: { type: "production", values: [] }, school: "",
      assignedItems: [], assignedEvents: [], assignedGroups: [], allocatedEvents: [], photo: "",
      isAdmin: false, isOperations: false, isTeacher: false, isVolunteer: false, isMatched: false,
      permissionLevel: "Authenticated only",
      cacheTimestamp: new Date().toISOString(), source: "Google Workspace authentication", status: match.duplicates.length ? "Duplicate Staff Profiles" : "No Staff Profile Found",
      access: ["dashboard"], visibleModules: ["dashboard"],
      identity: { googleAccount: email, matched: false, matchedUsing: match.method, duplicateCount: match.duplicates.length },
      performance: { authenticationMs: Date.now() - started, staffLookupMs: lookupMs, permissionBuildMs: 0, dashboardLoadMs: 0, cache: "Miss", cacheHit: false, cacheHits: 0, cacheMisses: 1 }
    };
  }

  function unauthenticated_(started) {
    return { email: "", displayName: "Signed-out user", firstName: "", surname: "", staffId: "", role: "Unauthenticated", department: "", departments: [], permissions: [], capabilities: [], scope: { type: "production", values: [] }, school: "", assignedItems: [], assignedEvents: [], assignedGroups: [], allocatedEvents: [], photo: "", isAdmin: false, isOperations: false, isTeacher: false, isVolunteer: false, permissionLevel: "Unauthenticated", isMatched: false, cacheTimestamp: new Date().toISOString(), source: "Google Workspace authentication", status: "Authentication Required", access: [], visibleModules: [], identity: { googleAccount: "", matched: false, matchedUsing: "No Google account", duplicateCount: 0 }, performance: { authenticationMs: Date.now() - started, staffLookupMs: 0, permissionBuildMs: 0, cache: "Miss", cacheHit: false } };
  }

  function getDiagnostics(options) {
    const started = Date.now();
    const context = getCurrent(options);
    const checks = [
      check_("Google authentication", !!context.email, context.email || "No active Google account"),
      check_("Staff lookup", context.isMatched, context.status),
      check_("Role resolution", context.isMatched && !!context.role, context.role || "No role assigned"),
      check_("Capability loading", context.capabilities.length > 0, `${context.capabilities.length} effective capabilities`),
      check_("Department assignment", !!context.department || context.isTeacher || context.isVolunteer, context.department || "No department assigned"),
      check_("Scope loading", !!context.scope && !!context.scope.type, context.scope && context.scope.type || "No scope"),
      check_("Timeline access", hasCapability("Calendar.View"), hasCapability("Calendar.View") ? "Granted" : "Not granted"),
      check_("Attendance access", hasCapability("Attendance.View"), hasCapability("Attendance.View") ? "Granted" : "Not granted"),
      check_("Administration access", hasCapability("Administration.View"), hasCapability("Administration.View") ? "Granted" : "Not granted", true),
      check_("Cache health", !!context.cacheTimestamp, `${context.performance.cache} · ${context.cacheTimestamp}`)
    ];
    return { generatedAt: new Date().toISOString(), context, checks, lookupTimeMs: Date.now() - started, cache: context.performance };
  }

  function hasCapability(capability, scopeContext) { return AuthorizationService.hasCapability(getCurrent(), capability, scopeContext); }
  function requireCapability(capability, scopeContext) { const context = getCurrent(); if (!context.email || !AuthorizationService.hasCapability(context, capability, scopeContext)) throw new Error(`${capability} is required.`); return context; }
  function getEmail() { return getCurrent().email || ""; }
  function refresh() { return getCurrent({ forceRefresh: true }); }
  function recordMetric(name, value) { const context = getCurrent(); context.performance = Object.assign({}, context.performance); context.performance[name] = Number(value) || 0; writeCaches_(context); return remember_(context); }

  function writeCaches_(context) { const json = JSON.stringify(context); try { CacheService.getUserCache().put(userKey_(context.email), json, CACHE_SECONDS); } catch (err) {} try { CacheService.getScriptCache().put(scriptKey_(context.email), json, CACHE_SECONDS); } catch (err) {} }
  function readCache_(cache, key) { try { const value = cache.get(key); return value ? JSON.parse(value) : null; } catch (err) { return null; } }
  function readMemory_(email) { const item = memory_[email]; return item && item.epoch === staffEpoch_() && item.expires > Date.now() ? clone_(item.value) : null; }
  function remember_(context) { if (context.email) memory_[context.email] = { value: clone_(context), epoch: staffEpoch_(), expires: Date.now() + CACHE_SECONDS * 1000 }; return clone_(context); }
  function withCachePerformance_(context, layer, started) { const copy = clone_(context); copy.performance = Object.assign({}, copy.performance, { lastRequestMs: Date.now() - started, cache: layer, cacheHit: true, cacheHits: Number(copy.performance && copy.performance.cacheHits || 0) + 1 }); return copy; }
  function staffEpoch_() { try { return CacheService.getScriptCache().get("SC_STAFF_EPOCH") || "0"; } catch (err) { return "0"; } }
  function scriptKey_(email) { return `SPEC_USER_CONTEXT_${staffEpoch_()}_${normaliseIdentity_(email).slice(0, 80)}`; }
  function userKey_(email) { return `${USER_CACHE_KEY}_${staffEpoch_()}_${normaliseIdentity_(email).slice(0, 80)}`; }
  function check_(name, ok, detail, informational) { return { name, status: ok ? "Passed" : informational ? "Informational" : "Failed", ok: !!ok, detail }; }
  function displayNameFromEmail_(email) { const local = String(email || "").split("@")[0]; return local.split(/[._-]+/).filter(Boolean).map(value => value.charAt(0).toUpperCase() + value.slice(1)).join(" ") || "Authenticated user"; }
  function splitName_(name) { const parts = String(name || "").trim().split(/\s+/).filter(Boolean); return { firstName: parts[0] || "", surname: parts.slice(1).join(" ") }; }
  function list_(value) { return Array.isArray(value) ? value : String(value || "").split(/[,;\n]+/).map(item => item.trim()).filter(Boolean); }
  function unique_(values) { const seen = {}; return list_(values).filter(value => { const key = normaliseIdentity_(value); if (!key || seen[key]) return false; seen[key] = true; return true; }); }
  function normaliseEmail_(value) { return String(value || "").trim().toLowerCase(); }
  function normaliseIdentity_(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9@._-]+/g, "").trim(); }
  function clone_(value) { return JSON.parse(JSON.stringify(value)); }

  return { getCurrent, getDiagnostics, getEmail, hasCapability, requireCapability, refresh, recordMetric };
})();
