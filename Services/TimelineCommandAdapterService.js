/**
 * Read-only Timeline command adapter preparation layer.
 * It locates canonical events by persistent identity, verifies fingerprints and
 * produces allowlisted proposals. It intentionally has no execute function.
 */
const TimelineCommandAdapterService = (() => {
  function prepare(context) {
    const definition = context.definition;
    const entityId = String(context.entityId || "");
    const isCreate = definition.action === "create";
    let current = null;
    if (!isCreate) {
      current = TimelineService.getTimelineEvents().find(event => event.eventId === entityId || event.id === entityId || (event.legacyIds || []).includes(entityId)) || null;
      if (!current) return failure_("COMMAND_ENTITY_NOT_FOUND", "The Timeline event was not found.");
      if (!current.persistentEventId) return failure_("COMMAND_ADAPTER_UNAVAILABLE", "Timeline writes require a persistent Event ID.");
      if (!context.expectedVersion) return failure_("COMMAND_INPUT_INVALID", "An expected source fingerprint is required.", { expectedVersion: "Required" });
      if (String(current.fingerprint || "") !== String(context.expectedVersion)) return failure_("COMMAND_VERSION_CONFLICT", "The Timeline event changed after it was loaded.", {}, { currentVersion: current.fingerprint || "", sourceRow: current.sourceRow || null });
    }
    const before = current ? safeEvent_(current) : null;
    const proposed = Object.assign({}, before || {}, context.input || {});
    if (definition.action === "cancel") proposed.status = "Cancelled";
    if (definition.action === "delete") proposed.status = "Deleted";
    return { ok: true, before, proposed, sourceVersion: current ? current.fingerprint || "" : "new", warnings: [] };
  }
  function safeEvent_(event) {
    const fields = ["eventId", "title", "dateKey", "start", "finish", "venue", "area", "categories", "schoolGroups", "studentGroups", "individualStudents", "staff", "notes", "status", "sourceRow", "fingerprint"];
    const output = {}; fields.forEach(field => { output[field] = event[field] === undefined ? null : event[field]; }); return output;
  }
  function failure_(errorCode, error, fieldErrors, details) { return { ok: false, errorCode, error, fieldErrors: fieldErrors || {}, details: details || {} }; }
  return { prepare };
})();
