/** Manual/CI-safe test harness for Communications Centre Milestone 1. */
function runCommunicationMilestoneTests() {
  const results = [], assert = (name, condition, details) => { results.push({ name, passed: !!condition, details: details || "" }); if (!condition) throw new Error("Test failed: " + name); };
  const originalStore = { list: PlatformStoreService.list, put: PlatformStoreService.put, update: PlatformStoreService.update };
  const originalUser = { getCurrent: UserContextService.getCurrent, requireCapability: UserContextService.requireCapability, hasCapability: UserContextService.hasCapability, getEmail: UserContextService.getEmail };
  const originalParticipants = { getAll: ParticipantService.getAll, getGroups: ParticipantService.getGroups, getActiveSchoolsData: ParticipantService.getActiveSchoolsData };
  const originalStaff = StaffService.getAll;
  const memory = {}, capabilities = new Set(AuthorizationService.getModel().capabilities.filter(value => value.indexOf("Communications.") === 0));
  const actor = { email: "authorised.tester@education.nsw.gov.au", displayName: "Authorised Tester", role: "Operations Manager", permissions: Array.from(capabilities), access: [], scope: { type: "production", values: [] } };
  try {
    PlatformStoreService.list = collection => JSON.parse(JSON.stringify(memory[collection] || []));
    PlatformStoreService.put = (collection, record, limit) => { const value = JSON.parse(JSON.stringify(record)), rows = (memory[collection] || []).filter(item => item.id !== value.id); rows.unshift(value); memory[collection] = rows.slice(0, limit || 100); return JSON.parse(JSON.stringify(value)); };
    PlatformStoreService.update = (collection, id, changes, limit) => { const current = (memory[collection] || []).find(item => item.id === id); if (!current) throw new Error("Record not found."); return PlatformStoreService.put(collection, Object.assign({}, current, changes, { id }), limit); };
    UserContextService.getCurrent = () => Object.assign({}, actor, { permissions: Array.from(capabilities), capabilities: Array.from(capabilities) });
    UserContextService.requireCapability = capability => { if (!capabilities.has(capability)) throw new Error(capability + " is required."); return UserContextService.getCurrent(); };
    UserContextService.hasCapability = capability => capabilities.has(capability);
    UserContextService.getEmail = () => actor.email;
    ParticipantService.getAll = () => [
      EntityModelService.participant({ applicationId: "A1", firstName: "Alex", lastName: "<Morgan>", school: "North School", category: "Dance", item: "Featured", segment: "Opening", schoolGroup: "North Dance", applicationStatus: "Accepted", studentEmail: "Alex@Example.com", parentEmail: "family@example.com", teacherName: "Taylor Teacher", teacherEmail: "teacher@example.com" }),
      EntityModelService.participant({ applicationId: "A2", firstName: "Ari", lastName: "Smith", school: "North School", category: "Dance", item: "Featured", segment: "Opening", schoolGroup: "North Dance", applicationStatus: "Accepted", studentEmail: "alex@example.com", parentEmail: "not-an-email", teacherName: "Taylor Teacher", teacherEmail: "TEACHER@example.com" }),
      EntityModelService.participant({ applicationId: "A3", firstName: "No", lastName: "Email", school: "West School", category: "Dance", item: "Featured", segment: "Opening", schoolGroup: "West Dance", applicationStatus: "Accepted", studentEmail: "", parentEmail: "", teacherEmail: "" })
    ];
    ParticipantService.getGroups = () => [];
    ParticipantService.getActiveSchoolsData = () => [{ id: "SCH-1", schoolName: "North School", email: "school@example.com", region: "Metro" }];
    StaffService.getAll = () => [{ id: "STF-1", displayName: "Sam Staff", email: "sam.staff@example.com", productionRole: "Manager", categoryResponsibilities: ["Dance"] }];

    const valid = CommunicationMergeService.render("Hello {{Participant.FirstName}} / {{Participant.FirstName}}", { Participant: { FirstName: "Alex" } });
    assert("merge valid and repeated values", valid.output === "Hello Alex / Alex" && !valid.unresolved.length);
    const escaped = CommunicationMergeService.render("<p>{{Participant.FullName}}</p>", { Participant: { FullName: "Alex <Morgan> & Co" } });
    assert("merge HTML escaping", escaped.output.indexOf("Alex &lt;Morgan&gt; &amp; Co") >= 0);
    const missing = CommunicationMergeService.render("{{School.Name}} {{Unknown.Field}}", { School: null });
    assert("merge missing, unknown and null fields", missing.unresolved.includes("School.Name") && missing.unresolved.includes("Unknown.Field"));
    const sanitized = CommunicationMergeService.render('<script>alert(1)</script><p onclick="bad()">Safe</p>', {});
    assert("template scripts and event handlers removed", sanitized.output.indexOf("script") < 0 && sanitized.output.indexOf("onclick") < 0);

    const audience = CommunicationAudienceService.resolve({ recipientTypes: ["PARTICIPANT", "PARENT", "TEACHER"], filters: { category: "Dance", status: "Accepted" } });
    assert("audience filtering", audience.estimatedRecipientCount === 9, audience);
    assert("email normalisation and deduplication", audience.uniqueEmailCount === 3 && audience.duplicatesRemoved === 2, audience);
    assert("invalid and missing recipient handling", audience.invalidEmailCount === 1 && audience.missingEmailCount === 3, audience);

    const senders = CommunicationService.getSenderIdentities();
    assert("authorised sender filtering", senders.some(item => item.id === "SYSTEM-TEST") && senders.some(item => item.id === "SHARED-SCHOOLS-SPECTACULAR"));
    const campaignResult = CommunicationService.execute("CreateCommunicationCampaign", { name: "Milestone test", category: "Operational update", senderIdentityId: "SYSTEM-TEST", audienceDefinition: { recipientTypes: ["PARTICIPANT"], filters: { category: "Dance" } }, templateId: "SYS-GENERAL-UPDATE" });
    assert("campaign creation", campaignResult.ok && campaignResult.data.status === "DRAFT", campaignResult);
    const templateResult = CommunicationService.execute("SaveCommunicationTemplate", { name: "Test template", category: "Test", subject: "Hello {{Participant.FirstName}}", htmlBody: "<p>{{Participant.FullName}}</p>", plainTextBody: "{{Participant.FullName}}", status: "ACTIVE" });
    assert("template create/edit", templateResult.ok && templateResult.data.version === 1, templateResult);
    const archiveTemplate = CommunicationService.execute("SaveCommunicationTemplate", Object.assign({}, templateResult.data, { status: "ARCHIVED" }));
    assert("template archive", archiveTemplate.ok && archiveTemplate.data.status === "ARCHIVED");
    const savedAudience = CommunicationService.execute("SaveAudience", { name: "Accepted dancers", recipientTypes: ["PARTICIPANT"], filters: { category: "Dance", status: "Accepted" } });
    assert("saved audience", savedAudience.ok && savedAudience.data.lastResolution.uniqueEmailCount === 1, savedAudience);
    const preview = CommunicationService.execute("PreviewCommunication", { campaignId: campaignResult.data.id, recipientIndex: 0 });
    assert("campaign preview and unresolved detection", preview.ok && preview.data.subject.indexOf("Alex") >= 0 && Array.isArray(preview.data.unresolved), preview);
    const testSend = CommunicationService.execute("SendTestCommunication", { campaignId: campaignResult.data.id, testEmail: actor.email });
    assert("mock test send", testSend.ok && testSend.data.provider.id === "MOCK" && testSend.data.provider.externalDelivery === false, testSend);
    assert("communication event and recipient history", CommunicationRepositoryService.list("events").some(item => item.type === "TEST_SENT") && CommunicationRepositoryService.list("recipients").some(item => item.status === "TESTED"));
    let providerFailed = false; try { CommunicationEmailProviderService.get("MOCK").sendTestMessage({ simulateFailure: true }); } catch (_) { providerFailed = true; }
    assert("mock provider controlled failure", providerFailed);
    const graph = CommunicationEmailProviderService.get("MICROSOFT_GRAPH").validateConfiguration();
    assert("Graph provider fails closed", graph.ok === false);
    capabilities.delete("Communications.Create"); capabilities.delete("Communications.EditOwn"); capabilities.delete("Communications.EditAll");
    const denied = CommunicationService.execute("CreateCommunicationCampaign", { name: "Denied", senderIdentityId: "SYSTEM-TEST", audienceDefinition: { recipientTypes: ["PARTICIPANT"], filters: {} } });
    assert("unauthorised campaign action", denied.ok === false && denied.errorCode === "PERMISSION_DENIED", denied);
    capabilities.add("Communications.Create"); capabilities.add("Communications.EditOwn"); capabilities.add("Communications.EditAll");
    const workspace = CommunicationService.getWorkspace();
    assert("workspace history and empty-safe collections", Array.isArray(workspace.campaigns) && Array.isArray(workspace.events) && workspace.providerStatus.realSendingEnabled === false);
  } finally {
    Object.assign(PlatformStoreService, originalStore); Object.assign(UserContextService, originalUser); Object.assign(ParticipantService, originalParticipants); StaffService.getAll = originalStaff;
  }
  return { passed: results.every(item => item.passed), count: results.length, results, generatedAt: new Date().toISOString() };
}
