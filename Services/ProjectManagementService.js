const ProjectManagementService = (() => {
  const VIEW_PERMISSION = "projectManagement.view";

  function getDashboardData() {
    requirePermission_(VIEW_PERMISSION);

    const tasks = getPlaceholderTasks_();

    return {
      source: "Placeholder project management data",
      generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM h:mma"),
      tasks,
      statuses: ["Not started", "In progress", "Waiting", "Ready for review", "Complete"],
      milestones: ["Applications", "Auditions", "Acceptances", "Rehearsals", "Production", "Show Week", "Post-event"]
    };
  }

  function requirePermission_(permission) {
    const email = Session.getActiveUser().getEmail();
    if (!StaffService.hasPermission(email, permission)) {
      throw new Error(`Permission required: ${permission}`);
    }
  }

  function getPlaceholderTasks_() {
    return [
      {
        id: "PM-001",
        task: "Confirm acceptance import workflow",
        workstream: "Acceptances",
        owner: "Spec Central",
        department: "Operations",
        status: "In progress",
        priority: "High",
        startDate: "",
        dueDate: "",
        relatedEvent: "",
        dependencies: "Participants source data",
        notes: "Placeholder until a production task source is connected.",
        lastUpdated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM")
      },
      {
        id: "PM-002",
        task: "Connect Timeline event allocations",
        workstream: "Rehearsals",
        owner: "Timeline",
        department: "Operations",
        status: "Waiting",
        priority: "Medium",
        startDate: "",
        dueDate: "",
        relatedEvent: "Timeline",
        dependencies: "Staff Production Team permissions",
        notes: "Placeholder task for future integration.",
        lastUpdated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM")
      }
    ];
  }

  return {
    getDashboardData
  };
})();
