/** Channel-aware notification queue. No external transport sends yet. */
const NotificationService = (() => {
  const CHANNELS = ["In-App", "Email", "SMS", "Push", "Google Chat", "Teams", "Webhook"];
  const transportAdapters = {};
  function registerTransport(channel, adapter) { if (!CHANNELS.includes(channel) || typeof adapter !== "function") throw new Error("Invalid notification transport."); transportAdapters[channel] = adapter; }
  function queue(input) {
    const value = input || {}; const channel = CHANNELS.includes(value.channel) ? value.channel : "In-App";
    const notification = { id: PlatformStoreService.createId("NTF"), entityType: "Notification", channel, target: value.target || "", title: value.title || "Notification", body: value.body || "", severity: value.severity || "info", status: "Queued", workflowExecutionId: value.workflowExecutionId || "", createdAt: new Date().toISOString(), deliveredAt: "" };
    PlatformStoreService.put("notifications", notification, 100); AuditService.record("NotificationQueued", { type: "Notification", id: notification.id }, { channel, target: notification.target }); return notification;
  }
  function dispatch(id) { const item = PlatformStoreService.list("notifications").find(value => value.id === id); if (!item) throw new Error("Notification not found."); const adapter = transportAdapters[item.channel]; if (!adapter) return PlatformStoreService.update("notifications", id, { status: "Awaiting Transport" }, 100); const result = adapter(item); return PlatformStoreService.update("notifications", id, { status: "Delivered", deliveredAt: new Date().toISOString(), transportResult: PlatformStoreService.safeData(result) }, 100); }
  function getForCurrentUser() { const email = UserContextService.getEmail(); return PlatformStoreService.list("notifications").filter(item => item.channel === "In-App" && ["", "ALL", email].includes(item.target) && item.status !== "Cancelled").slice(0, 10); }
  function getArchitecture() { return CHANNELS.map(channel => ({ channel, connected: !!transportAdapters[channel] })); }
  return { registerTransport, queue, dispatch, getForCurrentUser, getArchitecture, CHANNELS };
})();
