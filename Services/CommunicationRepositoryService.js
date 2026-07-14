/** Persistence boundary for Communications Centre records. */
const CommunicationRepositoryService = (() => {
  const COLLECTIONS = Object.freeze({
    campaigns: "communicationCampaigns",
    templates: "communicationTemplates",
    audiences: "communicationAudiences",
    recipients: "communicationRecipients",
    events: "communicationEvents"
  });
  const LIMITS = Object.freeze({ campaigns: 80, templates: 80, audiences: 80, recipients: 160, events: 240 });

  function list(type) { return PlatformStoreService.list(collection_(type)); }
  function get(type, id) { return list(type).find(record => record.id === String(id || "")) || null; }
  function save(type, record) {
    const value = Object.assign({}, record || {});
    if (!value.id) throw new Error("A stable record ID is required.");
    return PlatformStoreService.put(collection_(type), value, LIMITS[type] || 100);
  }
  function update(type, id, changes) { return PlatformStoreService.update(collection_(type), String(id || ""), changes || {}, LIMITS[type] || 100); }
  function forCampaign(type, campaignId) { return list(type).filter(record => record.campaignId === String(campaignId || "")); }
  function collection_(type) {
    const key = String(type || "");
    if (!COLLECTIONS[key]) throw new Error("Unknown communications repository collection.");
    return COLLECTIONS[key];
  }
  function architecture() { return { adapter: "PlatformStoreService", persistence: "bounded ScriptProperties", collections: Object.assign({}, COLLECTIONS), limits: Object.assign({}, LIMITS), productionAdapterBoundary: "CommunicationRepositoryService" }; }
  return { list, get, save, update, forCampaign, architecture };
})();
