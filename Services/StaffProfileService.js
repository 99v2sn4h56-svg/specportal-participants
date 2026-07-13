/**
 * Self-service Staff profile adapter.
 *
 * Users may update presentation and contact fields on their own row in the
 * dedicated SpecCentral Staff sheet. Identity, role, department, permissions,
 * scopes and access fields are deliberately outside this write contract.
 */
const StaffProfileService = (() => {
  const EDITABLE = {
    displayName: "Display Name",
    photo: "Display Picture",
    mobile: "Mobile Phone",
    school: "Associated School",
    typeOfWork: "Type of Work"
  };

  function getMyProfile() {
    requireUser_();
    return profile_(UserContextService.refresh());
  }

  function updateMyProfile(request) {
    const user = requireUser_();
    const input = normalise_(request);
    validate_(input);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error("Staff profiles are busy. Please try again.");
    try {
      const source = openSource_();
      ensureHeadings_(source);
      const indexes = indexes_(source.headers);
      const rowNumber = findOwnRow_(source, indexes.email, user.email);
      const before = readEditable_(source.sheet, rowNumber, indexes);
      Object.keys(EDITABLE).forEach(field => {
        const next = field === "photo" && !input.photo ? before.photo : input[field];
        source.sheet.getRange(rowNumber, indexes[field] + 1).setValue(cellText_(next));
      });
      SpreadsheetApp.flush();
      StaffService.refresh();
      const refreshed = UserContextService.refresh();
      const changedFields = Object.keys(EDITABLE).filter(field => field !== "photo" || input.photo).filter(field => String(before[field] || "") !== String(input[field] || ""));
      AuditService.record("StaffSelfProfileUpdated", { type: "StaffMember", id: refreshed.staffId || refreshed.email }, { changedFields });
      return { ok: true, generatedAt: new Date().toISOString(), data: profile_(refreshed) };
    } finally {
      lock.releaseLock();
    }
  }

  function requireUser_() {
    const user = UserContextService.getCurrent();
    if (!user.email || !user.isMatched) throw new Error("A matched Staff profile is required.");
    return user;
  }

  function profile_(user) {
    return {
      email: user.email || "",
      staffId: user.staffId || "",
      displayName: user.displayName || "",
      firstName: user.firstName || "",
      surname: user.surname || "",
      photo: "",
      photoConfigured: !!user.photo,
      mobile: user.mobile || "",
      school: user.school || "",
      typeOfWork: user.typeOfWork || "",
      role: user.role || "",
      department: user.department || "",
      permissionLevel: user.permissionLevel || ""
    };
  }

  function openSource_() {
    const config = SourceRegistryService.getSourceConfig("staff");
    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = spreadsheet.getSheetByName(config.sheetName) || spreadsheet.getSheetByName("SecCentral");
    if (!sheet) throw new Error("The dedicated SpecCentral Staff sheet was not found.");
    const values = sheet.getDataRange().getDisplayValues();
    const headerRowIndex = findHeaderRow_(values);
    return { sheet, values, headerRowIndex, headerRow: headerRowIndex + 1, headers: (values[headerRowIndex] || []).map(value => String(value || "").trim()) };
  }

  function findHeaderRow_(values) {
    const max = Math.min((values || []).length, 20);
    for (let index = 0; index < max; index++) {
      if (findIndex_(values[index] || [], ["SpecCentral Email"]) >= 0) return index;
    }
    throw new Error("SpecCentral Email heading was not found.");
  }

  function ensureHeadings_(source) {
    Object.keys(EDITABLE).forEach(field => {
      if (findIndex_(source.headers, [EDITABLE[field]]) >= 0) return;
      const column = source.headers.length + 1;
      source.sheet.getRange(source.headerRow, column).setValue(EDITABLE[field]);
      source.headers.push(EDITABLE[field]);
    });
  }

  function indexes_(headers) {
    const result = { email: findIndex_(headers, ["SpecCentral Email"]) };
    Object.keys(EDITABLE).forEach(field => { result[field] = findIndex_(headers, [EDITABLE[field]]); });
    return result;
  }

  function findOwnRow_(source, emailIndex, email) {
    if (emailIndex < 0) throw new Error("SpecCentral Email heading was not found.");
    const target = normaliseEmail_(email);
    const matches = [];
    source.values.slice(source.headerRowIndex + 1).forEach((row, offset) => {
      if (normaliseEmail_(row[emailIndex]) === target) matches.push(source.headerRow + offset + 1);
    });
    if (matches.length !== 1) throw new Error(matches.length ? "Multiple Staff profile rows match this account." : "Your Staff profile row could not be found.");
    return matches[0];
  }

  function readEditable_(sheet, rowNumber, indexes) {
    const result = {};
    Object.keys(EDITABLE).forEach(field => { result[field] = String(sheet.getRange(rowNumber, indexes[field] + 1).getDisplayValue() || ""); });
    return result;
  }

  function normalise_(request) {
    const value = request || {};
    return {
      displayName: clean_(value.displayName),
      photo: clean_(value.photo),
      mobile: clean_(value.mobile),
      school: clean_(value.school),
      typeOfWork: clean_(value.typeOfWork)
    };
  }

  function validate_(input) {
    if (input.displayName.length > 100) throw new Error("Display name is too long.");
    if (input.photo.length > 500 || (input.photo && !/^https:\/\//i.test(input.photo))) throw new Error("Display picture must be a secure HTTPS or Google Drive URL.");
    if (input.mobile.length > 40 || input.school.length > 160 || input.typeOfWork.length > 120) throw new Error("One or more profile values are too long.");
  }

  function findIndex_(headers, aliases) {
    const values = (headers || []).map(normaliseHeading_);
    for (const alias of aliases || []) {
      const index = values.indexOf(normaliseHeading_(alias));
      if (index >= 0) return index;
    }
    return -1;
  }

  function clean_(value) { return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim(); }
  function cellText_(value) { const text = String(value || ""); return /^[=+@]/.test(text) || /^-\D/.test(text) ? "'" + text : text; }
  function normaliseHeading_(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
  function normaliseEmail_(value) { return String(value || "").trim().toLowerCase(); }

  return { getMyProfile, updateMyProfile };
})();
