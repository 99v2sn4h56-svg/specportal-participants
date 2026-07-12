/** Records bounded, sanitized platform audit entries in the shared store. */
const AuditService = (() => {
  function record(action, entity, details) {
    return PlatformStoreService.put("audit", {
      id: PlatformStoreService.createId("AUD"),
      entityType: "AuditRecord",
      action: String(action || "Unknown"),
      entity: entity || null,
      actor: UserContextService.getEmail() || "system",
      occurredAt: new Date().toISOString(),
      details: PlatformStoreService.safeData(details || {})
    }, 120);
  }
  function list(limit) { return PlatformStoreService.list("audit").slice(0, limit || 50); }
  return { record, list };
})();
