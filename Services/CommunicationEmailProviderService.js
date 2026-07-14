/** Email provider registry. Mock is the only send-capable Milestone 1 provider. */
const CommunicationEmailProviderService = (() => {
  const mock = {
    id: "MOCK",
    validateConfiguration: () => ({ ok: true, status: "Mock provider active", safe: true }),
    capabilities: () => ({ testSend: true, campaignSend: false, deliveryTracking: false, externalDelivery: false }),
    sendTestMessage: request => {
      if (request && request.simulateFailure) throw new Error("Controlled mock provider failure.");
      return { accepted: true, provider: "MOCK", providerMessageId: PlatformStoreService.createId("MOCKMSG"), status: "TESTED", externalDelivery: false, acceptedAt: new Date().toISOString(), payloadHash: hash_([request && request.to, request && request.subject, request && request.htmlBody].join("|")) };
    },
    queueCampaign: () => { throw new Error("Campaign delivery is disabled in Milestone 1."); },
    getMessageStatus: id => ({ providerMessageId: String(id || ""), status: "TESTED", externalDelivery: false })
  };
  const graph = {
    id: "MICROSOFT_GRAPH",
    validateConfiguration: () => ({ ok: false, status: "Graph provider not configured", safe: true, missing: ["Entra application registration", "approved token acquisition", "tenant consent", "mailbox permission", "server-side credential storage"] }),
    capabilities: () => ({ testSend: false, campaignSend: false, deliveryTracking: false, externalDelivery: false }),
    sendTestMessage: () => { throw new Error("Microsoft Graph email is not configured. Mock provider remains active."); },
    queueCampaign: () => { throw new Error("Microsoft Graph campaign sending is disabled."); },
    getMessageStatus: () => ({ status: "NOT_CONFIGURED", externalDelivery: false })
  };
  function get(id) { return String(id || "MOCK").toUpperCase() === "MICROSOFT_GRAPH" ? graph : mock; }
  function status() { return { activeProvider: "MOCK", mock: mock.validateConfiguration(), microsoftGraph: graph.validateConfiguration(), realSendingEnabled: false, sharedMailbox: "Unavailable until approved Graph and Exchange configuration is completed" }; }
  function hash_(value) { const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || "")); return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "").slice(0, 32); }
  return { get, status };
})();
