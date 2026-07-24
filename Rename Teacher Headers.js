/**
 * ONE-TIME migration -- renames the GROUPS(YES) contact-teacher header
 * cells to a single consistent "(1)"/"(2)" scheme, extending the
 * convention already used by the imported "Teacher before/Alumni/Alumni
 * experience" fields to the original "Contact teacher's.../Second contact
 * teacher's..." identity fields too, and fixing the existing
 * inconsistent spacing/casing in "Teacher before(2)" and
 * "Alumni Experience (2)".
 *
 * This only renames header text -- no data cells are touched, and every
 * dependent script (T-Shirt Order Sync.js, ParticipantService.js,
 * By School Data.js) has already been updated to look for the new
 * names. Run once, then remove this file.
 */
function renameTeacherContactHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("GROUPS(YES)");
  const ui = SpreadsheetApp.getUi();

  if (!sheet) {
    ui.alert('Could not find sheet: GROUPS(YES)');
    return;
  }

  const renames = [
    ["Contact teacher's first name", "Contact teacher first name (1)"],
    ["Contact teacher's surname", "Contact teacher surname (1)"],
    ["Contact teacher's email", "Contact teacher email (1)"],
    ["Contact teacher's role at the school", "Contact teacher role (1)"],
    ["Contact teacher's mobile number", "Contact teacher mobile (1)"],
    ["Second contact teacher's first name", "Contact teacher first name (2)"],
    ["Second contact teacher's surname", "Contact teacher surname (2)"],
    ["Second contact teacher's email", "Contact teacher email (2)"],
    ["Second contact teacher's role at the school", "Contact teacher role (2)"],
    ["Second contact teacher's mobile number", "Contact teacher mobile (2)"],
    ["Teacher before (1)", "Teacher before (1)"],
    ["Alumni (1)", "Alumni (1)"],
    ["Alumni experience (1)", "Alumni experience (1)"],
    ["Teacher before(2)", "Teacher before (2)"],
    ["Alumni (2)", "Alumni (2)"],
    ["Alumni Experience (2)", "Alumni experience (2)"]
  ];

  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  const headers = headerRange.getValues()[0];

  const renamed = [];
  const notFound = [];

  renames.forEach(([oldName, newName]) => {
    const index = headers.indexOf(oldName);
    if (index < 0) {
      notFound.push(oldName);
      return;
    }
    if (oldName !== newName) {
      sheet.getRange(1, index + 1).setValue(newName);
      renamed.push(`"${oldName}" -> "${newName}"`);
    }
  });

  const message =
    `Renamed ${renamed.length} header(s):\n${renamed.join("\n")}\n\n` +
    (notFound.length
      ? `Could not find ${notFound.length} expected header(s) (already renamed, or text doesn't match exactly):\n${notFound.join("\n")}`
      : "All expected headers were found.");

  Logger.log(message);
  ui.alert("Teacher Header Rename", message, ui.ButtonSet.OK);
}
