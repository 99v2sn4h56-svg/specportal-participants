/**
 * Versioned, declarative command catalogue. Registration describes future
 * behaviour but never enables a command or supplies a production writer.
 */
const CommandRegistryService = (() => {
  const TIMELINE_FIELDS = ["title", "dateKey", "start", "finish", "venue", "area", "categories", "schoolGroups", "studentGroups", "individualStudents", "staff", "notes", "status"];
  const DEFINITIONS = [
    timeline_("timeline.event.create", "create", "Create event", "SPEC_TIMELINE_EDIT_ENABLED", ["title", "dateKey"], true, true, "TimelineEventCreated"),
    timeline_("timeline.event.update", "update", "Update event", "SPEC_TIMELINE_EDIT_ENABLED", [], true, true, "TimelineEventUpdated"),
    timeline_("timeline.event.duplicate", "duplicate", "Duplicate event", "SPEC_TIMELINE_EDIT_ENABLED", [], true, true, "TimelineEventDuplicated"),
    timeline_("timeline.event.cancel", "cancel", "Cancel event", "SPEC_TIMELINE_EDIT_ENABLED", [], true, true, "TimelineEventCancelled"),
    timeline_("timeline.event.delete", "delete", "Delete event", "SPEC_TIMELINE_EDIT_ENABLED", [], true, true, "TimelineEventDeleted"),
    timeline_("timeline.event.move", "move", "Move event", "SPEC_TIMELINE_EDIT_ENABLED", ["dateKey"], true, true, "TimelineEventMoved"),
    timeline_("timeline.event.assignParticipants", "assignParticipants", "Assign participants", "SPEC_TIMELINE_EDIT_ENABLED", ["individualStudents"], true, true, "TimelineParticipantsAssigned"),
    timeline_("timeline.event.assignGroups", "assignGroups", "Assign groups", "SPEC_TIMELINE_EDIT_ENABLED", [], true, true, "TimelineGroupsAssigned"),
    timeline_("timeline.event.assignStaff", "assignStaff", "Assign staff", "SPEC_TIMELINE_EDIT_ENABLED", ["staff"], true, true, "TimelineStaffAssigned"),
    timeline_("timeline.event.updateNotes", "updateNotes", "Update event notes", "SPEC_EVENT_NOTES_EDIT_ENABLED", ["notes"], false, true, "TimelineEventNotesUpdated"),
    {
      commandId: "task.createForEvent", entityType: "Task", action: "createForEvent", version: 1,
      label: "Create task for event", requiredCapabilities: ["Operations.View", "Workflow.Run"],
      featureFlags: ["SPEC_COMMANDS_ENABLED", "SPEC_TASK_CREATE_ENABLED"], adapterId: "task",
      inputSchema: { allowed: ["title", "assignedUser", "dueDate", "priority", "notes", "eventId"], required: ["title", "eventId"], maxLengths: { title: 250, notes: 2000 } },
      supportsDryRun: true, requiresConfirmation: false, requiresReason: false, idempotent: true,
      auditEvent: "EventTaskCreated", publishedEvents: []
    }
  ];

  function timeline_(commandId, action, label, featureFlag, required, requiresReason, requiresConfirmation, auditEvent) {
    return {
      commandId, entityType: "TimelineEvent", action, version: 1, label,
      requiredCapabilities: ["Administration.View", "Timeline.Edit"],
      featureFlags: ["SPEC_COMMANDS_ENABLED", featureFlag], adapterId: "timeline",
      inputSchema: { allowed: TIMELINE_FIELDS.slice(), required: required || [], arrays: ["categories", "schoolGroups", "studentGroups", "individualStudents", "staff"], maxLengths: { title: 250, venue: 250, area: 150, notes: 2000 } },
      supportsDryRun: true, requiresConfirmation: !!requiresConfirmation, requiresReason: !!requiresReason,
      idempotent: true, auditEvent, publishedEvents: action === "cancel" ? ["TimelineEventCancelled"] : ["TimelineEventUpdated"]
    };
  }

  function get(id) { const match = DEFINITIONS.find(item => item.commandId === String(id || "")); return match ? clone_(match) : null; }
  function list() { return DEFINITIONS.map(clone_); }
  function clone_(value) { return JSON.parse(JSON.stringify(value)); }
  return { get, list };
})();
