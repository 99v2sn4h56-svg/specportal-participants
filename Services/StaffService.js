const StaffService = (() => {
  let staffCache_ = null;

  function getCurrent() {
    return UserContextService.getCurrent();
  }

  function getCurrentUser() {
    return UserContextService.getCurrent();
  }

  function getAll() {
    if (staffCache_) return staffCache_;
    // Same stale-while-revalidate pattern settled on for participants this
    // session: a short freshness window but a much longer hard-expiry retain
    // window, since refresh() already explicitly invalidates this key on any
    // real staff-data change -- so a long safety-net TTL doesn't risk
    // serving very stale data, it just avoids a guaranteed cold rebuild
    // (three sequential sheet reads) for whoever's request happens to land
    // right after the old short TTL lapsed.
    const loader = () => {
      try {
        const sourceConfig = SourceRegistryService.getSourceConfig("staff");
        const sheets = SpreadsheetApp.openById(sourceConfig.spreadsheetId).getSheets();
        const directorySheet = findSheetByNames_(sheets, ["staff list", "staff production team"]);
        const accessSheet = findSheetByNames_(sheets, ["speccentral", "seccentral"]);
        const fallback = !directorySheet ? findStaffSource_(sheets) : null;
        const directory = directorySheet ? readStaffSheet_(directorySheet, "Staff List") : readStaffRows_(fallback && fallback.values || [], fallback && fallback.headerRowIndex || 0, "Staff source");
        const access = accessSheet && accessSheet !== directorySheet ? readStaffSheet_(accessSheet, "SpecCentral") : [];
        const allocations = readEventAllocations_(findSheetByNames_(sheets, ["staff event allocation"]));
        return mergeStaffCollections_(directory, access, allocations)
          .filter(record => record.staffId || record.email || record.name);
      } catch (err) {
        Logger.log("StaffService.getAll failed: " + (err && err.message ? err.message : err));
        return [];
      }
    };
    staffCache_ = PerformanceCacheService.getOrLoadStaleWhileRevalidate("staff:all", 5 * 60, 3 * 60 * 60, loader).value;
    return staffCache_;
  }

  function refresh() { staffCache_ = null; PerformanceCacheService.remove("staff:all"); HeadshotAssetService.invalidate("staff"); CacheService.getScriptCache().put("SC_STAFF_EPOCH", String(Date.now()), 21600); return getAll(); }

  function mapStaffRow_(row, indexes) {
    const firstName = getCell_(row, indexes.firstName);
    const lastName = getCell_(row, indexes.lastName);
    const explicitName = cleanName_(getCell_(row, indexes.name));
    const name = explicitName || [firstName, lastName].filter(Boolean).join(" ");
    const access = String(getCell_(row, indexes.access) || "")
      .split(/[,;\n]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean);
    const permissions = String(getCell_(row, indexes.permissions) || "")
      .split(/[,;\n]+/)
      .map(value => value.trim())
      .filter(Boolean);
    const allocatedEvents = String(getCell_(row, indexes.allocatedEvents) || "")
      .split(/[,;\n]+/)
      .map(value => value.trim())
      .filter(Boolean);

    const primaryEmail = getCell_(row, indexes.primaryEmail) || getCell_(row, indexes.email);
    const productionRole = getCell_(row, indexes.productionRole);
    const specCentralRole = getCell_(row, indexes.specCentralRole);
    const status = normaliseStatus_(getCell_(row, indexes.status));
    return EntityModelService.staff({
      staffId: getCell_(row, indexes.staffId),
      name,
      displayName: getCell_(row, indexes.displayName) || name,
      preferredName: getCell_(row, indexes.preferredName),
      firstName,
      lastName,
      email: primaryEmail,
      primaryEmail,
      secondaryEmail: getCell_(row, indexes.secondaryEmail),
      personalEmail: getCell_(row, indexes.personalEmail),
      aliasEmails: splitList_(getCell_(row, indexes.aliasEmails)),
      legacyEmails: splitList_(getCell_(row, indexes.legacyEmails)),
      role: specCentralRole || "No Access",
      specCentralRole: specCentralRole || "No Access",
      productionRole,
      productionRoles: splitList_(productionRole),
      team: getCell_(row, indexes.team),
      department: getCell_(row, indexes.department) || getCell_(row, indexes.team),
      departments: splitList_(getCell_(row, indexes.departments) || getCell_(row, indexes.department) || getCell_(row, indexes.team)),
      school: getCell_(row, indexes.school),
      teams: splitList_(getCell_(row, indexes.teams) || getCell_(row, indexes.department) || getCell_(row, indexes.team)),
      categoryResponsibilities: splitList_(getCell_(row, indexes.categoryResponsibilities)),
      assignedItems: splitList_(getCell_(row, indexes.assignedItems) || getCell_(row, indexes.categoryResponsibilities)),
      assignedGroups: splitList_(getCell_(row, indexes.assignedGroups)),
      assignedEvents: allocatedEvents,
      mobile: getCell_(row, indexes.mobile),
      typeOfWork: getCell_(row, indexes.typeOfWork) || getCell_(row, indexes.employment),
      employment: getCell_(row, indexes.employment),
      employmentType: getCell_(row, indexes.employmentType) || getCell_(row, indexes.employment),
      organisation: getCell_(row, indexes.organisation),
      experience: getCell_(row, indexes.experience),
      supervisor: getCell_(row, indexes.supervisor),
      notes: getCell_(row, indexes.notes),
      availability: getCell_(row, indexes.availability),
      roleDescription: getCell_(row, indexes.roleDescription),
      alumni: getCell_(row, indexes.alumni),
      alumniExperience: getCell_(row, indexes.alumniExperience),
      access,
      permissions,
      allocatedEvents,
      photo: getCell_(row, indexes.photo),
      status,
      specCentralAccess: !!specCentralRole && !/^no access$/i.test(specCentralRole),
      accessStatus: specCentralRole && !/^no access$/i.test(specCentralRole) ? "Enabled" : "No Access",
      emergencyContact: {
        name: getCell_(row, indexes.emergencyContactName),
        phone: getCell_(row, indexes.emergencyContactPhone),
        email: getCell_(row, indexes.emergencyContactEmail),
        relationship: getCell_(row, indexes.emergencyContactRelationship)
      },
      scope: {
        type: getCell_(row, indexes.scopeType) || "production",
        values: String(getCell_(row, indexes.scopeValues) || "").split(/[,;\n]+/).map(value => value.trim()).filter(Boolean)
      },
      source: "Staff Production Team spreadsheet"
    });
  }

  function getPermissions(email, staffRecord) {
    const staff = staffRecord || {};
    if (!staff.specCentralAccess && (!staff.specCentralRole || /^no access$/i.test(staff.specCentralRole))) return [];
    const raw = []
      .concat(staff.permissions || [])
      .concat(staff.access || []);

    const permissions = raw
      .map(toPermission_)
      .filter(Boolean);

    const expandedPermissions = expandPermissions_(permissions);

    return Array.from(new Set(expandedPermissions)).sort();
  }

  function readStaffSheet_(sheet, sourceName) {
    const values = sheet.getDataRange().getValues();
    return readStaffRows_(values, findHeaderRow_(values), sourceName);
  }

  function readStaffRows_(values, headerRowIndex, sourceName) {
    if (!values || !values.length) return [];
    const headers = values[headerRowIndex].map(value => String(value || "").trim());
    const indexes = buildIndexes_(headers);
    return values.slice(headerRowIndex + 1).map(row => {
      const record = mapStaffRow_(row, indexes);
      if (sourceName === "SpecCentral" && indexes.status < 0) record.status = "";
      record.sourceSheet = sourceName;
      return record;
    }).filter(record => record.staffId || record.email || record.name);
  }

  function buildIndexes_(headers) {
    return {
      name: findPreferredHeaderIndex_(headers, ["display name", "name", "staff name", "full name"]),
      displayName: findHeaderIndex_(headers, ["display name"]), preferredName: findHeaderIndex_(headers, ["preferred name", "known as"]),
      firstName: findHeaderIndex_(headers, ["first name", "given name", "first"]), lastName: findHeaderIndex_(headers, ["last name", "second name", "surname", "family name", "last"]),
      email: findPreferredHeaderIndex_(headers, ["speccentral email", "email", "email address", "det email", "work email"]),
      primaryEmail: findPreferredHeaderIndex_(headers, ["speccentral email", "primary det email", "primary email", "det email", "work email", "email", "email address"]),
      secondaryEmail: findHeaderIndex_(headers, ["secondary email", "alternate email", "alternative email", "email 2"]), personalEmail: findHeaderIndex_(headers, ["personal email", "private email"]),
      aliasEmails: findHeaderIndex_(headers, ["alias email", "alias emails", "email aliases", "aliases"]), legacyEmails: findHeaderIndex_(headers, ["legacy email", "legacy emails", "previous email", "old email"]),
      staffId: findHeaderIndex_(headers, ["staff id", "employee id", "personnel id", "det user id"]),
      productionRole: findPreferredHeaderIndex_(headers, ["production role", "role", "position", "team role"]), specCentralRole: findHeaderIndex_(headers, ["speccentral role", "spec central role"]),
      team: findHeaderIndex_(headers, ["team", "department", "area"]), teams: findHeaderIndex_(headers, ["teams", "assigned teams"]), department: findHeaderIndex_(headers, ["department", "team", "area"]), departments: findHeaderIndex_(headers, ["departments", "production areas", "areas"]),
      school: findHeaderIndex_(headers, ["associated school", "school", "home school", "base school"]), organisation: findHeaderIndex_(headers, ["organisation", "organization", "school or organisation", "school or organization"]),
      assignedItems: findHeaderIndex_(headers, ["assigned items", "items", "allocated items"]), assignedGroups: findHeaderIndex_(headers, ["assigned groups", "groups", "allocated groups"]), categoryResponsibilities: findHeaderIndex_(headers, ["category responsibility", "category responsibilities", "categories", "scope values"]),
      mobile: findHeaderIndex_(headers, ["mobile phone", "mobile number", "mobile", "phone", "contact number"]), typeOfWork: findHeaderIndex_(headers, ["type of work", "work type"]), employment: findHeaderIndex_(headers, ["employment"]), employmentType: findHeaderIndex_(headers, ["employment type", "please select which best describes your employment"]),
      access: findHeaderIndex_(headers, ["access", "modules", "permissions"]), permissions: findHeaderIndex_(headers, ["permissions", "permission", "access"]), allocatedEvents: findHeaderIndex_(headers, ["allocated events", "events", "event allocation", "allocated rehearsals", "dates events for mail merge"]),
      photo: findHeaderIndex_(headers, ["display picture", "photo", "photo url", "headshot", "head shot", "profile photo"]), status: findHeaderIndex_(headers, ["status", "result", "active", "active?"]), scopeType: findHeaderIndex_(headers, ["scope type", "scope"]), scopeValues: findHeaderIndex_(headers, ["scope values", "scope value", "scope items"]),
      experience: findHeaderIndex_(headers, ["experience", "experience summary"]), supervisor: findHeaderIndex_(headers, ["supervisor", "manager", "reports to"]), notes: findHeaderIndex_(headers, ["notes", "staff notes"]), availability: findHeaderIndex_(headers, ["availability", "show week"]), roleDescription: findHeaderIndex_(headers, ["role description"]), alumni: findHeaderIndex_(headers, ["are you a schools spectacular alumni", "schools spectacular alumni", "alumni"]), alumniExperience: findHeaderIndex_(headers, ["if yes please list the year and category", "alumni experience"]),
      emergencyContactName: findHeaderIndex_(headers, ["emergency contact", "emergency contact name"]), emergencyContactPhone: findHeaderIndex_(headers, ["emergency contact phone", "emergency contact mobile"]), emergencyContactEmail: findHeaderIndex_(headers, ["emergency contact email"]), emergencyContactRelationship: findHeaderIndex_(headers, ["emergency contact relationship"])
    };
  }

  function mergeStaffCollections_(directory, accessRows, allocations) {
    const records = [], byKey = {};
    (directory || []).concat(accessRows || []).forEach(record => {
      const keys = identityKeys_(record);
      let existing = keys.map(key => byKey[key]).find(Boolean);
      if (!existing) { existing = Object.assign({}, record); records.push(existing); }
      else mergeStaffRecord_(existing, record);
      identityKeys_(existing).concat(keys).forEach(key => { byKey[key] = existing; });
    });
    records.forEach(record => {
      const allocationRows = identityKeys_(record).flatMap(key => allocations[key] || []);
      const uniqueAllocations = uniqueObjects_(allocationRows, item => [item.date, item.event, item.time, item.location].join("|"));
      record.eventAllocations = uniqueAllocations;
      record.allocatedEvents = unique_((record.allocatedEvents || []).concat(uniqueAllocations.map(item => item.event)));
      record.assignedEvents = record.allocatedEvents.slice();
      record.productionRoles = unique_((record.productionRoles || []).concat(record.productionRole || []));
      record.departments = unique_((record.departments || []).concat(record.department || []));
      record.teams = unique_((record.teams || []).concat(record.team || [], record.department || []));
      record.specCentralRole = record.specCentralRole || "No Access";
      record.role = record.specCentralRole;
      record.specCentralAccess = !/^no access$/i.test(record.specCentralRole);
      record.accessStatus = record.specCentralAccess ? "Enabled" : "No Access";
    });
    return records.sort((a, b) => String(a.displayName || a.name).localeCompare(String(b.displayName || b.name)));
  }

  function mergeStaffRecord_(target, incoming) {
    const listFields = ["aliasEmails", "legacyEmails", "departments", "teams", "productionRoles", "assignedItems", "assignedGroups", "assignedEvents", "allocatedEvents", "access", "permissions", "categoryResponsibilities"];
    listFields.forEach(field => { target[field] = unique_((target[field] || []).concat(incoming[field] || [])); });
    Object.keys(incoming || {}).forEach(field => {
      if (listFields.includes(field) || field === "id" || field === "emergencyContact") return;
      const value = incoming[field];
      const accessAuthority = incoming.sourceSheet === "SpecCentral" && ["specCentralRole", "role", "email", "primaryEmail", "scope", "status", "department", "productionRole", "staffId"].includes(field);
      if (accessAuthority ? value !== "" && value !== null && value !== undefined : (!target[field] && value)) target[field] = value;
    });
    target.emergencyContact = Object.assign({}, target.emergencyContact || {}, Object.fromEntries(Object.entries(incoming.emergencyContact || {}).filter(entry => entry[1])));
  }

  function readEventAllocations_(sheet) {
    const result = {};
    if (!sheet) return result;
    const values = sheet.getDataRange().getValues();
    if (!values.length) return result;
    const header = findHeaderRow_(values), indexes = buildAllocationIndexes_(values[header]);
    values.slice(header + 1).forEach(row => {
      const allocation = { date: getCell_(row, indexes.date), event: getCell_(row, indexes.event), time: getCell_(row, indexes.time), location: getCell_(row, indexes.location), role: getCell_(row, indexes.role), department: getCell_(row, indexes.department) };
      if (!allocation.event && !allocation.date) return;
      const identity = { staffId: getCell_(row, indexes.staffId), name: getCell_(row, indexes.name), email: getCell_(row, indexes.email) };
      identityKeys_(identity).forEach(key => { result[key] = result[key] || []; result[key].push(allocation); });
    });
    return result;
  }

  function buildAllocationIndexes_(headers) { return { staffId: findHeaderIndex_(headers, ["staff id"]), name: findHeaderIndex_(headers, ["full name", "name"]), email: findHeaderIndex_(headers, ["email", "email address"]), department: findHeaderIndex_(headers, ["department"]), role: findHeaderIndex_(headers, ["role"]), date: findHeaderIndex_(headers, ["date"]), event: findHeaderIndex_(headers, ["event"]), time: findHeaderIndex_(headers, ["time"]), location: findHeaderIndex_(headers, ["location", "venue"]) }; }
  function identityKeys_(record) { return unique_([record.staffId && `id:${normaliseIdentity_(record.staffId)}`, record.primaryEmail && `email:${normaliseEmail_(record.primaryEmail)}`, record.email && `email:${normaliseEmail_(record.email)}`, record.name && `name:${normaliseIdentity_(record.name)}`].filter(Boolean)); }
  function unique_(values) { return Array.from(new Set([].concat(values || []).map(value => String(value || "").trim()).filter(Boolean))); }
  function uniqueObjects_(values, keyFn) { const seen = {}; return (values || []).filter(value => { const key = keyFn(value); if (!key || seen[key]) return false; seen[key] = true; return true; }); }
  function findSheetByNames_(sheets, names) { const targets = (names || []).map(normaliseHeading_); return (sheets || []).find(sheet => targets.includes(normaliseHeading_(sheet.getName()))) || null; }
  function normaliseEmail_(value) { return String(value || "").trim().toLowerCase(); }
  function normaliseIdentity_(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
  function cleanName_(value) { const text = String(value || "").trim(); return /^#(ref|n\/a|value|name)/i.test(text) ? "" : text; }
  function normaliseStatus_(value) { const text = String(value || "").trim(); if (!text || /^(yes|x|accepted)$/i.test(text)) return "Active"; if (/^(no|inactive|not accepted|unsuccessful)$/i.test(text)) return "Inactive"; return text; }

  function getVisibleModules_(permissions) {
    const permissionSet = new Set(permissions || []);
    const modules = [
      ["dashboard", "dashboard.view"],
      ["participants", "participants.view"],
      ["calendar", "calendar.view"],
      ["rehearsals", "rehearsals.view"],
      ["attendance", "attendance.view"],
      ["staff", "staff.view"],
      ["operations", "operations.view"],
      ["mediaTimeline", "mediaTimeline.view"],
      ["settings", "settings.view"]
    ];

    return modules
      .filter(([module, permission]) => permissionSet.has(permission) || permissionSet.has(module))
      .map(([module]) => module);
  }

  function getVisibleModules(permissions) { return getVisibleModules_(permissions); }

  function getIdentityConflicts() {
    const byIdentity = {};
    getAll().forEach(staff => {
      Array.from(new Set([staff.primaryEmail, staff.email, staff.secondaryEmail, staff.personalEmail].concat(staff.aliasEmails || [], staff.legacyEmails || [])
        .map(value => String(value || "").trim().toLowerCase()).filter(Boolean)))
        .forEach(value => { byIdentity[value] = byIdentity[value] || []; byIdentity[value].push({ staffId: staff.staffId || "", name: staff.name || staff.displayName || "", role: staff.role || "" }); });
    });
    return Object.keys(byIdentity).filter(key => byIdentity[key].length > 1).map(identity => ({ identity, count: byIdentity[identity].length, records: byIdentity[identity] }));
  }

  function toPermission_(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.includes(".")) return text;

    const key = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const permissionMap = {
      dashboard: "dashboard.view",
      participants: "participants.view",
      calendar: "calendar.view",
      rehearsals: "rehearsals.view",
      attendance: "attendance.view",
      staff: "staff.view",
      settings: "settings.view",
      operations: "operations.view",
      operation: "operations.view",
      "project management": "operations.view",
      "projectmanagement": "operations.view",
      "operations overview": "operations.overview.view",
      "operations events": "operations.events.manage",
      "operations users": "operations.users.manage",
      "operations permissions": "operations.permissions.manage",
      "operations projects": "operations.projects.view",
      "operations project management": "operations.projects.manage",
      "operations data": "operations.data.manage",
      "operations announcements": "operations.announcements.manage",
      "operations integrations": "operations.integrations.manage",
      "operations diagnostics": "operations.diagnostics.view",
      "media timeline": "mediaTimeline.view",
      "mediatimeline": "mediaTimeline.view"
    };

    return permissionMap[key] || text;
  }

  function expandPermissions_(permissions) {
    const set = new Set(permissions || []);
    if (set.has("projectManagement.view")) set.add("operations.view");
    Array.from(set).forEach(permission => {
      if (String(permission || "").indexOf("operations.") === 0 && permission !== "operations.view") {
        set.add("operations.view");
      }
    });
    return Array.from(set);
  }

  function findHeaderRow_(values) {
    const maxRows = Math.min(values.length, 50);
    let bestIndex = 0;
    let bestScore = 0;

    for (let i = 0; i < maxRows; i++) {
      const row = values[i].map(value => String(value || "").trim().toLowerCase());
      const score = scoreHeaderRow_(row);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  function findStaffSource_(sheets) {
    let best = { values: [], headerRowIndex: 0, score: -1 };
    const dedicated = (sheets || []).find(sheet => ["speccentral", "seccentral"].includes(normaliseHeading_(sheet.getName())));
    if (dedicated) {
      const values = dedicated.getDataRange().getValues();
      if (values.length) {
        const headerRowIndex = findHeaderRow_(values);
        const row = values[headerRowIndex].map(value => normaliseHeading_(value));
        if (row.includes("speccentral email") && row.includes("speccentral role")) {
          return { values, headerRowIndex, score: Number.MAX_SAFE_INTEGER };
        }
      }
    }
    (sheets || []).forEach(sheet => {
      const values = sheet.getDataRange().getValues();
      if (!values.length) return;
      const headerRowIndex = findHeaderRow_(values);
      const row = values[headerRowIndex].map(value => normaliseHeading_(value));
      const score = scoreHeaderRow_(row);
      if (score > best.score) best = { values, headerRowIndex, score };
    });
    return best;
  }

  function scoreHeaderRow_(row) {
    const headings = ["speccentral email", "email", "email address", "name", "staff name", "speccentral role", "role", "team", "position"];
    const matches = (row || []).filter(value => headings.includes(value)).length;
    return matches + ((row || []).includes("speccentral email") ? 10 : 0) + ((row || []).includes("speccentral role") ? 5 : 0);
  }

  function normaliseHeading_(value) {
    return String(value || "").trim().toLowerCase();
  }

  function findHeaderIndex_(headers, aliases) {
    return EntityModelService.findHeaderIndex(headers, aliases);
  }

  function findPreferredHeaderIndex_(headers, aliases) {
    const normalise = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    const normalisedHeaders = (headers || []).map(normalise);
    for (const alias of aliases || []) {
      const index = normalisedHeaders.indexOf(normalise(alias));
      if (index >= 0) return index;
    }
    return -1;
  }

  function getCell_(row, index) {
    if (index < 0) return "";
    return stringifyStaffCell_(row[index]);
  }

  // getValues() (unlike getDisplayValues()) returns raw typed cells -- a
  // Date-typed cell would otherwise stringify to its full JS toString()
  // dump (e.g. "Wed Jan 15 2026 00:00:00 GMT+1100 ..."). Reconstructs the
  // kind of display text getDisplayValues() used to give directly, for the
  // date/time columns readEventAllocations_ reads. Sheets represents a
  // time-only cell as a Date on its epoch (30 Dec 1899); that's the
  // heuristic used to tell "time" apart from "date"/"datetime" below.
  function stringifyStaffCell_(value) {
    if (value === null || value === undefined || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      const timeZone = Session.getScriptTimeZone();
      const isEpochDate = value.getFullYear() === 1899;
      const hasTimeComponent = value.getHours() || value.getMinutes() || value.getSeconds();
      if (isEpochDate) return hasTimeComponent ? Utilities.formatDate(value, timeZone, "h:mm a") : "";
      return Utilities.formatDate(value, timeZone, hasTimeComponent ? "d/MM/yyyy h:mm a" : "d/MM/yyyy");
    }
    return String(value).trim();
  }

  function splitList_(value) { return String(value || "").split(/[,;\n]+/).map(item => item.trim()).filter(Boolean); }

  return {
    getCurrent,
    getCurrentUser,
    getPermissions,
    getAll,
    getVisibleModules,
    getIdentityConflicts,
    refresh
  };
})();
