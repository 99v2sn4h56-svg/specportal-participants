/**
 * Adapter registry for CommandService. Timeline supports read-only preparation
 * and conflict checks; no adapter currently exposes execute().
 */
const CommandAdapterRegistryService = (() => {
  const METADATA = {
    timeline: { id: "timeline", label: "Timeline spreadsheet adapter", available: false, supportsDryRun: true, mode: "read-only-preparation" },
    task: { id: "task", label: "Event task adapter", available: false, supportsDryRun: false, mode: "disabled" }
  };
  function get(id) { return Object.assign({}, METADATA[id] || { id: String(id || ""), available: false, supportsDryRun: false, mode: "unregistered" }); }
  function prepare(id, context) {
    if (id === "timeline") return TimelineCommandAdapterService.prepare(context);
    return { ok: false, errorCode: "COMMAND_ADAPTER_UNAVAILABLE", error: "The command adapter is unavailable." };
  }
  function execute(id, context) {
    return { ok: false, errorCode: "COMMAND_ADAPTER_UNAVAILABLE", error: "No production command adapter is registered.", adapterId: id, context: null };
  }
  function list() { return Object.keys(METADATA).map(get); }
  return { get, prepare, execute, list };
})();
