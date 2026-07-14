/** Resolves dynamic communication audiences from canonical SpecCentral services. */
const CommunicationAudienceService = (() => {
  const TYPES = Object.freeze(["PARTICIPANT", "PARENT", "TEACHER", "SCHOOL", "STAFF"]);
  function resolve(definition, options) {
    const query = definition || {}, filters = query.filters || {}, requested = (query.recipientTypes || ["PARTICIPANT"]).filter(type => TYPES.includes(type));
    const participants = safe_(() => ParticipantService.getAll(), []), groups = safe_(() => ParticipantService.getGroups(), []), schools = safe_(() => ParticipantService.getActiveSchoolsData(participants, groups), []), staff = safe_(() => StaffService.getAll(), []);
    const eventParticipants = filters.eventId ? safe_(() => RelationshipService.getAffectedParticipants(filters.eventId), []) : null;
    const allowedIds = eventParticipants ? new Set(eventParticipants.map(item => String(item.id || item.studentKey || ""))) : null;
    const matched = participants.filter(item => participantMatches_(item, filters, allowedIds));
    let candidates = [];
    if (requested.includes("PARTICIPANT")) candidates = candidates.concat(matched.map(participantRecipient_));
    if (requested.includes("PARENT")) matched.forEach(item => { candidates.push(parentRecipient_(item, false)); if (item.additionalParentEmail || item.additionalParentName) candidates.push(parentRecipient_(item, true)); });
    if (requested.includes("TEACHER")) candidates = candidates.concat(matched.map(teacherRecipient_));
    if (requested.includes("SCHOOL")) candidates = candidates.concat(schools.filter(item => schoolMatches_(item, filters)).map(schoolRecipient_));
    if (requested.includes("STAFF")) candidates = candidates.concat(staff.filter(item => staffMatches_(item, filters)).map(staffRecipient_));
    const missing = candidates.filter(item => !String(item.emailAddress || "").trim()), invalid = candidates.filter(item => item.emailAddress && !validEmail_(item.emailAddress)), valid = candidates.filter(item => validEmail_(item.emailAddress));
    const unique = [], seen = {}, duplicates = [];
    valid.forEach(item => { const key = normaliseEmail(item.emailAddress); if (seen[key]) duplicates.push(item); else { seen[key] = true; unique.push(Object.assign({}, item, { emailAddress: key })); } });
    const result = { definition: { recipientTypes: requested, filters: Object.assign({}, filters) }, estimatedRecipientCount: candidates.length, uniqueEmailCount: unique.length, duplicatesRemoved: duplicates.length, invalidEmailCount: invalid.length, missingEmailCount: missing.length, excludedCount: invalid.length + missing.length + duplicates.length, recipients: unique, sampleRecipients: unique.slice(0, 20), invalidSamples: invalid.slice(0, 8).map(summary_), missingSamples: missing.slice(0, 8).map(summary_), duplicateSamples: duplicates.slice(0, 8).map(summary_), resolvedAt: new Date().toISOString() };
    if (options && options.summaryOnly) delete result.recipients;
    return result;
  }
  function participantMatches_(item, filters, allowedIds) {
    if (allowedIds && !allowedIds.has(String(item.id || item.studentKey || ""))) return false;
    const matches = (field, expected) => !expected || EntityModelService.normaliseKey(field) === EntityModelService.normaliseKey(expected);
    return matches(item.applicationStatus, filters.status) && matches(item.category || item.discipline, filters.category) && matches(item.item, filters.item) && matches(item.segment, filters.segment) && matches(item.schoolGroup, filters.group) && matches(item.school, filters.school) && matches(item.directorate, filters.directorate) && matches(item.region, filters.region) && matches(item.participationType, filters.participantType);
  }
  function schoolMatches_(item, filters) { return (!filters.school || EntityModelService.normaliseKey(item.schoolName || item.name) === EntityModelService.normaliseKey(filters.school)) && (!filters.region || EntityModelService.normaliseKey(item.region || item.directorate) === EntityModelService.normaliseKey(filters.region)); }
  function staffMatches_(item, filters) { return (!filters.role || EntityModelService.normaliseKey(item.productionRole || item.role) === EntityModelService.normaliseKey(filters.role)) && (!filters.category || list_(item.categoryResponsibilities).map(EntityModelService.normaliseKey).includes(EntityModelService.normaliseKey(filters.category))); }
  function participantRecipient_(item) { return recipient_("PARTICIPANT", item.id || item.studentKey, item.studentEmail || item.email, item.name || [item.firstName, item.lastName].filter(Boolean).join(" "), merge_(item), ["Participant record", reason_(item)]); }
  function parentRecipient_(item, additional) { const name = additional ? item.additionalParentName : item.parentName, email = additional ? item.additionalParentEmail : item.parentEmail; return recipient_("PARENT", [item.id || item.studentKey, additional ? "additional" : "primary"].join(":"), email, name || "Parent/carer of " + (item.name || "participant"), merge_(item), [additional ? "Additional parent/carer" : "Primary parent/carer", reason_(item)]); }
  function teacherRecipient_(item) { const data = merge_(item); return recipient_("TEACHER", EntityModelService.stableId("TCH", item.teacherEmail || item.teacherName), item.teacherEmail, item.teacherName || "Teacher", data, ["Supervising teacher", reason_(item)]); }
  function schoolRecipient_(item) { const name = item.schoolName || item.name || item.school || "School"; return recipient_("SCHOOL", item.id || EntityModelService.stableId("SCH", name), item.email || item.schoolEmail || item.contactEmail || item.principalEmail, name, { School: { Name: name }, Sender: {} }, ["School directory"]); }
  function staffRecipient_(item) { const name = item.displayName || item.name || "Staff member", parts = splitName_(name); return recipient_("STAFF", item.id || item.staffId || item.email, item.email || item.primaryEmail, name, { Staff: { FirstName: item.preferredName || item.firstName || parts.first, FullName: name }, Sender: {} }, ["Staff directory", item.productionRole || item.role || "Staff"]); }
  function merge_(item) { const participantName = item.name || [item.firstName, item.lastName].filter(Boolean).join(" "), teacherName = item.teacherName || "", teacherParts = splitName_(teacherName); return { Participant: { FirstName: item.firstName || splitName_(participantName).first, FullName: participantName }, School: { Name: item.school || "" }, Teacher: { FirstName: teacherParts.first, FullName: teacherName }, Item: { Name: item.item || "" }, Category: { Name: item.category || item.discipline || "" }, Segment: { Name: item.segment || "" }, Group: { Name: item.schoolGroup || "" }, Sender: {} }; }
  function recipient_(type, id, email, name, mergeData, reasons) { return { id: EntityModelService.stableId("REC", [type, id, email].join("|")), entityType: type, entityId: String(id || ""), emailAddress: String(email || "").trim(), displayName: String(name || "").trim(), mergeData: mergeData || {}, matchReasons: (reasons || []).filter(Boolean), status: "RESOLVED" }; }
  function reason_(item) { return [item.category || item.discipline, item.item, item.school, item.segment].filter(Boolean).join(" · "); }
  function summary_(item) { return { entityType: item.entityType, entityId: item.entityId, displayName: item.displayName, emailAddress: item.emailAddress, matchReasons: item.matchReasons }; }
  function normaliseEmail(value) { return String(value || "").trim().toLowerCase(); }
  function validEmail_(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(value)); }
  function splitName_(name) { const parts = String(name || "").trim().split(/\s+/).filter(Boolean); return { first: parts[0] || "", last: parts.slice(1).join(" ") }; }
  function list_(value) { return Array.isArray(value) ? value : String(value || "").split(/[,;\n]+/).map(item => item.trim()).filter(Boolean); }
  function safe_(fn, fallback) { try { return fn(); } catch (error) { return fallback; } }
  function getSupportedFilters() { return ["status", "category", "item", "segment", "group", "school", "directorate", "region", "eventId", "role", "participantType"]; }
  function getFilterOptions() {
    const participants = safe_(() => ParticipantService.getAll(), []), staff = safe_(() => StaffService.getAll(), []);
    const values = field => Array.from(new Set(participants.map(item => String(item[field] || "").trim()).filter(Boolean))).sort();
    return { statuses: values("applicationStatus"), categories: Array.from(new Set(participants.map(item => String(item.category || item.discipline || "").trim()).filter(Boolean))).sort(), items: values("item"), segments: values("segment"), groups: values("schoolGroup"), schools: values("school"), directorates: values("directorate"), regions: values("region"), participantTypes: values("participationType"), roles: Array.from(new Set(staff.map(item => String(item.productionRole || item.role || "").trim()).filter(Boolean))).sort() };
  }
  return { resolve, normaliseEmail, getSupportedFilters, getFilterOptions, recipientTypes: () => TYPES.slice() };
})();
