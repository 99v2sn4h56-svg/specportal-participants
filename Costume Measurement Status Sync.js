/**
 * Syncs each school's costume-measurement fill status into the existing
 * "Costume Measurements" column on GROUPS(YES). Distinguishes a row with
 * just a student name typed in from one with every measurement field
 * actually filled in -- a full row of names alone is NOT "Complete".
 *
 * Read-only against the costume workbooks -- this never writes to a
 * school's measurement tab, it only reads fill state and writes a status
 * label back into GROUPS(YES). Reuses the same COSTUME_CONFIG /
 * tab-naming / row-structure logic as "Update Measurement Sheets.js", so
 * a row here matches the exact same workbook + tab that tool would
 * generate or update for it.
 */
// Table layout on every school tab -- must match formatSchoolSheet /
// growMeasurementTable_ in "Update Measurement Sheets.js": column A is the
// student name, B is Gender, and C through O are the actual measurement
// fields (girth, bust, waist, sizes, etc.).
const MEASUREMENT_NAME_COL = 1;
const MEASUREMENT_FIRST_DATA_COL = 3;
const MEASUREMENT_LAST_COL = 15;

function syncCostumeMeasurementStatus() {
  const ui = SpreadsheetApp.getUi();
  const sourceSS = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = sourceSS.getSheetByName(COSTUME_CONFIG.sourceSheetName);

  if (!sourceSheet) {
    ui.alert(`Could not find sheet: ${COSTUME_CONFIG.sourceSheetName}`);
    return;
  }

  const values = sourceSheet.getDataRange().getValues();
  const headers = values[0];
  const gCol = name => headers.indexOf(name);
  const gStatusCol = gCol('Costume Measurements');

  if (gStatusCol < 0) {
    ui.alert('Could not find the expected "Costume Measurements" column on GROUPS(YES).');
    return;
  }

  const allowedItemsNormalised = COSTUME_CONFIG.allowedItems.map(normaliseText);
  const folder = DriveApp.getFolderById(COSTUME_CONFIG.outputFolderId);
  const workbookCache = {}; // fileName -> Spreadsheet or null (not found yet)

  let updatedCount = 0, notGeneratedCount = 0, manualNoteSkippedCount = 0, skippedRowCount = 0;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    const currentStatus = String(row[gStatusCol] || '').trim();
    const looksSyncManaged =
      !currentStatus ||
      /^(not started|names entered|in progress|complete)\b/i.test(currentStatus) ||
      /^sheet not generated/i.test(currentStatus) ||
      /^could not read/i.test(currentStatus);

    if (!looksSyncManaged) {
      // Staff left a manual note in this cell -- never overwrite it.
      manualNoteSkippedCount++;
      continue;
    }

    const allocatedPrimary = row[COSTUME_CONFIG.allocatedPrimaryCol - 1];
    const allocatedFallback = row[COSTUME_CONFIG.allocatedFallbackCol - 1];
    const allocated = Number(
      allocatedPrimary !== '' && allocatedPrimary !== null ? allocatedPrimary : allocatedFallback
    );

    const school = String(row[COSTUME_CONFIG.schoolCol - 1] || '').trim();
    const item = String(row[COSTUME_CONFIG.itemCol - 1] || '').trim();
    const groupName = String(row[COSTUME_CONFIG.groupNameCol - 1] || '').trim();

    if (!item || !school || !allocated) { skippedRowCount++; continue; }
    if (!allowedItemsNormalised.includes(normaliseText(item))) { skippedRowCount++; continue; }

    const matchedItem = getAllowedItemName(item);
    const tabName = groupName ? `${school} (${groupName})` : school;
    const fileName = `${cleanFileName(matchedItem)} - Costume Measurement Sheet`;

    if (!(fileName in workbookCache)) {
      const files = folder.getFilesByName(fileName);
      workbookCache[fileName] = files.hasNext() ? SpreadsheetApp.openById(files.next().getId()) : null;
    }
    const workbook = workbookCache[fileName];

    if (!workbook) {
      sourceSheet.getRange(r + 1, gStatusCol + 1).setValue('Sheet not generated yet');
      notGeneratedCount++;
      continue;
    }

    const sheet = workbook.getSheetByName(safeSheetName(tabName));
    if (!sheet) {
      sourceSheet.getRange(r + 1, gStatusCol + 1).setValue('Sheet not generated yet');
      notGeneratedCount++;
      continue;
    }

    const tabUrl = `https://docs.google.com/spreadsheets/d/${workbook.getId()}/edit#gid=${sheet.getSheetId()}`;
    const cell = sourceSheet.getRange(r + 1, gStatusCol + 1);

    const existingAllocated = findExistingAllocatedCount_(sheet);
    if (existingAllocated === null) {
      setCostumeStatusCell_(cell, 'Could not read sheet structure', tabUrl);
      notGeneratedCount++;
      continue;
    }

    const tableRows = sheet.getRange(6, 1, existingAllocated, MEASUREMENT_LAST_COL).getValues();
    let namesFilled = 0;
    let fullyMeasuredCount = 0;

    tableRows.forEach(rowValues => {
      const name = String(rowValues[MEASUREMENT_NAME_COL - 1] || '').trim();
      if (!name) return;
      namesFilled++;

      const measurementCells = rowValues.slice(MEASUREMENT_FIRST_DATA_COL - 1, MEASUREMENT_LAST_COL);
      const allMeasured = measurementCells.every(v => String(v || '').trim() !== '');
      if (allMeasured) fullyMeasuredCount++;
    });

    setCostumeStatusCell_(cell, buildCostumeStatusLabel_(namesFilled, fullyMeasuredCount, existingAllocated), tabUrl);
    updatedCount++;
  }

  ui.alert(
    'Costume Measurement Status Sync complete',
    `Rows updated with a fill status: ${updatedCount}\n` +
    `Rows where the sheet/tab hasn't been generated yet: ${notGeneratedCount}\n` +
    `Left untouched (manual note already in Costume Measurements): ${manualNoteSkippedCount}\n` +
    `Rows skipped (no item/school/allocated count, or item not in the allowed list): ${skippedRowCount}\n\n` +
    `This only ever writes a status into the "Costume Measurements" column -- it never touches the ` +
    `costume workbooks themselves, and never overwrites a manual note already left in that column.`,
    ui.ButtonSet.OK
  );
}

function buildCostumeStatusLabel_(namesFilled, fullyMeasuredCount, allocated) {
  if (namesFilled === 0) return `Not started (0/${allocated})`;
  if (fullyMeasuredCount === 0) return `Names entered, no measurements (${namesFilled}/${allocated})`;
  if (fullyMeasuredCount < allocated) return `In progress (${fullyMeasuredCount}/${allocated} fully measured)`;
  return `Complete (${allocated}/${allocated})`;
}

function setCostumeStatusCell_(cell, label, url) {
  if (url) {
    cell.setFormula(`=HYPERLINK("${url}","${label.replace(/"/g, '""')}")`);
  } else {
    cell.setValue(label);
  }
}
