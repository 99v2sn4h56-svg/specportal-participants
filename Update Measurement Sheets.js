const COSTUME_CONFIG = {
  sourceSheetName: 'GROUPS(YES)',
  outputFolderId: '1zV4bTV5k_-_n6Ingq1GByJbxh-IBdgFR',

  schoolCol: 8,              // Column H
  itemCol: 15,               // Column O
  groupNameCol: 16,          // Column P
  allocatedPrimaryCol: 1,    // Column A
  allocatedFallbackCol: 7,   // Column G

  allowedItems: [
    'Alive',
    'Back in Black',
    'Better',
    'Dance Monkey',
    'Eclipse',
    'Freestyler',
    'Golden/ The Original',
    'Good Things Grow',
    'I Am Australian',
    'I Need A Dollar',
    'Joy',
    'Land Down Under',
    "Let's Do The Alien Dance",
    'Original (Smash)',
    'Talking to the Moon',
    'Underneath the Radar',
    'You Can Be An Inventor'
  ],

  colours: {
    yellow: '#fff2cc'
  }
};

function updateExistingCostumeSheets() {
  const ui = SpreadsheetApp.getUi();
  const sourceSS = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = sourceSS.getSheetByName(COSTUME_CONFIG.sourceSheetName);

  if (!sourceSheet) {
    ui.alert(`Could not find sheet: ${COSTUME_CONFIG.sourceSheetName}`);
    return;
  }

  const data = sourceSheet.getDataRange().getValues().slice(1);
  const grouped = {};
  const skippedItems = new Set();

  const allowedItemsNormalised = COSTUME_CONFIG.allowedItems.map(normaliseText);

  data.forEach(row => {
    const allocatedPrimary = row[COSTUME_CONFIG.allocatedPrimaryCol - 1];
    const allocatedFallback = row[COSTUME_CONFIG.allocatedFallbackCol - 1];

    const allocated = Number(
      allocatedPrimary !== '' && allocatedPrimary !== null
        ? allocatedPrimary
        : allocatedFallback
    );

    const school = String(row[COSTUME_CONFIG.schoolCol - 1] || '').trim();
    const item = String(row[COSTUME_CONFIG.itemCol - 1] || '').trim();
    const groupName = String(row[COSTUME_CONFIG.groupNameCol - 1] || '').trim();

    if (!item) return;

    if (!allowedItemsNormalised.includes(normaliseText(item))) {
      skippedItems.add(item);
      return;
    }

    if (!allocated || !school) return;

    const matchedItem = getAllowedItemName(item);
    const tabName = groupName ? `${school} (${groupName})` : school;

    if (!grouped[matchedItem]) grouped[matchedItem] = [];

    grouped[matchedItem].push({
      school,
      groupName,
      tabName,
      allocated
    });
  });

  Object.keys(grouped).forEach(itemName => {
    updateWorkbookForItem(itemName, grouped[itemName]);
  });

  if (skippedItems.size) {
    Logger.log('Skipped items not in allowedItems:');
    Logger.log([...skippedItems].sort().join('\n'));
  }

  ui.alert('Costume measurement workbooks updated, including new items and new schools.');
}

function updateWorkbookForItem(itemName, schools) {
  const folder = DriveApp.getFolderById(COSTUME_CONFIG.outputFolderId);
  const fileName = `${cleanFileName(itemName)} - Costume Measurement Sheet`;
  const files = folder.getFilesByName(fileName);

  if (!files.hasNext()) {
    createCostumeWorkbook(itemName, schools);
    return;
  }

  const file = files.next();
  const ss = SpreadsheetApp.openById(file.getId());

  schools.forEach(schoolObj => {
    const sheetName = safeSheetName(schoolObj.tabName);
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      // Brand new tab, guaranteed empty -- safe to build from scratch.
      sheet = ss.insertSheet(sheetName);
      formatSchoolSheet(
        sheet,
        schoolObj.school,
        schoolObj.groupName,
        itemName,
        schoolObj.allocated
      );
    } else {
      // Existing tab -- teachers may already have measurements recorded
      // here. Never clear/rebuild it; only ever grow the table.
      updateExistingSchoolSheet_(
        sheet,
        schoolObj.school,
        schoolObj.groupName,
        itemName,
        schoolObj.allocated
      );
    }
  });

  updateRemovedSchoolTabs(ss, schools);

  let home = ss.getSheetByName('Participating Schools');
  if (!home) {
    home = ss.insertSheet('Participating Schools', 0);
  }
  formatParticipatingSchools(home, itemName, schools);

  let summary = ss.getSheetByName('All Student Measurements');
  if (!summary) {
    summary = ss.insertSheet('All Student Measurements');
  }
  formatSummarySheet(summary, schools);

  ss.setActiveSheet(home);
}

/**
 * Updates an existing school costume-measurement tab without ever clearing
 * or rebuilding it -- teachers may already have measurements recorded in
 * the data rows. Only the title/instructions (static prose, never teacher
 * data) get rewritten in place, and the measurement table only ever grows
 * (never shrinks) if the allocated student count increased. If the current
 * allocated count can't be confidently read back from the sheet's own
 * structure, the table is left untouched entirely rather than risk
 * guessing at which rows are safe to change.
 */
function updateExistingSchoolSheet_(sheet, schoolName, groupName, itemName, allocated) {
  const c = CONFIG.colours;
  const title = groupName
    ? `${schoolName} (${groupName}) - ${itemName}`
    : `${schoolName} - ${itemName}`;

  sheet.getRange('A1:O1').merge().setValue(title);
  sheet.getRange('A2:O2').merge().setFormula(
    `=HYPERLINK("${CONFIG.guideUrl}","To assist with measuring your students, please use the linked Costume Measurement Guide for reference.")`
  );
  sheet.getRange('A4:O4').merge().setValue(
    'Please ensure the measurements recorded below are in centimetres. For clothing sizes, be specific with your entry, e.g. Ladies 12 Pants, Mens 28-Inch Pants, Girls 8 Pants, Boys 10 Pants etc...'
  );

  const currentAllocated = findExistingAllocatedCount_(sheet);
  if (currentAllocated === null) {
    Logger.log(`Could not determine the existing row count for "${sheet.getName()}" -- leaving its measurement table untouched.`);
    return;
  }

  if (allocated > currentAllocated) {
    growMeasurementTable_(sheet, currentAllocated, allocated, c);
  }
  // allocated <= currentAllocated: never remove rows, leave the table as-is.
}

function findExistingAllocatedCount_(sheet) {
  const finder = sheet.createTextFinder('This costume measurement sheet has now been locked').matchEntireCell(false);
  const match = finder.findNext();
  if (!match) return null;
  const lockRow = match.getRow();
  const allocated = lockRow - 8; // formatSchoolSheet sets lockRow = 6 + allocated + 2
  return allocated > 0 ? allocated : null;
}

function growMeasurementTable_(sheet, currentAllocated, newAllocated, c) {
  const extraRows = newAllocated - currentAllocated;
  const insertBeforeRow = 6 + currentAllocated; // first row of the gap, right after the last data row
  const headerCount = 15;

  sheet.insertRowsBefore(insertBeforeRow, extraRows);

  sheet.getRange(insertBeforeRow, 1, extraRows, headerCount)
    .setBackground(c.lightBlue)
    .setBorder(true, true, true, true, true, true)
    .setVerticalAlignment('middle');

  const genderRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Female', 'Male', 'Non-binary / self-described'], true)
    .build();

  sheet.getRange(insertBeforeRow, 2, extraRows, 1).setDataValidation(genderRule);
}

function updateRemovedSchoolTabs(ss, currentSchools) {
  const currentTabNames = currentSchools.map(s => safeSheetName(s.tabName));

  ss.getSheets().forEach(sheet => {
    const name = sheet.getName();

    if (
      name === 'Participating Schools' ||
      name === 'All Student Measurements'
    ) {
      return;
    }

    if (!currentTabNames.includes(name)) {
      sheet.setTabColor(COSTUME_CONFIG.colours.yellow);
    } else {
      sheet.setTabColor(null);
    }
  });
}

function getAllowedItemName(item) {
  const normalisedItem = normaliseText(item);

  return COSTUME_CONFIG.allowedItems.find(
    allowed => normaliseText(allowed) === normalisedItem
  ) || item.trim();
}

function normaliseText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cleanFileName(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ');
}

function safeSheetName(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/?*[\]:]/g, '')
    .substring(0, 99);
}