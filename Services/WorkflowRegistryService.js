/** Immutable registry of disabled built-in workflow contracts and metadata. */
const WorkflowRegistryService = (() => {
  const definitions = [
    workflow("timeline.create-rehearsal", "Create rehearsal", "Create a Timeline rehearsal.", "TimelineEvent", "Manual", "Timeline.Edit", ["event"], ["eventId"], ["timeline.create"]),
    workflow("timeline.cancel-rehearsal", "Cancel rehearsal", "Cancel a rehearsal and publish its cancellation.", "TimelineEvent", "Manual", "Timeline.Edit", ["eventId", "reason"], ["eventId"], ["timeline.cancel", "event.publish:TimelineEventCancelled"]),
    workflow("timeline.move-rehearsal", "Move rehearsal", "Move rehearsal date, time or venue.", "TimelineEvent", "Manual", "Timeline.Edit", ["eventId", "schedule"], ["eventId"], ["timeline.move", "event.publish:TimelineEventUpdated"]),
    workflow("timeline.duplicate-rehearsal", "Duplicate rehearsal", "Create a new rehearsal from an existing event.", "TimelineEvent", "Manual", "Timeline.Edit", ["eventId"], ["eventId"], ["timeline.duplicate"]),
    workflow("timeline.assign-students", "Assign students", "Assign individual participants.", "TimelineEvent", "Manual", "Timeline.Edit", ["eventId", "studentKeys"], ["eventId"], ["timeline.assign-students"]),
    workflow("timeline.assign-groups", "Assign groups", "Assign groups to an event.", "TimelineEvent", "Manual", "Timeline.Edit", ["eventId", "groupIds"], ["eventId"], ["timeline.assign-groups"]),
    workflow("timeline.assign-staff", "Assign staff", "Assign staff to an event.", "TimelineEvent", "Manual", "Timeline.Edit", ["eventId", "staffIds"], ["eventId"], ["timeline.assign-staff", "event.publish:StaffAssigned"]),
    workflow("attendance.open", "Open attendance", "Open an Attendance session.", "AttendanceSession", "Manual", "Attendance.Mark", ["sessionId"], ["sessionId"], ["attendance.open"]),
    workflow("attendance.close", "Close attendance", "Close an Attendance session.", "AttendanceSession", "Manual", "Attendance.Mark", ["sessionId"], ["sessionId"], ["attendance.close"]),
    workflow("attendance.bulk-mark", "Bulk mark attendance", "Bulk mark matching records.", "AttendanceSession", "Manual", "Attendance.Mark", ["sessionId", "status", "participantIds"], ["updated"], ["attendance.bulk-mark"]),
    workflow("attendance.mark-absent", "Mark absent students", "Mark remaining students absent.", "AttendanceSession", "Manual", "Attendance.Mark", ["sessionId"], ["updated"], ["attendance.mark-absent"]),
    workflow("attendance.complete", "Attendance complete", "Complete attendance and downstream operations.", "AttendanceSession", "Event-driven", "Attendance.Mark", ["sessionId"], ["completed"], ["event.publish:AttendanceCompleted", "task.create", "workflow.enqueue:operations.rehearsal-finished"]),
    workflow("attendance.overdue", "Attendance overdue", "Create an operations follow-up task.", "AttendanceSession", "Scheduled", "Operations.View", ["sessionId"], ["taskId"], ["task.create", "notification.queue"]),
    workflow("participants.accept", "Accept participant", "Accept a participant.", "Participant", "Manual", "Participants.Edit", ["studentKey"], ["studentKey"], ["participant.accept", "event.publish:ParticipantAccepted"]),
    workflow("participants.reject", "Reject participant", "Reject a participant.", "Participant", "Manual", "Participants.Edit", ["studentKey", "reason"], ["studentKey"], ["participant.reject"]),
    workflow("participants.change-school", "Change school", "Move participant to another school.", "Participant", "Manual", "Participants.Edit", ["studentKey", "schoolId"], ["studentKey"], ["participant.change-school", "event.publish:ParticipantUpdated"]),
    workflow("participants.move-item", "Move item", "Move participant to another item.", "Participant", "Manual", "Participants.Edit", ["studentKey", "itemId"], ["studentKey"], ["participant.move-item", "event.publish:ParticipantUpdated"]),
    workflow("participants.update-details", "Update participant", "Update participant details.", "Participant", "Manual", "Participants.Edit", ["studentKey", "changes"], ["studentKey"], ["participant.update", "event.publish:ParticipantUpdated"]),
    workflow("communications.send-reminder", "Send reminder", "Queue reminder notifications.", "Communication", "Manual", "Communications.Send", ["targets", "message"], ["notificationIds"], ["notification.queue"]),
    workflow("communications.notify-teachers", "Notify teachers", "Queue teacher notifications.", "Communication", "Event-driven", "Communications.Send", ["eventId", "message"], ["notificationIds"], ["notification.queue"]),
    workflow("communications.notify-staff", "Notify staff", "Queue staff notifications.", "Communication", "Event-driven", "Communications.Send", ["targets", "message"], ["notificationIds"], ["notification.queue"]),
    workflow("communications.notify-participants", "Notify participants", "Queue participant notifications.", "Communication", "Manual", "Communications.Send", ["participantIds", "message"], ["notificationIds"], ["notification.queue"]),
    workflow("operations.venue-ready", "Venue ready", "Record venue readiness.", "Venue", "Manual", "Operations.Admin", ["venueId", "eventId"], ["taskId"], ["task.create"]),
    workflow("operations.segment-complete", "Segment complete", "Record segment completion.", "Segment", "Event-driven", "Operations.Admin", ["segmentId"], ["completed"], ["event.publish:WorkflowCompleted"]),
    workflow("operations.rehearsal-finished", "Rehearsal finished", "Complete rehearsal operations.", "Rehearsal", "Event-driven", "Operations.Admin", ["eventId"], ["completed"], ["job.enqueue:CacheRefresh", "workflow.enqueue:communications.notify-teachers", "event.publish:WorkflowCompleted"])
  ];
  function workflow(id, name, description, entity, trigger, capability, inputs, outputs, actions, dependencies) { return { id, name, description, entity, trigger: { type: trigger }, capabilitiesRequired: Array.from(new Set([capability, "Workflow.Run"])), inputs, outputs, conditions: ["always"], actions, notifications: notificationPlan_(id), dependencies: dependencies || [], status: "Architecture", owner: id.split(".")[0], enabled: false, version: "1.0.0", approval: { supported: true, required: false } }; }
  function notificationPlan_(id) {
    if (id.indexOf("communications.") === 0) return [{ channels: ["In-App", "Email", "SMS", "Push", "Google Chat", "Teams", "Webhook"], targets: "workflow-input", enabled: false }];
    if (id === "attendance.overdue") return [{ channels: ["In-App"], targets: "Operations", enabled: false }];
    if (/cancel|move|assign/.test(id)) return [{ channels: ["In-App"], targets: "affected-relationships", enabled: false }];
    return [];
  }
  function get(id) { const item = definitions.find(value => value.id === id); return item ? JSON.parse(JSON.stringify(item)) : null; }
  function getAll() { return definitions.map(item => JSON.parse(JSON.stringify(item))); }
  return { get, getAll };
})();
