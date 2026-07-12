/** Persists and transitions workflow execution records through queue states. */
const OperationsQueueService = (() => {
  const STATUSES = ["Pending", "Running", "Completed", "Failed", "Cancelled"];
  function enqueue(input) { const value = input || {}; return PlatformStoreService.put("workflow_queue", { id: PlatformStoreService.createId("WEX"), entityType: "WorkflowExecution", workflowId: value.workflowId || "", workflowVersion: value.workflowVersion || "", status: "Pending", approvalStatus: value.approvalRequired ? "Awaiting Approval" : "Not Required", trigger: value.trigger || {}, inputs: PlatformStoreService.safeData(value.inputs || {}), requestedBy: value.requestedBy || UserContextService.getEmail() || "system", dependencies: value.dependencies || [], createdAt: new Date().toISOString(), startedAt: "", completedAt: "", error: "", outputs: {} }, 80); }
  function transition(id, status, changes) { if (!STATUSES.includes(status)) throw new Error("Invalid queue status."); const timestamps = status === "Running" ? { startedAt: new Date().toISOString() } : ["Completed", "Failed", "Cancelled"].includes(status) ? { completedAt: new Date().toISOString() } : {}; return PlatformStoreService.update("workflow_queue", id, Object.assign({}, changes || {}, timestamps, { status }), 80); }
  function list(filters) { const status = filters && filters.status; return PlatformStoreService.list("workflow_queue").filter(item => !status || item.status === status); }
  function summary() { const items = list(); return STATUSES.reduce((out, status) => { out[status.toLowerCase()] = items.filter(item => item.status === status).length; return out; }, { total: items.length }); }
  return { enqueue, transition, list, summary, STATUSES };
})();
