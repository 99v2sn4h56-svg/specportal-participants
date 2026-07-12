const ProjectManagementService = (() => {
  const VIEW_PERMISSION = "operations.view";

  function getDashboardData() {
    requirePermission_(VIEW_PERMISSION);

    const workflowTasks = TaskService.list();
    const tasks = workflowTasks.map(task => ({
      id: task.id,
      task: task.title,
      workstream: task.module || "Operations",
      owner: task.assignedUser || "Unassigned",
      department: task.module || "Operations",
      status: task.status,
      priority: task.priority,
      startDate: task.createdAt || "",
      dueDate: task.dueDate || "",
      relatedEvent: task.relatedEvent || "",
      dependencies: task.entity && [task.entity.type, task.entity.id].filter(Boolean).join(": ") || "",
      notes: task.notes || "",
      lastUpdated: task.updatedAt || task.createdAt || ""
    }));
    const user = StaffService.getCurrentUser();
    const users = StaffService.getAll().map(staff => ({
      name: staff.name || staff.displayName || "",
      email: staff.email || "",
      department: staff.department || staff.team || "",
      role: staff.role || "Production Team Member",
      status: staff.status || "Active",
      capabilities: AuthorizationService.resolveGrants(staff).map(grant => grant.capability),
      scope: staff.scope || { type: "production", values: [] }
    }));
    const timelineEvents = TimelineService.getTimelineEvents();
    const events = timelineEvents.filter(event => event.isOperational);
    const attendanceSummary = safeCall_(() => AttendanceService.getSummary(), { ok: false, data: {} });
    const attendanceEvents = safeCall_(() => AttendanceService.getEvents(), { ok: false, data: [] });
    const operationsConsole = safeCall_(() => OperationsConsoleService.getData(), {});

    return {
      source: "Staff Production Team + Timeline",
      generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM h:mma"),
      users,
      events,
      timelineEvents,
      attendanceSummary: attendanceSummary.ok ? attendanceSummary.data || {} : {},
      attendanceEvents: attendanceEvents.ok ? attendanceEvents.data || [] : [],
      jobs: operationsConsole.jobs || [],
      jobRegistry: operationsConsole.jobRegistry || [],
      workflowQueue: operationsConsole.workflowQueue || [],
      queueSummary: operationsConsole.queueSummary || {},
      taskSummary: operationsConsole.taskSummary || {},
      notifications: operationsConsole.notifications || [],
      automationRules: operationsConsole.automationRules || [],
      audit: operationsConsole.audit || [],
      authorization: AuthorizationService.getModel(),
      modules: SourceRegistryService.getForUser(user),
      adminMode: !!user.isAdmin,
      tasks,
      workflowTasks,
      tasksSource: "SpecCentral Task Service",
      statuses: TaskService.STATUSES.slice(),
      milestones: ["Applications", "Auditions", "Acceptances", "Rehearsals", "Production", "Show Week", "Post-event"]
    };
  }

  function requirePermission_(permission) {
    const email = Session.getActiveUser().getEmail();
    if (!StaffService.hasPermission(email, permission)) {
      throw new Error(`Permission required: ${permission}`);
    }
  }

  function safeCall_(callback, fallback) {
    try { return callback(); } catch (err) { return fallback; }
  }

  return {
    getDashboardData
  };
})();
