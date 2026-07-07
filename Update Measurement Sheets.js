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
      sheet = ss.insertSheet(sheetName);
    }

    formatSchoolSheet(
      sheet,
      schoolObj.school,
      schoolObj.groupName,
      itemName,
      schoolObj.allocated
    );
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