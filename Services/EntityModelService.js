/** Canonical entity factories and stable identity helpers for SpecCentral. */
const EntityModelService = (() => {
  const TYPES = Object.freeze({
    PARTICIPANT: "Participant", SCHOOL: "School", TEACHER: "Teacher", STAFF: "StaffMember",
    USER: "User", GROUP: "Group", ITEM: "Item", CATEGORY: "Category", SEGMENT: "Segment", DEPARTMENT: "Department",
    VENUE: "Venue", TIMELINE_EVENT: "TimelineEvent", CALENDAR_EVENT: "CalendarEvent",
    REHEARSAL: "Rehearsal", OPERATIONAL_EVENT: "OperationalEvent",
    ATTENDANCE_SESSION: "AttendanceSession", SUPPORT_PLAN: "SupportPlan",
    COMMUNICATION: "Communication", COMMUNICATION_CAMPAIGN: "CommunicationCampaign", COMMUNICATION_TEMPLATE: "CommunicationTemplate",
    COMMUNICATION_RECIPIENT: "CommunicationRecipient", COMMUNICATION_EVENT: "CommunicationEvent", SAVED_AUDIENCE: "SavedAudience",
    SENDER_IDENTITY: "SenderIdentity", PRODUCTION: "Production", ATTENDANCE_RECORD: "AttendanceRecord",
    TASK: "Task", WORKFLOW: "Workflow", WORKFLOW_EXECUTION: "WorkflowExecution", JOB: "Job",
    NOTIFICATION: "Notification", AUDIT_RECORD: "AuditRecord", AUTOMATION_RULE: "AutomationRule"
  });

  function participant(input) {
    const value = Object.assign({}, input || {});
    const name = value.name || [value.firstName, value.lastName].filter(Boolean).join(" ");
    const studentKey = value.studentKey || [value.applicationId, value.studentId, name, value.school]
      .filter(Boolean).join(" | ");
    return Object.assign(value, {
      entityType: TYPES.PARTICIPANT,
      id: studentKey,
      studentKey,
      name,
      schoolId: stableId("SCH", value.schoolCode || value.school),
      itemId: stableId("ITM", value.item),
      categoryId: stableId("CAT", value.category || value.discipline)
    });
  }

  function school(input) {
    const value = Object.assign({}, input || {});
    const name = value.schoolName || value.school || value.name || "";
    return Object.assign(value, { entityType: TYPES.SCHOOL, id: stableId("SCH", name), schoolName: name, name, externalCode: value.code || value.externalCode || "" });
  }

  function group(input) {
    const value = Object.assign({}, input || {});
    const identity = [value.school, value.item, value.groupName, value.category, value.teacherEmail].filter(Boolean).join("|");
    return Object.assign(value, {
      entityType: TYPES.GROUP,
      id: value.groupId || stableId("GRP", identity),
      schoolId: stableId("SCH", value.school),
      itemId: stableId("ITM", value.item),
      categoryId: stableId("CAT", value.category),
      teacherId: stableId("TCH", value.teacherEmail || value.teacherName),
      segmentId: stableId("SEG", value.segment)
    });
  }

  function staff(input) {
    const value = Object.assign({}, input || {});
    return Object.assign(value, { entityType: TYPES.STAFF, id: stableId("STF", value.email || value.name) });
  }

  function teacher(input) { return namedEntity_(TYPES.TEACHER, "TCH", input, ["email", "name"]); }
  function item(input) { return namedEntity_(TYPES.ITEM, "ITM", input, ["name", "item"]); }
  function category(input) { return namedEntity_(TYPES.CATEGORY, "CAT", input, ["name", "category"]); }
  function segment(input) { return namedEntity_(TYPES.SEGMENT, "SEG", input, ["name", "segment"]); }
  function venue(input) { return namedEntity_(TYPES.VENUE, "VEN", input, ["name", "venue"]); }

  function namedEntity_(entityType, prefix, input, identityFields) {
    const value = typeof input === "string" ? { name: input } : Object.assign({}, input || {});
    const identity = identityFields.map(field => value[field]).find(Boolean) || "";
    return Object.assign(value, { entityType, id: value.id || stableId(prefix, identity), name: value.name || identity });
  }

  function timelineEvent(input) {
    const value = Object.assign({}, input || {});
    const fingerprint = [value.dateKey || value.dateDisplay, value.start, value.finish, value.title, value.venue]
      .filter(Boolean).join("|");
    const explicitId = value.eventId || value.timelineEventId || "";
    const id = explicitId || stableId("EVT", fingerprint);
    const classification = value.eventType || (value.isOperational ? "Operational Event" : "Rehearsal");
    return Object.assign(value, {
      entityType: TYPES.TIMELINE_EVENT,
      id,
      eventId: id,
      legacyIds: Array.from(new Set([].concat(value.legacyIds || [], value.legacyId || []).filter(Boolean))),
      eventType: classification,
      isRehearsal: classification === "Rehearsal",
      isOperational: classification === "Operational Event",
      venueId: stableId("VEN", value.venue),
      categoryIds: (value.categories || []).map(item => stableId("CAT", item)),
      schoolGroupIds: (value.schoolGroups || []).map(item => stableId("SCH", item)),
      studentGroupIds: (value.studentGroups || []).map(item => stableId("GRP", item))
    });
  }

  function attendanceSession(input) {
    const value = Object.assign({}, input || {});
    const id = value.sessionId || stableId("ATT", [value.dateKey || value.date, value.time, value.eventName, value.location].join("|"));
    return Object.assign(value, { entityType: TYPES.ATTENDANCE_SESSION, id, sessionId: id, eventId: value.eventId || "" });
  }

  function stableId(prefix, value) {
    const normalised = normaliseKey(value);
    if (!normalised) return "";
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalised);
    return `${prefix}-${Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "").slice(0, 16)}`;
  }

  function normaliseKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function findHeaderIndex(headers, aliases) {
    const normalisedHeaders = (headers || []).map(normaliseKey);
    const normalisedAliases = (aliases || []).map(normaliseKey);
    return normalisedHeaders.findIndex(header => normalisedAliases.includes(header));
  }

  return { TYPES, participant, school, group, staff, teacher, item, category, segment, venue, timelineEvent, attendanceSession, stableId, normaliseKey, findHeaderIndex };
})();
