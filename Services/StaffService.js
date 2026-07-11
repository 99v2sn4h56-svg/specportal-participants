const StaffService = (() => {
  const STAFF_SPREADSHEET_ID = "1PBO2aN4EBpo2TmEPrVwvagNrCdC2BbmIm1ZmLLG3wSE";
  let staffCache_ = null;

  function getCurrent() {
    return getCurrentUser();
  }

  function getCurrentUser() {
    const email = Session.getActiveUser().getEmail();
    const staff = findByEmail_(email);

    if (staff) {
      const permissions = getPermissions(email, staff);
      return {
        ...staff,
        email: staff.email || email,
        name: staff.name || staff.displayName || getDisplayName_(email),
        displayName: staff.displayName || staff.name || getDisplayName_(email),
        role: staff.role || "Staff",
        department: staff.department || staff.team || "",
        permissions,
        access: staff.access && staff.access.length ? staff.access : getVisibleModules_(permissions),
        visibleModules: getVisibleModules_(permissions),
        allocatedEvents: getAllocatedEvents(email, staff),
        source: "Staff Production Team spreadsheet"
      };
    }

    const permissions = ["dashboard.view", "participants.view", "calendar.view", "rehearsals.view", "attendance.view"];

    return {
      email,
      name: getDisplayName_(email),
      displayName: getDisplayName_(email),
      role: "Staff",
      department: "",
      permissions,
      access: getVisibleModules_(permissions),
      visibleModules: getVisibleModules_(permissions),
      allocatedEvents: [],
      source: "Fallback until user is matched in Staff Production Team spreadsheet"
    };
  }

  function getAll() {
    if (staffCache_) return staffCache_;

    try {
      const sheet = SpreadsheetApp.openById(STAFF_SPREADSHEET_ID).getSheets()[0];
      const values = sheet.getDataRange().getValues();
      if (!values.length) return [];

      const headerRowIndex = findHeaderRow_(values);
      const headers = values[headerRowIndex].map(value => String(value || "").trim());
      const indexes = {
        name: findHeaderIndex_(headers, ["name", "staff name", "full name", "preferred name"]),
        firstName: findHeaderIndex_(headers, ["first name", "given name"]),
        lastName: findHeaderIndex_(headers, ["last name", "surname", "family name"]),
        email: findHeaderIndex_(headers, ["email", "email address", "det email", "work email"]),
        role: findHeaderIndex_(headers, ["role", "position", "production role", "team role"]),
        team: findHeaderIndex_(headers, ["team", "department", "area"]),
        department: findHeaderIndex_(headers, ["department", "team", "area"]),
        mobile: findHeaderIndex_(headers, ["mobile", "phone", "contact number"]),
        access: findHeaderIndex_(headers, ["access", "modules", "permissions"]),
        permissions: findHeaderIndex_(headers, ["permissions", "permission", "access"]),
        allocatedEvents: findHeaderIndex_(headers, ["allocated events", "events", "event allocation", "allocated rehearsals"])
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

  function findByEmail_(email) {
    const target = String(email || "").trim().toLowerCase();
    if (!target) return null;
    return getAll().find(staff => String(staff.email || "").trim().toLowerCase() === target) || null;
  }

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

    return {
      name,
      displayName: name,
      firstName,
      lastName,
      email: getCell_(row, indexes.email),
      role: getCell_(row, indexes.role),
      team: getCell_(row, indexes.team),
      department: getCell_(row, indexes.department) || getCell_(row, indexes.team),
      mobile: getCell_(row, indexes.mobile),
      access,
      permissions,
      allocatedEvents,
      source: "Staff Production Team spreadsheet"
    };
  }

  function getPermissions(email, staffRecord) {
    const staff = staffRecord || findByEmail_(email) || {};
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

  function hasPermission(email, permission) {
    const target = String(permission || "").trim();
    if (!target) return false;
    return getPermissions(email).includes(target);
  }

  function getRole(email) {
    const staff = findByEmail_(email);
    return staff ? staff.role || "Staff" : "Staff";
  }

  function getDepartment(email) {
    const staff = findByEmail_(email);
    return staff ? staff.department || staff.team || "" : "";
  }

  function getAllocatedEvents(email, staffRecord) {
    const staff = staffRecord || findByEmail_(email) || {};
    return staff.allocatedEvents || [];
  }

  function getUserDashboardContext(email) {
    const user = email
      ? { ...getCurrentUser(), email }
      : getCurrentUser();

    return {
      email: user.email,
      name: user.name || user.displayName,
      role: user.role,
      department: user.department,
      permissions: user.permissions || [],
      allocatedEvents: user.allocatedEvents || [],
      visibleModules: user.visibleModules || []
    };
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
    const maxRows = Math.min(values.length, 10);
    let bestIndex = 0;
    let bestScore = 0;

    for (let i = 0; i < maxRows; i++) {
      const row = values[i].map(value => String(value || "").trim().toLowerCase());
      const score = row.filter(value =>
        ["email", "email address", "name", "staff name", "role", "team", "position"].includes(value)
      ).length;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  function findHeaderIndex_(headers, aliases) {
    const normalisedHeaders = headers.map(normaliseHeader_);
    const normalisedAliases = aliases.map(normaliseHeader_);

    return normalisedHeaders.findIndex(header => normalisedAliases.includes(header));
  }

  function normaliseHeader_(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
  }

  function getCell_(row, index) {
    if (index < 0) return "";
    return String(row[index] || "").trim();
  }

  function getDisplayName_(email) {
    if (!email) return "Spec Central user";

    const local = String(email).split("@")[0] || "";
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || email;
  }

  return {
    getCurrent,
    getCurrentUser,
    getPermissions,
    hasPermission,
    getRole,
    getDepartment,
    getAllocatedEvents,
    getUserDashboardContext,
    getAll
  };
})();
