/** Authoritative source, synchronization and editing contract registry. */
const SourceRegistryService = (() => {
  const SOURCE_CONFIGS = {
    timeline: { spreadsheetId: "1JccmwT9_wOEhuSU5kyFH6HnU9T9ysfQa87XjvL5WLog", sheetName: "Operation Schedule" }
  };
  const REGISTRY = [
    entry("timeline", "TimelineEvent", "Timeline spreadsheet / Operation Schedule", "read-now-write-later", "eventId", true, 300, "Timeline.Edit", ["add", "edit", "duplicate", "delete", "move", "cancel", "assign-students", "assign-groups", "assign-staff"]),
    entry("calendar", "CalendarEvent", "Timeline projection", "derived-read", "eventId", false, 120, "Calendar.Edit", []),
    entry("participants", "Participant", "Participants spreadsheet / INDIVIDUALS(YES)", "read-now-write-later", "studentKey", true, 120, "Participants.Edit", ["edit", "change-school", "change-item", "merge", "accept", "reject"]),
    entry("schools", "School", "Participants spreadsheet / Schools Master Dataset", "read-now-write-later", "schoolId", true, 300, "Participants.Edit", ["add", "edit", "merge"]),
    entry("groups", "Group", "Participants spreadsheet / GROUPS(YES)", "read-now-write-later", "groupId", true, 300, "Participants.Edit", ["edit", "assign"]),
    entry("teachers", "Teacher", "Participants spreadsheet teacher fields", "derived-read", "teacherId", false, 300, "Participants.Edit", []),
    entry("items", "Item", "Participants spreadsheet item fields", "derived-read", "itemId", false, 300, "Participants.Edit", []),
    entry("categories", "Category", "Participants and Timeline category fields", "derived-read", "categoryId", false, 300, "Participants.Edit", []),
    entry("segments", "Segment", "Participants group allocations", "derived-read", "segmentId", false, 300, "Participants.Edit", []),
    entry("venues", "Venue", "Timeline spreadsheet location fields", "derived-read", "venueId", false, 300, "Calendar.Edit", []),
    entry("staff", "StaffMember", "Staff Production Team spreadsheet", "read-now-write-later", "email", true, 300, "Users.Manage", ["edit", "assign-role", "assign-scope"]),
    entry("users", "User", "Staff Production Team identity projection", "derived-read", "email", true, 300, "Users.Manage", ["assign-role", "assign-scope", "set-status"]),
    entry("attendance", "AttendanceSession", "Attendance workbook and API", "read-write-existing-api", "sessionId", true, 120, "Attendance.Mark", ["mark", "bulk-mark", "add-notes"]),
    entry("support-plans", "SupportPlan", "Attendance support-plan Drive folder", "read-only-restricted", "supportPlanId", false, 120, "Participants.View", []),
    entry("communications", "Communication", "Not connected", "none", "communicationId", false, 0, "Communications.Send", []),
    entry("production", "Production", "Future production configuration", "none", "productionId", false, 0, "Settings.Admin", []),
    entry("workflows", "Workflow", "Workflow Registry", "platform-managed", "workflowId", true, 0, "Workflow.Admin", ["enable", "disable", "version"]),
    entry("tasks", "Task", "Task Service", "platform-read-write", "taskId", true, 0, "Workflow.Run", ["create", "assign", "update-status", "cancel"]),
    entry("jobs", "Job", "Job Service", "platform-read-write", "jobId", true, 0, "Jobs.Run", ["enqueue", "run", "cancel", "retry"]),
    entry("notifications", "Notification", "Notification Service", "queue-only", "notificationId", true, 0, "Notifications.View", ["queue", "cancel", "dispatch"])
  ];

  function entry(id, entityType, source, direction, identityField, editable, cacheSeconds, editCapability, actions) {
    return { id, entityType, source, direction, identityField, editable, cacheSeconds, editCapability, actions };
  }
  function get(id) { return REGISTRY.find(item => item.id === id) || null; }
  function getSourceConfig(id) { return Object.assign({}, SOURCE_CONFIGS[id] || {}); }
  function getAll() { return REGISTRY.map(item => Object.assign({}, item, { actions: item.actions.slice() })); }
  function getForUser(user) { return getAll().map(item => Object.assign(item, { canEdit: item.editable && AuthorizationService.hasCapability(user, item.editCapability) })); }
  return { get, getAll, getForUser, getSourceConfig };
})();
