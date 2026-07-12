/**
 * Generic, fail-closed command lifecycle for future SpecCentral writes.
 * Identity and capabilities are resolved server-side. Feature flags default
 * false, role simulation is read-only, and no production adapter is enabled.
 */
const CommandService = (() => {
  const IDEMPOTENCY_SECONDS = 600;

  function getArchitecture() {
    UserContextService.requireCapability("Operations.View");
    return { enabled: isFlagEnabled_("SPEC_COMMANDS_ENABLED"), mode: "read-only-foundation", commands: CommandRegistryService.list().map(definition => Object.assign({}, definition, { enabled: flagsEnabled_(definition.featureFlags), adapter: CommandAdapterRegistryService.get(definition.adapterId) })), generatedAt: new Date().toISOString() };
  }

  function execute(request) {
    const value = request || {};
    const commandId = String(value.commandId || value.command || "").trim();
    try {
      const definition = CommandRegistryService.get(commandId);
      if (!definition) return failure_(commandId, "COMMAND_NOT_FOUND", "The requested command is not registered.");
      const user = UserContextService.getCurrent();
      if (!user || !user.email) return failure_(commandId, "COMMAND_PERMISSION_DENIED", "Authentication is required.");
      if (value.simulation || value.viewingAsRole || value.effectiveRole) return failure_(commandId, "COMMAND_SIMULATION_READ_ONLY", "Commands cannot execute while role preview is active.");
      const missing = definition.requiredCapabilities.filter(capability => !AuthorizationService.hasCapability(user, capability));
      if (missing.length) return failure_(commandId, "COMMAND_PERMISSION_DENIED", "The current user lacks a required capability.", {}, [], { missingCapabilities: missing });
      if (!flagsEnabled_(definition.featureFlags)) return failure_(commandId, "COMMAND_FEATURE_DISABLED", "This command is disabled by its feature flags.");
      const input = value.input && typeof value.input === "object" && !Array.isArray(value.input) ? value.input : {};
      const fieldErrors = validateInput_(definition.inputSchema, input);
      if (definition.requiresReason && !String(value.reason || "").trim()) fieldErrors.reason = "A reason is required.";
      if (definition.requiresConfirmation && value.confirmation !== true) fieldErrors.confirmation = "Explicit confirmation is required.";
      if (Object.keys(fieldErrors).length) return failure_(commandId, "COMMAND_INPUT_INVALID", "Command input is invalid.", fieldErrors);
      const idempotencyKey = String(value.idempotencyKey || "").trim();
      if (definition.idempotent && !idempotencyKey) return failure_(commandId, "COMMAND_INPUT_INVALID", "An idempotency key is required.", { idempotencyKey: "Required" });
      const duplicateKey = buildIdempotencyKey_(user.email, commandId, idempotencyKey);
      if (!value.dryRun && CacheService.getScriptCache().get(duplicateKey)) return failure_(commandId, "COMMAND_DUPLICATE_REQUEST", "This command request was already accepted.");
      const prepared = CommandAdapterRegistryService.prepare(definition.adapterId, { definition, entityId: String(value.entityId || ""), input, expectedVersion: String(value.expectedVersion || ""), user });
      if (!prepared.ok) return failure_(commandId, prepared.errorCode || "COMMAND_ADAPTER_UNAVAILABLE", prepared.error || "The command adapter is unavailable.", prepared.fieldErrors, prepared.warnings, prepared.details);
      if (value.dryRun) return success_(commandId, true, value.entityId, prepared.before, prepared.proposed, null, prepared.warnings, null);
      const adapter = CommandAdapterRegistryService.get(definition.adapterId);
      if (!adapter.available) return failure_(commandId, "COMMAND_ADAPTER_UNAVAILABLE", "The production command adapter is disabled.");
      const executed = CommandAdapterRegistryService.execute(definition.adapterId, { definition, entityId: String(value.entityId || ""), input, expectedVersion: String(value.expectedVersion || ""), prepared, user });
      if (!executed || !executed.ok) return failure_(commandId, executed && executed.errorCode || "COMMAND_EXECUTION_FAILED", executed && executed.error || "Command execution failed.");
      const audit = AuditService.record(definition.auditEvent, { type: definition.entityType, id: value.entityId || executed.entityId || "" }, {
        commandId, requester: user.email, actualRole: user.role, effectiveRole: user.role,
        featureFlags: definition.featureFlags, reason: value.reason || "", before: prepared.before,
        after: executed.after, sourceVersion: prepared.sourceVersion, result: "Succeeded",
        downstreamEvents: definition.publishedEvents
      });
      (definition.publishedEvents || []).forEach(eventType => PlatformEventService.publish(eventType, { entityId: value.entityId || executed.entityId || "", commandId }, { source: "CommandService", auditId: audit.id }));
      (executed.cacheKeys || []).forEach(cacheKey => { try { CacheService.getScriptCache().remove(cacheKey); } catch (err) {} });
      CacheService.getScriptCache().put(duplicateKey, JSON.stringify({ auditId: audit.id, occurredAt: new Date().toISOString() }), IDEMPOTENCY_SECONDS);
      return success_(commandId, false, value.entityId || executed.entityId, prepared.before, prepared.proposed, executed.after, (prepared.warnings || []).concat(executed.warnings || []), audit.id);
    } catch (err) {
      return failure_(commandId, "COMMAND_EXECUTION_FAILED", err && err.message ? err.message : String(err));
    }
  }

  function validateInput_(schema, input) {
    const config = schema || {}, errors = {}, keys = Object.keys(input || {}), allowed = config.allowed || [];
    keys.forEach(key => { if (!allowed.includes(key)) errors[key] = "This field is not allowed."; });
    (config.required || []).forEach(key => { const value = input[key]; if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) errors[key] = "Required"; });
    (config.arrays || []).forEach(key => { if (input[key] !== undefined && !Array.isArray(input[key])) errors[key] = "Must be an array."; });
    Object.keys(config.maxLengths || {}).forEach(key => { if (input[key] !== undefined && String(input[key]).length > config.maxLengths[key]) errors[key] = "Maximum length is " + config.maxLengths[key] + "."; });
    return errors;
  }
  function flagsEnabled_(flags) { return (flags || []).every(isFlagEnabled_); }
  function isFlagEnabled_(name) { return String(PropertiesService.getScriptProperties().getProperty(name) || "").toLowerCase() === "true"; }
  function buildIdempotencyKey_(email, commandId, key) { const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, [email, commandId, key].join("|")); return "SPEC_COMMAND_" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, "").slice(0, 40); }
  function success_(commandId, dryRun, entityId, before, proposed, after, warnings, auditId) { return { ok: true, commandId, dryRun: !!dryRun, entityId: entityId || "", before: PlatformStoreService.safeData(before), proposed: PlatformStoreService.safeData(proposed), after: PlatformStoreService.safeData(after), warnings: warnings || [], auditId: auditId || "", generatedAt: new Date().toISOString() }; }
  function failure_(commandId, errorCode, error, fieldErrors, warnings, details) { return { ok: false, commandId, errorCode, error: String(error || "Command failed."), fieldErrors: fieldErrors || {}, warnings: warnings || [], details: PlatformStoreService.safeData(details || {}), generatedAt: new Date().toISOString() }; }
  return { getArchitecture, execute };
})();
