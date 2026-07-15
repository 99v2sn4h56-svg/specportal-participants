const DashboardService = (() => {
  function getContext() {
    const started = Date.now();
    const staff = safeCall_("UserContextService.getCurrent", () => UserContextService.getCurrent(), {});
    // The full directory is route-lazy through StaffDirectoryService. Keeping it
    // out of bootstrap avoids serialising hundreds of contacts on every visit.
    const staffTeam = [];
    const timeline = UserContextService.hasCapability("Calendar.View") ? safeCall_("TimelineService.getDashboardSummary", () => TimelineService.getDashboardSummary(), {}) : {};
    const attendance = UserContextService.hasCapability("Attendance.View") ? {
      url: safeCall_("AttendanceService.getWebAppUrl", () => AttendanceService.getWebAppUrl(), ""),
      status: "Lazy loaded",
      source: "Attendance page"
    } : {};
    const announcements = safeCall_("AnnouncementService.getActive", () => AnnouncementService.getActive(), []);
    const notifications = safeCall_("NotificationService.getForCurrentUser", () => NotificationService.getForCurrentUser(), []);
    const tasks = staff.isMatched ? safeCall_("TaskService.list", () => TaskService.list().filter(task => String(task.assignedUser || "").toLowerCase() === String(staff.email || "").toLowerCase()).slice(0, 12), []) : [];
    const workflowSummary = staff.isMatched ? safeCall_("Workflow platform summary", () => ({ queue: staff.isOperations ? OperationsQueueService.summary() : {}, tasks: { myTasks: tasks.filter(task => !["Completed", "Cancelled"].includes(task.status)).length } }), {}) : {};
    const audit = safeCall_("AuditService.list", () => AuditService.list(50).filter(item => item.actor === staff.email).slice(0, 12).map(toSafeActivity_), []);
    // Cache/snapshot only: this call never rebuilds participant data.
    const unrestrictedParticipants = staff.isAdmin || !staff.scope || !staff.scope.type || staff.scope.type === "production";
    const participantSummary = unrestrictedParticipants
      ? safeCall_("ParticipantProjectionService.getDashboardSnapshot", () => ParticipantProjectionService.getDashboardSnapshot(), { categories: [], status: "Unavailable" })
      : { categories: [], totalParticipants: 0, status: "Scoped summary available in Participants", generatedAt: "", projection: "dashboard-participant-summary-v1" };

    const response = {
      staff: toSafeDashboardStaff_(staff),
      staffTeam,
      timelineStatus: timeline.status || "",
      timelineLastRefreshed: timeline.lastRefreshed || "",
      staffStatus: staff.isMatched ? "Profile matched · Directory lazy loaded" : staff.status || "No Staff Profile Found",
      attendanceUrl: attendance.url || "",
      attendanceStatus: attendance.status || "Waiting",
      attendanceSource: attendance.source || "",
      announcements,
      notifications,
      workflowSummary,
      tasks,
      recentActivity: audit,
      participantSummary,
      dashboardProfile: getDashboardProfile_(staff),
      rehearsals: timeline.upcomingRehearsals || [],
      todaysRehearsals: timeline.todaysRehearsals || [],
      attendanceEvents: [],
      currentDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM"),
      generatedAt: new Date().toISOString(),
      projection: ProjectionContractService.contract("dashboard").version,
      services: {
        dashboard: "Connected",
        participants: "Loaded separately through the Participants route projection",
        staff: staff && staff.isMatched ? "Connected" : staff.status || "No Staff Profile Found",
        staffTeam: "Lazy loaded on Staff route",
        timeline: timeline.status || "Waiting",
        attendance: attendance.status || "Waiting",
        announcements: announcements.length ? "Connected" : "No active announcements",
        notifications: notifications.length ? "Connected" : "No notifications",
        operations: "Lazy loaded",
        mediaTimeline: "Lazy loaded"
      }
    };
    response.performance = { dashboardLoadMs: Date.now() - started, identity: staff.performance || {} };
    ProjectionContractService.validate("dashboard", response);
    response.performance.payloadBytes = JSON.stringify(response).length;
    PerformanceTelemetryService.record("dashboard.projection.server", response.performance.dashboardLoadMs, { payloadBytes: response.performance.payloadBytes, records: (participantSummary.categories || []).length, projection: "dashboard" });
    if (staff.email) UserContextService.recordMetric("dashboardLoadMs", response.performance.dashboardLoadMs);
    return response;
  }

  function toSafeActivity_(item) { return { id: item.id || "", action: item.action || "Platform activity", actor: item.actor || "", occurredAt: item.occurredAt || "", entity: item.entity ? { type: item.entity.type || "", id: item.entity.id || "" } : null }; }
  function toSafeDashboardStaff_(staff) { return { displayName: staff.displayName || "", firstName: staff.firstName || "", staffId: staff.staffId || "", role: staff.role || "", department: staff.department || "", status: staff.status || "", isMatched: !!staff.isMatched, isAdmin: !!staff.isAdmin, isOperations: !!staff.isOperations, permissionLevel: staff.permissionLevel || "", permissions: (staff.permissions || []).slice(), capabilities: (staff.capabilities || []).slice(), scope: staff.scope || { type: "production", values: [] }, hasPhoto: !!staff.photo, performance: staff.performance || {} }; }

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
    getContext,
    getProjection: getContext
  };
})();
