/** Synchronous typed event bus for platform modules and automation subscribers. */
const PlatformEventService = (() => {
  const TYPES = Object.freeze(["ParticipantAccepted", "ParticipantUpdated", "AttendanceMarked", "AttendanceCompleted", "TimelineEventUpdated", "TimelineEventCancelled", "StaffAssigned", "PermissionChanged", "WorkflowCompleted", "CommunicationCampaignCreated", "CommunicationCampaignUpdated", "CommunicationTested"]);
  const subscribers = {};

  function subscribe(eventType, subscriberId, handler) {
    if (!TYPES.includes(eventType) || typeof handler !== "function") throw new Error("Invalid platform event subscription.");
    subscribers[eventType] = subscribers[eventType] || [];
    subscribers[eventType] = subscribers[eventType].filter(item => item.id !== subscriberId);
    subscribers[eventType].push({ id: subscriberId, handler });
  }

  function publish(eventType, payload, metadata) {
    if (!TYPES.includes(eventType)) throw new Error(`Unknown platform event ${eventType}.`);
    const event = { id: PlatformStoreService.createId("PEV"), eventType, occurredAt: new Date().toISOString(), payload: PlatformStoreService.safeData(payload || {}), metadata: PlatformStoreService.safeData(metadata || {}) };
    const results = (subscribers[eventType] || []).map(subscriber => {
      try { return { subscriber: subscriber.id, ok: true, result: subscriber.handler(event) }; }
      catch (err) { return { subscriber: subscriber.id, ok: false, error: err && err.message ? err.message : String(err) }; }
    });
    AuditService.record("PlatformEventPublished", { type: eventType, id: event.id }, { subscribers: results });
    return Object.assign(event, { subscribers: results });
  }

  function getTypes() { return TYPES.slice(); }
  return { subscribe, publish, getTypes };
})();
