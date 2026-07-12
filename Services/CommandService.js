/**
 * Safe command gateway foundation. All business commands require actual
 * server-side capabilities, an explicit feature flag and an available adapter.
 * Current adapters and flags are intentionally disabled.
 */
const CommandService = (() => {
  function getArchitecture() {
    UserContextService.requireCapability("Operations.View");
    return {
      enabled: false,
      mode: "read-only-foundation",
      commands: CommandRegistryService.list().map(definition => Object.assign({}, definition, {
        enabled: isFeatureEnabled_(definition.featureFlag),
        adapter: CommandAdapterRegistryService.get(definition.adapterId)
      })),
      generatedAt: new Date().toISOString()
    };
  }

  function execute(request) {
    const input = request || {};
    const commandId = String(input.command || input.commandId || "");
    try {
      if (input.simulation || input.viewingAsRole || input.effectiveRole) return failure_(commandId, "ROLE_SIMULATION_REJECTED", "Commands cannot run while using a simulated role.");
      const definition = CommandRegistryService.get(commandId);
      if (!definition) return failure_(commandId, "COMMAND_UNKNOWN", "Unknown command.");
      const user = UserContextService.getCurrent();
      if (!user || !user.email) return failure_(commandId, "AUTHENTICATION_REQUIRED", "Authentication is required.");
      const missing = definition.requiredCapabilities.filter(capability => !AuthorizationService.hasCapability(user, capability));
      if (missing.length) return failure_(commandId, "CAPABILITY_REQUIRED", "Required capability is unavailable.", { missingCapabilities: missing });
      if (!isFeatureEnabled_(definition.featureFlag)) return failure_(commandId, "FEATURE_DISABLED", "This command is not enabled.");
      if (definition.requiresReason && !String(input.reason || "").trim()) return failure_(commandId, "REASON_REQUIRED", "A reason is required.");
      if (definition.requiresConfirmation && input.confirmation !== true) return failure_(commandId, "CONFIRMATION_REQUIRED", "Explicit confirmation is required.");
      if (!String(input.idempotencyKey || "").trim()) return failure_(commandId, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
      const adapter = CommandAdapterRegistryService.get(definition.adapterId);
      if (!adapter.available) return failure_(commandId, "ADAPTER_UNAVAILABLE", "The production command adapter is disabled.");
      return failure_(commandId, "ADAPTER_UNAVAILABLE", "No executable business adapter is registered.");
    } catch (err) {
      return failure_(commandId, "COMMAND_FAILED", err && err.message ? err.message : String(err));
    }
  }

  function isFeatureEnabled_(propertyName) {
    if (!propertyName) return false;
    return String(PropertiesService.getScriptProperties().getProperty(propertyName) || "").toLowerCase() === "true";
  }

  function failure_(command, code, message, details) {
    return { ok: false, command, code, error: message, details: details || {}, generatedAt: new Date().toISOString() };
  }

  return { getArchitecture, execute };
})();
