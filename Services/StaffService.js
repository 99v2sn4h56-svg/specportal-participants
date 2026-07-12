const StaffService = (() => {
  const STAFF_SPREADSHEET_ID = "1PBO2aN4EBpo2TmEPrVwvagNrCdC2BbmIm1ZmLLG3wSE";
  let staffCache_ = null;

  function getCurrent() {
    return UserContextService.getCurrent();
  }

  function getCurrentUser() {
    return UserContextService.getCurrent();
  }

  function getAll() {
    if (staffCache_) return staffCache_;

    try {
      const source = findStaffSource_(SpreadsheetApp.openById(STAFF_SPREADSHEET_ID).getSheets());
      const values = source.values;
      if (!values.length) return [];

      const headerRowIndex = source.headerRowIndex;
      const headers = values[headerRowIndex].map(value => String(value || "").trim());
      const indexes = {
        name: findHeaderIndex_(headers, ["name", "staff name", "full name", "preferred name"]),
        firstName: findHeaderIndex_(headers, ["first name", "given name"]),
        lastName: findHeaderIndex_(headers, ["last name", "surname", "family name"]),
        email: findHeaderIndex_(headers, ["speccentral email", "email", "email address", "det email", "work email"]),
        primaryEmail: findHeaderIndex_(headers, ["speccentral email", "primary det email", "primary email", "det email", "work email", "email", "email address"]),
        secondaryEmail: findHeaderIndex_(headers, ["secondary email", "alternate email", "alternative email", "email 2"]),
        personalEmail: findHeaderIndex_(headers, ["personal email", "private email"]),
        aliasEmails: findHeaderIndex_(headers, ["alias email", "alias emails", "email aliases", "aliases"]),
        legacyEmails: findHeaderIndex_(headers, ["legacy email", "legacy emails", "previous email", "old email"]),
        staffId: findHeaderIndex_(headers, ["staff id", "employee id", "personnel id", "det user id"]),
        role: findHeaderIndex_(headers, ["speccentral role", "role", "position", "production role", "team role"]),
        team: findHeaderIndex_(headers, ["team", "department", "area"]),
        department: findHeaderIndex_(headers, ["department", "team", "area"]),
        departments: findHeaderIndex_(headers, ["departments", "production areas", "areas"]),
        school: findHeaderIndex_(headers, ["school", "home school", "base school"]),
        assignedItems: findHeaderIndex_(headers, ["assigned items", "items", "allocated items"]),
        assignedGroups: findHeaderIndex_(headers, ["assigned groups", "groups", "allocated groups"]),
        mobile: findHeaderIndex_(headers, ["mobile", "phone", "contact number"]),
        access: findHeaderIndex_(headers, ["access", "modules", "permissions"]),
        permissions: findHeaderIndex_(headers, ["permissions", "permission", "access"]),
        allocatedEvents: findHeaderIndex_(headers, ["allocated events", "events", "event allocation", "allocated rehearsals"]),
        photo: findHeaderIndex_(headers, ["photo", "photo url", "headshot", "profile photo"]),
        status: findHeaderIndex_(headers, ["status", "active", "active?"]),
        scopeType: findHeaderIndex_(headers, ["scope type", "scope"]),
        scopeValues: findHeaderIndex_(headers, ["scope values", "scope value", "scope items"])
      };

      staffCache_ = values.slice(headerRowIndex + 1)
        .map(row => mapStaffRow_(row, indexes))
        .filter(record => record.email || record.name || record.role);
      return staffCache_;
    } catch (err) {
      Logger.log("StaffService.getAll failed: " + (err && err.message ? err.message : err));
      return [];
    }
  }

  function refresh() { staffCache_ = null; return getAll(); }

  function mapStaffRow_(row, indexes) {
    const firstName = getCell_(row, indexes.firstName);
    const lastName = getCell_(row, indexes.lastName);
    const explicitName = getCell_(row, indexes.name);
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
    return EntityModelService.staff({
      staffId: getCell_(row, indexes.staffId),
      name,
      displayName: name,
      firstName,
      lastName,
      email: primaryEmail,
      primaryEmail,
      secondaryEmail: getCell_(row, indexes.secondaryEmail),
      personalEmail: getCell_(row, indexes.personalEmail),
      aliasEmails: splitList_(getCell_(row, indexes.aliasEmails)),
      legacyEmails: splitList_(getCell_(row, indexes.legacyEmails)),
      role: getCell_(row, indexes.role),
      team: getCell_(row, indexes.team),
      department: getCell_(row, indexes.department) || getCell_(row, indexes.team),
      departments: splitList_(getCell_(row, indexes.departments) || getCell_(row, indexes.department) || getCell_(row, indexes.team)),
      school: getCell_(row, indexes.school),
      assignedItems: splitList_(getCell_(row, indexes.assignedItems)),
      assignedGroups: splitList_(getCell_(row, indexes.assignedGroups)),
      assignedEvents: allocatedEvents,
      mobile: getCell_(row, indexes.mobile),
      access,
      permissions,
      allocatedEvents,
      photo: getCell_(row, indexes.photo),
      status: getCell_(row, indexes.status) || "Active",
      scope: {
        type: getCell_(row, indexes.scopeType) || "production",
        values: String(getCell_(row, indexes.scopeValues) || "").split(/[,;\n]+/).map(value => value.trim()).filter(Boolean)
      },
      source: "Staff Production Team spreadsheet"
    });
  }

  function getPermissions(email, staffRecord) {
    const staff = staffRecord || {};
    const raw = []
      .concat(staff.permissions || [])
      .concat(staff.access || []);

    const permissions = raw
      .map(toPermission_)
      .filter(Boolean);

    const expandedPermissions = expandPermissions_(permissions);

    return Array.from(new Set([
      "dashboard.view",
      "participants.view",
      "calendar.view",
      "rehearsals.view",
      "attendance.view",
      ...expandedPermissions
    ])).sort();
  }

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
    (sheets || []).forEach(sheet => {
      const values = sheet.getDataRange().getValues();
      if (!values.length) return;
      const headerRowIndex = findHeaderRow_(values);
      const row = values[headerRowIndex].map(value => String(value || "").trim().toLowerCase());
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

  function findHeaderIndex_(headers, aliases) {
    return EntityModelService.findHeaderIndex(headers, aliases);
  }

  function getCell_(row, index) {
    if (index < 0) return "";
    return String(row[index] || "").trim();
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
