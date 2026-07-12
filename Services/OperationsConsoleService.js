/** Read-only aggregate for future Operations Console server consumers. */
const OperationsConsoleService = (() => {
  function getData() {
    const email = Session.getActiveUser().getEmail();
    if (!StaffService.hasPermission(email, "Operations.View")) throw new Error("Operations.View is required.");
    return {
      generatedAt: new Date().toISOString(),
      workflowRegistry: WorkflowRegistryService.getAll(),
      workflowQueue: OperationsQueueService.list(),
      queueSummary: OperationsQueueService.summary(),
      tasks: TaskService.list(),
      taskSummary: TaskService.summary(email),
      jobs: JobService.list(),
      jobRegistry: JobService.getRegistry(),
      automationRules: AutomationRuleService.getAll(),
      notifications: NotificationService.getForCurrentUser(),
      notificationChannels: NotificationService.getArchitecture(),
      audit: AuditService.list(30),
      aiExtensions: AiExtensionService.getRegistry()
    };
  }
  return { getData };
})();
