/** Versioned, permission-aware read-model contracts for performance projections. */
const ProjectionContractService = (() => {
  const CONTRACTS = Object.freeze({
    dashboard: Object.freeze({ name: "dashboard", version: "dashboard-v2" }),
    participantList: Object.freeze({ name: "participants-list", version: "participant-list-v2" }),
    participantPage: Object.freeze({ name: "participants-page", version: "participant-list-page-v2" }),
    participantGroups: Object.freeze({ name: "participant-groups", version: "participant-groups-v1" }),
    participantFilters: Object.freeze({ name: "participants-filters", version: "participant-filter-v2" }),
    participantDetail: Object.freeze({ name: "participant-detail", version: "participant-detail-v2" }),
    activeAttendance: Object.freeze({ name: "attendance-active", version: "attendance-active-v1" })
  });
  const LIST_FIELDS = Object.freeze([
    "id", "studentKey", "firstName", "lastName", "name", "schoolId", "school", "year",
    "discipline", "subDiscipline", "category", "categoryDetail", "item", "itemId", "region", "gender",
    "directorate", "applicationStatus", "participationType", "segment", "schoolGroup",
    "attendanceStatus", "lastUpdated", "hasPhoto", "assetKey", "assetVersion"
  ]);
  const FILTER_FIELDS = Object.freeze([
    "schools", "years", "disciplines", "categories", "items", "regions", "directorates",
    "statuses", "participationTypes", "segments", "schoolGroups", "genders"
  ]);
  const GROUP_FIELDS = Object.freeze(["id", "groupId", "school", "segment", "item", "category", "groupName", "acceptedCount", "allocatedCount", "count", "acceptanceStatus", "teacherName", "secondTeacherName", "classroom"]);
  const FORBIDDEN_LIST_FIELD = /(^|_)(email|phone|mobile|parent|teacher|medical|support|note|form|audit|photoid|photourl|drive|raw)(_|$)/i;

  function contract(name) {
    const value = CONTRACTS[name];
    if (!value) throw new Error("Unknown projection contract: " + name);
    return value;
  }

  function cacheKey(name, parameters, user) {
    const definition = contract(name), control = PlatformControlService.getConfig();
    const mappingVersion = String(PropertiesService.getScriptProperties().getProperty("SC_SOURCE_MAPPING_VERSION") || "1");
    return [
      "speccentral", definition.name, definition.version,
      "schema=" + control.schemaVersion,
      "epoch=" + control.cacheEpoch,
      "mapping=" + mappingVersion,
      "domain=" + domainEpoch_(name),
      "scope=" + permissionScopeKey(user),
      "query=" + digest_(stableStringify_(parameters || {}), 20)
    ].join(":");
  }

  function permissionScopeKey(user) {
    const value = user || {};
    const scope = value.isAdmin ? { type: "production", values: [] } : value.scope || { type: "production", values: [] };
    return digest_(stableStringify_({
      scope: { type: String(scope.type || "production").toLowerCase(), values: (scope.values || []).map(item => String(item || "").toLowerCase()).sort() }
    }), 20);
  }

  function validate(name, projection) {
    const definition = contract(name), errors = [];
    if (!projection || typeof projection !== "object" || Array.isArray(projection)) errors.push("Projection must be an object.");
    if (projection && projection.projection !== definition.version) errors.push("Projection schema-version mismatch.");
    if (name === "dashboard") validateDashboard_(projection, errors);
    if (name === "participantList" || name === "participantPage") validateParticipantCollection_(projection, errors);
    if (name === "participantGroups") validateParticipantGroups_(projection, errors);
    if (name === "participantFilters") validateFilters_(projection, errors);
    if (name === "participantDetail") validateDetail_(projection, errors);
    if (name === "activeAttendance") validateAttendance_(projection, errors);
    if (errors.length) {
      const error = new Error("PROJECTION_VALIDATION_FAILED: " + errors.slice(0, 8).join(" "));
      error.code = "PROJECTION_VALIDATION_FAILED";
      error.projection = definition.name;
      throw error;
    }
    return projection;
  }

  function validateDashboard_(value, errors) {
    if (!value) return;
    if (Array.isArray(value.participants) || Array.isArray(value.groups) || Array.isArray(value.schools)) errors.push("Dashboard contains record collections.");
    if (!validDate_(value.generatedAt)) errors.push("Dashboard generatedAt is malformed.");
  }

  function validateParticipantCollection_(value, errors) {
    const participants = value && value.participants;
    if (!Array.isArray(participants)) return errors.push("Participant projection requires a participants array.");
    const seen = new Set();
    participants.forEach((participant, index) => {
      const stableId = String(participant && (participant.studentKey || participant.id) || "").trim();
      if (!stableId) errors.push("Participant " + index + " is missing a stable ID.");
      else if (seen.has(stableId)) errors.push("Duplicate stable participant ID.");
      else seen.add(stableId);
      Object.keys(participant || {}).forEach(field => {
        if (!LIST_FIELDS.includes(field) || FORBIDDEN_LIST_FIELD.test(field)) errors.push("Unexpected participant-list field: " + field + ".");
      });
      const status = participant && participant.applicationStatus;
      if (status !== undefined && (typeof status !== "string" || status.length > 120 || /[<>]/.test(status))) errors.push("Invalid participant status value.");
      if (participant && participant.assetKey && !/^participant:[^\s]+:headshot$/.test(String(participant.assetKey))) errors.push("Invalid participant asset key.");
    });
    if (value.generatedAt && !validDate_(value.generatedAt)) errors.push("Participant projection generatedAt is malformed.");
  }

  function validateParticipantGroups_(value, errors) {
    const groups = value && value.groups;
    if (!Array.isArray(groups)) return errors.push("Participant group projection requires a groups array.");
    groups.forEach((group, index) => {
      if (!String(group && (group.groupId || group.id) || "").trim()) errors.push("Participant group " + index + " is missing a stable ID.");
      Object.keys(group || {}).forEach(field => { if (!GROUP_FIELDS.includes(field) || FORBIDDEN_LIST_FIELD.test(field)) errors.push("Unexpected participant-group field: " + field + "."); });
    });
  }

  function validateFilters_(value, errors) {
    if (!value || !value.values || typeof value.values !== "object") return errors.push("Filter projection requires values.");
    Object.keys(value.values).forEach(field => {
      if (!FILTER_FIELDS.includes(field)) errors.push("Unexpected filter field: " + field + ".");
      if (!Array.isArray(value.values[field]) || value.values[field].some(item => typeof item !== "string")) errors.push("Filter values must be strings.");
    });
  }

  function validateDetail_(value, errors) {
    const participant = value && value.participant;
    if (!participant || !String(participant.studentKey || participant.id || "").trim()) errors.push("Participant detail requires a stable ID.");
    if (participant && (participant.photoId || participant.photoUrl || participant.driveUrl)) errors.push("Participant detail exposes a storage reference.");
  }

  function validateAttendance_(value, errors) {
    if (!value || !Array.isArray(value.events)) errors.push("Active Attendance projection requires events.");
    if (value && (value.participants || value.history)) errors.push("Active Attendance projection contains participant records or history.");
  }

  function stableStringify_(value) {
    if (Array.isArray(value)) return "[" + value.map(stableStringify_).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableStringify_(value[key])).join(",") + "}";
    return JSON.stringify(value);
  }
  function digest_(value, length) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""))).replace(/=+$/, "").slice(0, length || 24); }
  function domainEpoch_(name) {
    const domain = /^participant/.test(name) ? "PARTICIPANT" : name === "activeAttendance" ? "ATTENDANCE" : name === "dashboard" ? "DASHBOARD" : "GENERAL";
    return String(PropertiesService.getScriptProperties().getProperty("SC_" + domain + "_PROJECTION_EPOCH") || "1");
  }
  function validDate_(value) { return !!value && !Number.isNaN(new Date(value).getTime()); }

  return { CONTRACTS, LIST_FIELDS, FILTER_FIELDS, contract, cacheKey, permissionScopeKey, validate };
})();
