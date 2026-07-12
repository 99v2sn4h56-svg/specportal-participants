/** Declarative automation-rule registry. Rules remain disabled by default. */
const AutomationRuleService = (() => {
  const RULES = [
    { id: "RULE-REHEARSAL-TOMORROW", name: "Rehearsal tomorrow", eventType: "TimelineEventUpdated", condition: "event.isTomorrow", workflowId: "communications.notify-teachers", enabled: false },
    { id: "RULE-ATTENDANCE-NOT-STARTED", name: "Attendance not started", eventType: "TimelineEventUpdated", condition: "attendance.notStarted", workflowId: "attendance.overdue", enabled: false },
    { id: "RULE-OPERATIONAL-CANCELLED", name: "Operational event cancelled", eventType: "TimelineEventCancelled", condition: "event.isOperational", workflowId: "communications.notify-staff", enabled: false }
  ];
  function getAll() { return RULES.map(rule => Object.assign({}, rule)); }
  function evaluate(event) { return getAll().filter(rule => rule.enabled && rule.eventType === event.eventType); }
  return { getAll, evaluate };
})();
