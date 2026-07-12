const DashboardService = (() => {
  function getContext() {
    const staff = safeCall_("StaffService.getCurrent", () => StaffService.getCurrent(), {});
    const staffTeam = safeCall_("StaffService.getAll", () => StaffService.getAll(), []);
    const timeline = safeCall_("TimelineService.getDashboardSummary", () => TimelineService.getDashboardSummary(), {});
    const attendance = safeCall_("AttendanceService.getConfig", () => AttendanceService.getConfig(), {});
    const attendanceEvents = safeCall_("AttendanceService.getEvents", () => AttendanceService.getEvents(), { data: [] });
    const announcements = safeCall_("AnnouncementService.getActive", () => AnnouncementService.getActive(), []);
    const notifications = safeCall_("NotificationService.getForCurrentUser", () => NotificationService.getForCurrentUser(), []);
    const workflowSummary = safeCall_("Workflow platform summary", () => ({ queue: OperationsQueueService.summary(), tasks: TaskService.summary(staff.email || "") }), {});
    const tasks = safeCall_("TaskService.list", () => TaskService.list().filter(task => !task.assignedUser || task.assignedUser === staff.email).slice(0, 12), []);
    const audit = safeCall_("AuditService.list", () => AuditService.list(12), []);

    return {
      staff,
      staffTeam,
      timelineStatus: timeline.status || "",
      timelineLastRefreshed: timeline.lastRefreshed || "",
      staffStatus: staffTeam.length ? "Connected" : "Fallback / unavailable",
      attendanceUrl: attendance.url || "",
      attendanceStatus: attendance.status || "Waiting",
      attendanceSource: attendance.source || "",
      announcements,
      notifications,
      workflowSummary,
      tasks,
      recentActivity: audit,
      dashboardProfile: getDashboardProfile_(staff),
      rehearsals: timeline.upcomingRehearsals || [],
      todaysRehearsals: timeline.todaysRehearsals || [],
      attendanceEvents: attendanceEvents.data || [],
      currentDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM"),
      generatedAt: new Date().toISOString(),
      services: {
        dashboard: "Connected",
        participants: "Loaded separately through ParticipantService",
        staff: staff && staff.email ? "Connected" : "Fallback",
        staffTeam: staffTeam.length ? "Connected" : "Unavailable or empty",
        timeline: timeline.status || "Waiting",
        attendance: attendance.status || "Waiting",
        announcements: announcements.length ? "Connected" : "No active announcements",
        notifications: notifications.length ? "Connected" : "No notifications",
        operations: "Lazy loaded",
        mediaTimeline: "Lazy loaded"
      }
    };
  }

  function getDashboardProfile_(staff) {
    const text = [
      staff && staff.role,
      staff && staff.department,
      staff && staff.team
    ].filter(Boolean).join(" ").toLowerCase();

    if (/media|marketing|communications|comms/.test(text)) return "media";
    if (/dance|choreograph/.test(text)) return "dance";
    if (/choir|vocal|music/.test(text)) return "choir";
    if (/production|operations|event|stage|technical/.test(text)) return "production";
    if (/manager|management|director|executive/.test(text)) return "management";
    return "operations";
  }

  function safeCall_(label, callback, fallback) {
    try {
      return callback();
    } catch (err) {
      Logger.log(label + " failed: " + (err && err.message ? err.message : err));
      return fallback;
    }
  }

  return {
    getContext
  };
})();
