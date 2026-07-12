/**
 * Declarative command catalogue for future, feature-gated business writes.
 * Definitions are architecture only: registration never enables execution.
 */
const CommandRegistryService = (() => {
  const DEFINITIONS = [
    command_("timeline.event.create", "Create event", "SPEC_TIMELINE_EDIT_ENABLED", true, true),
    command_("timeline.event.update", "Update event", "SPEC_TIMELINE_EDIT_ENABLED", true, true),
    command_("timeline.event.duplicate", "Duplicate event", "SPEC_TIMELINE_EDIT_ENABLED", true, true),
    command_("timeline.event.cancel", "Cancel event", "SPEC_TIMELINE_EDIT_ENABLED", true, true),
    command_("timeline.event.delete", "Delete event", "SPEC_TIMELINE_DELETE_ENABLED", true, true),
    command_("timeline.event.move", "Move event", "SPEC_TIMELINE_EDIT_ENABLED", true, true),
    command_("timeline.event.assignParticipants", "Assign participants", "SPEC_TIMELINE_EDIT_ENABLED", true, true),
    command_("timeline.event.assignGroups", "Assign groups", "SPEC_TIMELINE_EDIT_ENABLED", true, true),
    command_("timeline.event.assignStaff", "Assign staff", "SPEC_TIMELINE_EDIT_ENABLED", true, true),
    command_("timeline.event.updateNotes", "Update event notes", "SPEC_TIMELINE_EDIT_ENABLED", false, true),
    command_("task.createForEvent", "Create task for event", "SPEC_EVENT_TASK_WRITE_ENABLED", false, true, "task")
  ];

  function command_(id, label, featureFlag, requiresReason, requiresConfirmation, adapterId) {
    return {
      id,
      label,
      featureFlag,
      adapterId: adapterId || "timeline",
      requiredCapabilities: id.indexOf("task.") === 0 ? ["Operations.View", "Workflow.Run"] : ["Administration.View", "Timeline.Edit"],
      requiresReason: !!requiresReason,
      requiresConfirmation: !!requiresConfirmation,
      supportsDryRun: true,
      inputSchema: { allowUnknown: false, fields: ["eventId", "sourceRow", "fingerprint", "changes", "reason", "confirmation", "idempotencyKey"] }
    };
  }

  function get(id) {
    return DEFINITIONS.find(item => item.id === String(id || "")) || null;
  }

  function list() {
    return DEFINITIONS.map(item => JSON.parse(JSON.stringify(item)));
  }

  return { get, list };
})();
