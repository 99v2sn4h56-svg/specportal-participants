/**
 * Administrative Staff access adapter.
 *
 * This is the only website write path for Staff access. It changes the
 * canonical SpecCentral Role cell on the dedicated Staff access sheet; raw
 * capabilities remain derived by AuthorizationService and cannot be edited.
 */
const StaffAccessService = (() => {
  function updateRole(request) {
    const actor = UserContextService.requireCapability("Permissions.Manage");
    const input = normalise_(request);
    const roles = ["No Access"].concat(Object.keys(AuthorizationService.getModel().roles));
    const role = roles.find(value => value.toLowerCase() === input.role.toLowerCase());
    if (!input.email) throw new Error("A Staff email is required.");
    if (!role) throw new Error("The selected SpecCentral role is not recognised.");
    if (input.email === String(actor.email || "").toLowerCase()) throw new Error("Your own System Administrator role cannot be changed here.");

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error("Staff access is busy. Please try again.");
    try {
      const source = openSource_();
      const emailIndex = findIndex_(source.headers, ["SpecCentral Email"]);
      const roleIndex = findIndex_(source.headers, ["SpecCentral Role"]);
      if (emailIndex < 0 || roleIndex < 0) throw new Error("SpecCentral Email and SpecCentral Role headings are required.");
      const matches = [];
      source.values.slice(source.headerRowIndex + 1).forEach((row, offset) => {
        if (String(row[emailIndex] || "").trim().toLowerCase() === input.email) matches.push(source.headerRow + offset + 1);
      });
      if (matches.length !== 1) throw new Error(matches.length ? "Multiple Staff access rows match this email." : "The Staff access row could not be found.");
      const rowNumber = matches[0];
      const before = String(source.sheet.getRange(rowNumber, roleIndex + 1).getDisplayValue() || "No Access");
      if (/^system administrator$/i.test(before)) throw new Error("System Administrator access cannot be restricted.");
      source.sheet.getRange(rowNumber, roleIndex + 1).setValue(role);
      SpreadsheetApp.flush();
      StaffService.refresh();
      AuditService.record("StaffAccessRoleUpdated", { type: "StaffMember", id: input.email }, { before, after: role, actor: actor.email });
      return { ok: true, generatedAt: new Date().toISOString(), email: input.email, role };
    } finally {
      lock.releaseLock();
    }
  }

  function openSource_() {
    const config = SourceRegistryService.getSourceConfig("staff");
    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = spreadsheet.getSheetByName("SpecCentral") || spreadsheet.getSheetByName("SecCentral");
    if (!sheet) throw new Error("The SpecCentral Staff access sheet was not found.");
    const values = sheet.getDataRange().getDisplayValues();
    const headerRowIndex = values.findIndex(row => findIndex_(row, ["SpecCentral Email"]) >= 0);
    if (headerRowIndex < 0) throw new Error("The Staff access heading row was not found.");
    return { sheet, values, headerRowIndex, headerRow: headerRowIndex + 1, headers: values[headerRowIndex] };
  }

  function normalise_(request) { return { email: String(request && request.email || "").trim().toLowerCase(), role: String(request && request.role || "").trim() }; }
  function findIndex_(headers, aliases) { return EntityModelService.findHeaderIndex(headers || [], aliases || []); }
  return { updateRole };
})();
