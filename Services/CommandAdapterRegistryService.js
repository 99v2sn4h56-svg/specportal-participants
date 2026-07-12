/**
 * Command adapter boundary. Production business adapters are deliberately
 * unavailable until a separately approved write-enabled milestone.
 */
const CommandAdapterRegistryService = (() => {
  const ADAPTERS = {
    timeline: { id: "timeline", label: "Timeline spreadsheet adapter", available: false, mode: "disabled" },
    task: { id: "task", label: "Event task adapter", available: false, mode: "disabled" }
  };

  function get(id) { return Object.assign({}, ADAPTERS[id] || { id, available: false, mode: "unregistered" }); }
  function list() { return Object.keys(ADAPTERS).map(get); }
  return { get, list };
})();
