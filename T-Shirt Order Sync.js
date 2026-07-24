/**
 * Pulls completion status from the separate T-shirt order Google Form into
 * the existing "T-SHIRT" column on GROUPS(YES), instead of building any new
 * tracking column. Also checks the quantity of shirts ordered (summed
 * across the form's per-size grid) against the group's accepted student
 * count, and writes that check into the same T-SHIRT cell.
 *
 * Never writes anything but a sync-generated status into T-SHIRT, and never
 * touches any other column. Any T-SHIRT cell that already holds a manual,
 * non-sync note (i.e. doesn't start with "Order submitted" and isn't blank
 * or "No order yet") is left completely alone.
 */
const TSHIRT_CONFIG = {
  formSpreadsheetId: '1yAW21rWMu1nWRVuFjo3YFqNryjAYzjX8qmL1vIawXXM',
  formSheetName: 'Form Responses 1',
  formSchoolCategoryCol: 'School/Category selection',
  formConfirmedCategoryCol: 'Please confirm the category you are completing the order for',
  formTeacherEmailCol: 'Contact teacher email address',
  // Per-size quantity grid -- Google Forms flattens a grid question into one
  // column per size. "Teacher shirt #1/#2" are the teacher's own two shirts
  // (a size, not a quantity) and are deliberately excluded from the sum.
  formSizeQtyCols: [
    'Youth 8',
    'Youth 10',
    'Youth 12 / XXS',
    'Youth 14 / XS',
    'Small',
    'Medium',
    'Large',
    'X-Large',
    'XX-Large',
    'XXX-Large',
    '5X-Large'
  ],

  groupsSheetName: 'GROUPS(YES)',
  tshirtStatusCol: 'T-SHIRT',
  groupsSchoolCol: 'School name',
  groupsShirtCategoryCol: 'Shirt Category',
  groupsItemCol: 'Item',
  groupsCategoryCol: 'Category',
  groupsTeacherEmailCol: "Contact teacher email (1)",
  // GROUPS(YES) has two columns literally named "Accepted?" -- the first
  // one (column A) is the numeric accepted-student headcount we want.
  // headers.indexOf() always resolves to that first occurrence.
  groupsAcceptedCol: 'Accepted?',
  groupsAcceptedFallbackCol: '# Alloc',

  orderedLabel: 'Order submitted',
  notYetLabel: 'No order yet'
};

function syncTshirtOrderStatus() {
  const ui = SpreadsheetApp.getUi();
  const groupsSS = SpreadsheetApp.getActiveSpreadsheet();
  const groupsSheet = groupsSS.getSheetByName(TSHIRT_CONFIG.groupsSheetName);

  if (!groupsSheet) {
    ui.alert(`Could not find sheet: ${TSHIRT_CONFIG.groupsSheetName}`);
    return;
  }

  const formSS = SpreadsheetApp.openById(TSHIRT_CONFIG.formSpreadsheetId);
  const formSheet = formSS.getSheetByName(TSHIRT_CONFIG.formSheetName);

  if (!formSheet) {
    ui.alert(`Could not find sheet: ${TSHIRT_CONFIG.formSheetName} in the T-shirt order form.`);
    return;
  }

  const submissions = readTshirtSubmissions_(formSheet);

  if (!submissions.length) {
    ui.alert('No T-shirt order submissions were found to sync.');
    return;
  }

  const groupsValues = groupsSheet.getDataRange().getValues();
  const groupsHeaders = groupsValues[0];
  const gCol = name => groupsHeaders.indexOf(name);

  const gTshirtCol = gCol(TSHIRT_CONFIG.tshirtStatusCol);
  const gSchoolCol = gCol(TSHIRT_CONFIG.groupsSchoolCol);
  const gShirtCategoryCol = gCol(TSHIRT_CONFIG.groupsShirtCategoryCol);
  const gItemCol = gCol(TSHIRT_CONFIG.groupsItemCol);
  const gCategoryCol = gCol(TSHIRT_CONFIG.groupsCategoryCol);
  const gTeacherEmailCol = gCol(TSHIRT_CONFIG.groupsTeacherEmailCol);
  const gAcceptedCol = gCol(TSHIRT_CONFIG.groupsAcceptedCol);
  const gAcceptedFallbackCol = gCol(TSHIRT_CONFIG.groupsAcceptedFallbackCol);

  if (gTshirtCol < 0 || gSchoolCol < 0) {
    ui.alert(`Could not find the expected "${TSHIRT_CONFIG.tshirtStatusCol}" or "${TSHIRT_CONFIG.groupsSchoolCol}" columns on ${TSHIRT_CONFIG.groupsSheetName}.`);
    return;
  }

  const usedSubmissionIndexes = new Set();
  let matchedCount = 0, qtyMismatchCount = 0, manualNoteSkippedCount = 0;

  for (let r = 1; r < groupsValues.length; r++) {
    const row = groupsValues[r];
    const currentStatus = String(row[gTshirtCol] || '').trim();

    const looksSyncManaged =
      !currentStatus ||
      currentStatus === TSHIRT_CONFIG.notYetLabel ||
      /^order submitted/i.test(currentStatus);

    if (!looksSyncManaged) {
      // Staff left a manual note in this cell -- never overwrite it.
      manualNoteSkippedCount++;
      continue;
    }

    const school = normaliseTshirtText_(row[gSchoolCol]);
    const shirtCategoryRaw = normaliseTshirtText_(gShirtCategoryCol >= 0 ? row[gShirtCategoryCol] : '');
    const shirtCategoryNoCount = stripTshirtStudentCount_(shirtCategoryRaw);
    const item = normaliseTshirtText_(gItemCol >= 0 ? row[gItemCol] : '');
    const category = normaliseTshirtText_(gCategoryCol >= 0 ? row[gCategoryCol] : '');
    const teacherEmail = String(gTeacherEmailCol >= 0 ? row[gTeacherEmailCol] : '').trim().toLowerCase();

    if (!school) continue;

    const matchIndex = submissions.findIndex((s, i) => {
      if (usedSubmissionIndexes.has(i)) return false;
      if (s.school !== school) return false;
      // "Shirt Category" on GROUPS(YES) holds the exact same composite
      // text as the form's raw "School/Category selection" dropdown value
      // (e.g. "Cranebrook High School - Secondary Combined Dance (7
      // students)"), not a simplified bucket -- so compare the raw
      // selection first, verbatim.
      if (shirtCategoryRaw && s.rawNormalised && s.rawNormalised === shirtCategoryRaw) return true;
      // The allocated student count can drift after the form's dropdown
      // options were created, so also try matching with the "(N students)"
      // suffix stripped from both sides.
      if (shirtCategoryNoCount && s.rawNoCount && s.rawNoCount === shirtCategoryNoCount) return true;
      if (s.confirmedCategory && (s.confirmedCategory === item || s.confirmedCategory === category)) return true;
      // No usable category text on the submission -- fall back to teacher
      // email as the only other reliable signal available.
      if (!s.confirmedCategory && teacherEmail && s.teacherEmail === teacherEmail) return true;
      return false;
    });

    if (matchIndex >= 0) {
      usedSubmissionIndexes.add(matchIndex);
      const submission = submissions[matchIndex];
      const accepted = readTshirtAcceptedCount_(row, gAcceptedCol, gAcceptedFallbackCol);
      const label = buildTshirtStatusLabel_(submission.totalShirtsOrdered, accepted);

      groupsSheet.getRange(r + 1, gTshirtCol + 1).setValue(label);
      matchedCount++;
      if (accepted != null && submission.totalShirtsOrdered !== accepted) qtyMismatchCount++;
    }
  }

  const unmatched = submissions.filter((s, i) => !usedSubmissionIndexes.has(i));
  writeTshirtSyncReport_(groupsSS, unmatched);

  ui.alert(
    'T-Shirt Order Sync complete',
    `Form submissions found: ${submissions.length}\n` +
    `Matched to a group and marked: ${matchedCount}\n` +
    `  ...of which have a shirt qty vs accepted-count mismatch: ${qtyMismatchCount}\n` +
    `Left untouched (manual note already in T-SHIRT): ${manualNoteSkippedCount}\n` +
    `Could not match to a group: ${unmatched.length}\n\n` +
    `Unmatched submissions were written to the "T-Shirt Order Sync Report" sheet for manual review.\n\n` +
    `This only ever writes a sync-generated status into the T-SHIRT column for a matched row -- ` +
    `it never overwrites a manual note already left there, and never touches any other column.`,
    ui.ButtonSet.OK
  );
}

function buildTshirtStatusLabel_(totalOrdered, accepted) {
  if (accepted == null) {
    return `${TSHIRT_CONFIG.orderedLabel} (${totalOrdered} shirts ordered -- accepted count unknown)`;
  }
  if (totalOrdered === accepted) {
    return `${TSHIRT_CONFIG.orderedLabel} (${totalOrdered}/${accepted} shirts)`;
  }
  return `${TSHIRT_CONFIG.orderedLabel} -- QTY MISMATCH (ordered ${totalOrdered}, accepted ${accepted})`;
}

function readTshirtAcceptedCount_(groupsRow, gAcceptedCol, gAcceptedFallbackCol) {
  const primary = gAcceptedCol >= 0 ? Number(groupsRow[gAcceptedCol]) : NaN;
  if (Number.isFinite(primary) && primary > 0) return primary;
  const fallback = gAcceptedFallbackCol >= 0 ? Number(groupsRow[gAcceptedFallbackCol]) : NaN;
  return (Number.isFinite(fallback) && fallback > 0) ? fallback : null;
}

function readTshirtSubmissions_(formSheet) {
  const values = formSheet.getDataRange().getValues();
  const headers = values[0];
  const col = name => headers.indexOf(name);

  const schoolCategoryCol = col(TSHIRT_CONFIG.formSchoolCategoryCol);
  const confirmedCategoryCol = col(TSHIRT_CONFIG.formConfirmedCategoryCol);
  const teacherEmailCol = col(TSHIRT_CONFIG.formTeacherEmailCol);
  const sizeQtyCols = TSHIRT_CONFIG.formSizeQtyCols.map(col).filter(i => i >= 0);

  return values.slice(1).map(row => {
    // "School/Category selection" looks like:
    // "Northlakes High School - Aboriginal Dance Ensemble (8 students)"
    const raw = String((schoolCategoryCol >= 0 && row[schoolCategoryCol]) || '');
    const school = normaliseTshirtText_(raw.split(' - ')[0]);
    const rawNormalised = normaliseTshirtText_(raw);
    const rawNoCount = stripTshirtStudentCount_(rawNormalised);
    const confirmedCategory = normaliseTshirtText_(confirmedCategoryCol >= 0 ? row[confirmedCategoryCol] : '');
    const teacherEmail = String(teacherEmailCol >= 0 ? row[teacherEmailCol] : '').trim().toLowerCase();
    const totalShirtsOrdered = sizeQtyCols.reduce((sum, i) => {
      const n = Number(row[i]);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    return { school, confirmedCategory, teacherEmail, raw, rawNormalised, rawNoCount, totalShirtsOrdered };
  }).filter(s => s.school);
}

function writeTshirtSyncReport_(spreadsheet, unmatched) {
  let sheet = spreadsheet.getSheetByName('T-Shirt Order Sync Report');
  if (!sheet) sheet = spreadsheet.insertSheet('T-Shirt Order Sync Report');
  sheet.clear();

  const rows = [['Submitted School', 'Confirmed Category', 'Teacher Email', 'Shirts Ordered', 'Raw Form Selection', 'Issue']];
  unmatched.forEach(s => rows.push([
    s.school, s.confirmedCategory, s.teacherEmail, s.totalShirtsOrdered, s.raw,
    'No matching GROUPS(YES) row found for this school + category/item combination'
  ]));

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, rows[0].length)
    .setFontWeight('bold')
    .setBackground('#1256cf')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, rows[0].length);
}

function normaliseTshirtText_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripTshirtStudentCount_(normalisedValue) {
  return String(normalisedValue || '').replace(/\(\s*\d+\s*students?\s*\)\s*$/i, '').trim();
}
