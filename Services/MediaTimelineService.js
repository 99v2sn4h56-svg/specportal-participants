const MediaTimelineService = (() => {
  const VIEW_PERMISSION = "mediaTimeline.view";

  function getDashboardData() {
    requirePermission_(VIEW_PERMISSION);

    const mediaTasks = TaskService.list().filter(item => /media|marketing|communications/i.test([item.module, item.department, item.notes].join(" ")));
    const timelineActivities = TimelineService.getTimelineEvents().filter(item => /media|marketing|communications|promotion|launch/i.test([item.area, item.type, item.title, item.notes].join(" "))).map(item => ({
      id: item.id,
      campaign: item.area || "Production",
      activity: item.title,
      channel: item.type || "Timeline",
      audience: (item.categories || []).join(", "),
      owner: (item.staff || []).join(", "),
      department: item.area || "",
      startDate: item.dateKey || item.date,
      publishDate: item.dateKey || item.date,
      endDate: item.dateKey || item.date,
      status: item.status || "Scheduled",
      priority: "",
      relatedEvent: item.id,
      relatedItem: (item.items || []).join(", "),
      approvalStatus: "Timeline source",
      notes: item.notes || ""
    }));
    const taskActivities = mediaTasks.map(item => ({ id: item.id, campaign: item.module || "Media", activity: item.title, channel: "Task", audience: "", owner: item.assignedUser || "", department: "Media", startDate: item.createdAt || "", publishDate: item.dueDate || "", endDate: item.dueDate || "", status: item.status, priority: item.priority, relatedEvent: item.relatedEvent || "", relatedItem: "", approvalStatus: "Task Service", notes: item.notes || "" }));
    const activities = timelineActivities.concat(taskActivities);

    return {
      source: "Timeline + SpecCentral Task Service",
      generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM h:mma"),
      activities,
      statuses: ["Idea", "Drafting", "Awaiting assets", "Awaiting approval", "Scheduled", "Published", "Complete"],
      channels: ["Social media", "Website", "Email", "School communications", "Media release", "Collateral"]
    };
  }

  function requirePermission_(permission) {
    const email = Session.getActiveUser().getEmail();
    if (!StaffService.hasPermission(email, permission)) {
      throw new Error(`Permission required: ${permission}`);
    }
  }

  return {
    getDashboardData
  };
})();
