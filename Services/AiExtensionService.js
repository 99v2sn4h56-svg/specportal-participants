/** Adapter registry for future AI assistance. No AI provider is invoked here. */
const AiExtensionService = (() => {
  const HOOKS = ["SuggestRehearsalClashes", "SuggestStaffing", "PredictAttendanceIssues", "RecommendVenueAllocations", "HighlightMissingStudents", "GenerateRehearsalBrief", "CreateRiskAssessment", "SummariseDay", "DraftCommunications"];
  const adapters = {};
  function register(hook, adapter) { if (!HOOKS.includes(hook) || typeof adapter !== "function") throw new Error("Invalid AI extension hook."); adapters[hook] = adapter; }
  function invoke(hook, context) { if (!adapters[hook]) return { ok: false, status: "Not Connected", hook }; return { ok: true, status: "Connected", hook, data: adapters[hook](PlatformStoreService.safeData(context || {})) }; }
  function getRegistry() { return HOOKS.map(hook => ({ hook, connected: !!adapters[hook] })); }
  return { register, invoke, getRegistry, HOOKS };
})();
