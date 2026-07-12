/** First-class workflow task storage, lifecycle and dashboard summaries. */
const TaskService = (() => {
  const STATUSES = ["Pending", "In Progress", "Blocked", "Completed", "Cancelled"];
  const PRIORITIES = ["Low", "Medium", "High", "Critical"];
  function create(input) {
    const value = input || {};
    if (!value.title) throw new Error("Task title is required.");
    const task = {
      id: PlatformStoreService.createId("TSK"), entityType: "Task", title: String(value.title),
      assignedUser: value.assignedUser || "", dueDate: value.dueDate || "", priority: PRIORITIES.includes(value.priority) ? value.priority : "Medium",
      status: STATUSES.includes(value.status) ? value.status : "Pending", module: value.module || "operations",
      entity: value.entity || null, relatedEvent: value.relatedEvent || "", notes: value.notes || "",
      workflowExecutionId: value.workflowExecutionId || "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    PlatformStoreService.put("tasks", task, 100); AuditService.record("TaskCreated", { type: "Task", id: task.id }, { workflowExecutionId: task.workflowExecutionId }); return task;
  }
  function update(id, changes) { return PlatformStoreService.update("tasks", id, Object.assign({}, changes, { updatedAt: new Date().toISOString() }), 100); }
  function list(filters) { const f = filters || {}; return PlatformStoreService.list("tasks").filter(task => (!f.status || task.status === f.status) && (!f.assignedUser || task.assignedUser === f.assignedUser)); }
  function summary(email) { const tasks = list(); const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"); return { myTasks: tasks.filter(t => t.assignedUser === email && !["Completed", "Cancelled"].includes(t.status)).length, overdue: tasks.filter(t => t.dueDate && t.dueDate < today && !["Completed", "Cancelled"].includes(t.status)).length, pending: tasks.filter(t => t.status === "Pending").length }; }
  return { create, update, list, summary, STATUSES, PRIORITIES };
})();
