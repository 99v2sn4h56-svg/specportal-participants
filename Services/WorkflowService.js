/** Orchestrates registered workflows through adapters without owning module writes. */
const WorkflowService = (() => {
  const actionAdapters = {};
  const conditionAdapters = { always: () => true };
  let initialized = false;

  function registerAction(action, adapter) { if (!action || typeof adapter !== "function") throw new Error("Invalid workflow action adapter."); actionAdapters[action] = adapter; }
  function registerCondition(condition, adapter) { if (!condition || typeof adapter !== "function") throw new Error("Invalid workflow condition adapter."); conditionAdapters[condition] = adapter; }

  function execute(workflowId, inputs, options) {
    initialize();
    const definition = WorkflowRegistryService.get(workflowId);
    if (!definition) throw new Error(`Workflow ${workflowId} is not registered.`);
    const opts = options || {};
    requireCapabilities_(definition.capabilitiesRequired);
    validateInputs_(definition, inputs || {});
    if (!definition.enabled && !opts.dryRun) throw new Error(`Workflow ${workflowId} is registered but not enabled.`);

    const execution = OperationsQueueService.enqueue({ workflowId, workflowVersion: definition.version, trigger: opts.trigger || { type: "Manual" }, inputs: inputs || {}, dependencies: definition.dependencies, approvalRequired: definition.approval && definition.approval.required });
    AuditService.record("WorkflowRequested", { type: "Workflow", id: workflowId }, { executionId: execution.id, dryRun: !!opts.dryRun });

    if (opts.dryRun) {
      return OperationsQueueService.transition(execution.id, "Completed", { outputs: { dryRun: true, conditions: definition.conditions, actions: definition.actions, dependencies: definition.dependencies, notifications: definition.notifications } });
    }
    if (definition.approval && definition.approval.required && !opts.approved) return execution;

    OperationsQueueService.transition(execution.id, "Running");
    try {
      const context = { definition, execution, inputs: inputs || {}, outputs: {}, options: opts };
      ensureDependencies_(definition);
      const conditionsPassed = definition.conditions.every(condition => runCondition_(condition, context));
      if (!conditionsPassed) return OperationsQueueService.transition(execution.id, "Completed", { outputs: { skipped: true, reason: "Conditions not met" } });
      definition.actions.forEach(action => runAction_(action, context));
      const completed = OperationsQueueService.transition(execution.id, "Completed", { outputs: context.outputs });
      PlatformEventService.publish("WorkflowCompleted", { workflowId, executionId: execution.id, outputs: context.outputs });
      AuditService.record("WorkflowCompleted", { type: "WorkflowExecution", id: execution.id }, { workflowId });
      return completed;
    } catch (err) {
      const failed = OperationsQueueService.transition(execution.id, "Failed", { error: err && err.message ? err.message : String(err) });
      AuditService.record("WorkflowFailed", { type: "WorkflowExecution", id: execution.id }, { workflowId, error: failed.error });
      return failed;
    }
  }

  function publishEvent(eventType, payload, metadata) { initialize(); return PlatformEventService.publish(eventType, payload, metadata); }

  function initialize() {
    if (initialized) return;
    registerAction("task.create", context => { const task = TaskService.create({ title: context.definition.name, assignedUser: context.inputs.assignedUser || Session.getActiveUser().getEmail(), dueDate: context.inputs.dueDate || "", priority: context.inputs.priority || "Medium", module: context.definition.owner, entity: { type: context.definition.entity, id: context.inputs.eventId || context.inputs.sessionId || context.inputs.studentKey || "" }, relatedEvent: context.inputs.eventId || context.inputs.sessionId || "", notes: context.inputs.notes || "", workflowExecutionId: context.execution.id }); context.outputs.taskId = task.id; return task; });
    registerAction("notification.queue", context => { const notification = NotificationService.queue({ channel: "In-App", target: context.inputs.target || context.inputs.assignedUser || Session.getActiveUser().getEmail(), title: context.definition.name, body: context.inputs.message || context.definition.description, workflowExecutionId: context.execution.id }); context.outputs.notificationIds = (context.outputs.notificationIds || []).concat(notification.id); return notification; });
    registerAction("job.enqueue", context => { const job = JobService.enqueue(context.inputs.jobType || "CacheRefresh", context.inputs, { priority: context.inputs.priority }); context.outputs.jobId = job.id; return job; });
    registerAction("event.publish", context => publishEvent(context.inputs.eventType || "WorkflowCompleted", context.inputs, { workflowExecutionId: context.execution.id }));
    registerAction("workflow.enqueue", context => { const workflowId = context.inputs.nextWorkflowId; const definition = WorkflowRegistryService.get(workflowId); if (!definition) throw new Error(`Downstream workflow ${workflowId} is not registered.`); const queued = OperationsQueueService.enqueue({ workflowId, workflowVersion: definition.version, trigger: { type: "Dependency", parentExecutionId: context.execution.id }, inputs: context.inputs, dependencies: definition.dependencies }); context.outputs.downstreamExecutionIds = (context.outputs.downstreamExecutionIds || []).concat(queued.id); return queued; });
    PlatformEventService.getTypes().forEach(eventType => PlatformEventService.subscribe(eventType, "workflow-automation-rules", event => AutomationRuleService.evaluate(event).map(rule => execute(rule.workflowId, event.payload, { trigger: { type: "Event-driven", eventId: event.id } }))));
    initialized = true;
  }

  function runCondition_(condition, context) { const adapter = conditionAdapters[condition]; if (!adapter) throw new Error(`Workflow condition adapter ${condition} is not connected.`); return adapter(context); }
  function runAction_(descriptor, context) { const parts = String(descriptor).split(":"); const action = parts[0]; const argument = parts.slice(1).join(":"); const adapter = actionAdapters[descriptor] || actionAdapters[action]; if (!adapter) throw new Error(`Workflow action adapter ${descriptor} is not connected.`); if (action === "event.publish") context.inputs.eventType = argument || context.inputs.eventType; if (action === "job.enqueue") context.inputs.jobType = argument || context.inputs.jobType; if (action === "workflow.enqueue") context.inputs.nextWorkflowId = argument; return adapter(context); }
  function ensureDependencies_(definition) { const completed = OperationsQueueService.list({ status: "Completed" }).map(item => item.workflowId); const missing = (definition.dependencies || []).filter(id => !completed.includes(id)); if (missing.length) throw new Error(`Workflow dependencies not completed: ${missing.join(", ")}.`); }
  function validateInputs_(definition, inputs) { const missing = (definition.inputs || []).filter(key => inputs[key] === undefined || inputs[key] === null || inputs[key] === ""); if (missing.length) throw new Error(`Missing workflow inputs: ${missing.join(", ")}.`); }
  function requireCapabilities_(capabilities) { const email = Session.getActiveUser().getEmail(); const missing = (capabilities || []).filter(capability => !StaffService.hasPermission(email, capability)); if (missing.length) throw new Error(`Workflow capabilities required: ${missing.join(", ")}.`); }
  function getArchitecture() { initialize(); return { workflows: WorkflowRegistryService.getAll(), actionAdapters: Object.keys(actionAdapters), conditionAdapters: Object.keys(conditionAdapters), eventTypes: PlatformEventService.getTypes() }; }
  return { registerAction, registerCondition, execute, publishEvent, initialize, getArchitecture };
})();
