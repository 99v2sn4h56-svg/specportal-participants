const CONFIG = {
  sourceSheetName: 'GROUPS(YES)',
  outputFolderId: '1zV4bTV5k_-_n6Ingq1GByJbxh-IBdgFR',

  // Looked up by header text (not position) each run, so these columns can
  // be freely reordered on GROUPS(YES) without breaking anything.
  allocatedColHeader: '# Alloc',
  schoolColHeader: 'School name',
  itemColHeader: 'Item',
  groupNameColHeader: 'Category',

  guideUrl: 'https://drive.google.com/file/d/1BWR7BFqc8IgIi9otWAP5Sf9Yu50eN26l/view?usp=sharing',

  allowedItems: [
    'Golden/Original',
    "Let's Do The Alien Dance",
    'Talking to the Moon',
    'Back in Black',
    'Alive',
    'Better',
    'Good Things Grow',
    'Joy',
    'INTERVAL',
    'You Can Be An Inventor',
    'Eclipse',
    'I Am Australian',
    'Land Down Under',
    'Dance Monkey'
  ],

  colours: {
    purple: '#992cb9',
    blue: '#1baeff',
    lightBlue: '#d6f0ff',
    yellow: '#ffda00',
    white: '#ffffff',
    black: '#000000'
  }
};


function generateCostumeSheets() {
  const ui = SpreadsheetApp.getUi();
  const sourceSS = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = sourceSS.getSheetByName(CONFIG.sourceSheetName);

  if (!sourceSheet) {
    ui.alert(`Could not find sheet: ${CONFIG.sourceSheetName}`);
    return;
  }

  const allValues = sourceSheet.getDataRange().getValues();
  const headers = allValues[0];
  const gCol = name => headers.indexOf(name);

  const allocatedCol = gCol(CONFIG.allocatedColHeader);
  const schoolCol = gCol(CONFIG.schoolColHeader);
  const itemCol = gCol(CONFIG.itemColHeader);
  const groupNameCol = gCol(CONFIG.groupNameColHeader);

  if (schoolCol < 0 || itemCol < 0) {
    ui.alert(`Could not find the expected "${CONFIG.schoolColHeader}" or "${CONFIG.itemColHeader}" columns on ${CONFIG.sourceSheetName}.`);
    return;
  }

  const data = allValues.slice(1);
  const grouped = {};

  data.forEach(row => {
    const allocated = allocatedCol >= 0 ? Number(row[allocatedCol]) : NaN;
    const school = String(row[schoolCol] || '').trim();
    const item = String(row[itemCol] || '').trim();
    const groupName = groupNameCol >= 0 ? String(row[groupNameCol] || '').trim() : '';

    if (!CONFIG.allowedItems.includes(item)) return;
    if (!allocated || !school || !item) return;

    const tabName = groupName ? `${school} (${groupName})` : school;

    if (!grouped[item]) grouped[item] = [];

    grouped[item].push({
      school,
      groupName,
      tabName,
      allocated
    });
  });

  const itemNames = Object.keys(grouped);

  if (!itemNames.length) {
    ui.alert('No matching costume groups were found in Column N.');
    return;
  }

  itemNames.forEach(itemName => {
    createCostumeWorkbook(itemName, grouped[itemName]);
  });

  ui.alert(`${itemNames.length} costume measurement workbook/s generated.`);
}

function createCostumeWorkbook(itemName, schools) {
  const fileName = `${cleanFileName(itemName)} - Costume Measurement Sheet`;
  const ss = SpreadsheetApp.create(fileName);

  const file = DriveApp.getFileById(ss.getId());
  const folder = DriveApp.getFolderById(CONFIG.outputFolderId);
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  const home = ss.getSheets()[0];
  home.setName('Participating Schools');

  schools.forEach(schoolObj => {
    const sheet = ss.insertSheet(safeSheetName(schoolObj.tabName));
    formatSchoolSheet(sheet, schoolObj.school, schoolObj.groupName, itemName, schoolObj.allocated);
  });

  formatParticipatingSchools(home, itemName, schools);

  const summary = ss.insertSheet('All Student Measurements');
  formatSummarySheet(summary, schools);

  ss.setActiveSheet(home);
}

function formatParticipatingSchools(sheet, itemName, schools) {
  const c = CONFIG.colours;
  sheet.clear();
  sheet.setHiddenGridlines(true);

  sheet.getRange('A1')
    .setValue(itemName)
    .setFontSize(18)
    .setFontWeight('bold')
    .setFontColor(c.purple);

  sheet.getRange('A2')
    .setValue("Please select your school's name in the list below to be taken to your group's costume measurement spreadsheet.")
    .setFontWeight('bold')
    .setWrap(true);

  sheet.getRange('A4')
    .setValue('Schools')
    .setFontWeight('bold')
    .setFontColor(c.white)
    .setBackground(c.purple);

  schools.forEach((schoolObj, i) => {
    const row = i + 5;
    const sheetName = safeSheetName(schoolObj.tabName);
    const targetSheet = sheet.getParent().getSheetByName(sheetName);
    const gid = targetSheet ? targetSheet.getSheetId() : '';

    sheet.getRange(row, 1)
      .setFormula(`=HYPERLINK("#gid=${gid}","${escapeQuotes(schoolObj.tabName)}")`)
      .setBackground(c.lightBlue)
      .setFontColor(c.blue)
      .setFontWeight('bold');
  });

  sheet.setColumnWidth(1, 460);

  sheet.getRange(4, 1, schools.length + 1, 1)
    .setBorder(true, true, true, true, true, true);
}

function formatSchoolSheet(sheet, schoolName, groupName, itemName, allocated) {
  const c = CONFIG.colours;
  sheet.clear();
  sheet.setHiddenGridlines(true);

  const title = groupName
    ? `${schoolName} (${groupName}) - ${itemName}`
    : `${schoolName} - ${itemName}`;

  sheet.getRange('A1:O1')
    .merge()
    .setValue(title)
    .setFontSize(16)
    .setFontWeight('bold')
    .setFontColor(c.white)
    .setBackground(c.purple);

  sheet.getRange('A2:O2')
    .merge()
    .setFormula(`=HYPERLINK("${CONFIG.guideUrl}","To assist with measuring your students, please use the linked Costume Measurement Guide for reference.")`)
    .setFontWeight('bold')
    .setFontColor(c.blue)
    .setBackground(c.lightBlue);

  sheet.getRange('A4:O4')
    .merge()
    .setValue('Please ensure the measurements recorded below are in centimetres. For clothing sizes, be specific with your entry, e.g. Ladies 12 Pants, Mens 28-Inch Pants, Girls 8 Pants, Boys 10 Pants etc...')
    .setFontStyle('italic')
    .setWrap(true)
    .setBackground(c.yellow);

  const headers = [
    'Student Full Name',
    'Gender',
    'Head circumference',
    'Shoulder to shoulder',
    'Shoulder to wrist',
    'Shoulder to ankle',
    'Girth',
    'Bust',
    'Waist',
    'Hip',
    'Waist to ankle',
    'Waist to knee',
    'Pant size',
    'Shirt size',
    'Dress size (if applicable)'
  ];

  sheet.getRange(5, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setFontColor(c.white)
    .setBackground(c.purple)
    .setWrap(true)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.getRange(6, 1, allocated, headers.length)
    .setBackground(c.lightBlue)
    .setBorder(true, true, true, true, true, true)
    .setVerticalAlignment('middle');

  const genderRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Female', 'Male', 'Non-binary / self-described'], true)
    .build();

  sheet.getRange(6, 2, allocated, 1).setDataValidation(genderRule);

  const lockRow = 6 + allocated + 2;

  sheet.getRange(lockRow, 1, 1, 12)
    .merge()
    .setValue('This costume measurement sheet has now been locked and cannot be edited. If you need to make an update, please email schoolsspectacular@det.nsw.edu.au')
    .setBackground(c.yellow)
    .setFontWeight('bold')
    .setWrap(true);

  sheet.setFrozenRows(5);

  const widths = [210, 115, 120, 130, 130, 130, 95, 95, 95, 95, 130, 130, 115, 115, 160];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  sheet.setRowHeight(1, 34);
  sheet.setRowHeight(2, 30);
  sheet.setRowHeight(4, 42);
  sheet.setRowHeight(5, 48);
}

function formatSummarySheet(sheet, schools) {
  const c = CONFIG.colours;
  sheet.clear();
  sheet.setHiddenGridlines(true);

  const headers = [
    'School',
    'Group Name',
    'Student Full Name',
    'Gender',
    'Head circumference',
    'Shoulder to shoulder',
    'Shoulder to wrist',
    'Shoulder to ankle',
    'Girth',
    'Bust',
    'Waist',
    'Hip',
    'Waist to ankle',
    'Waist to knee',
    'Pant size',
    'Shirt size',
    'Dress size (if applicable)'
  ];

  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setFontColor(c.white)
    .setBackground(c.purple)
    .setWrap(true);

  const formulaParts = schools.map(schoolObj => {
    const sheetName = safeSheetName(schoolObj.tabName);
    const endRow = 5 + schoolObj.allocated;

    return `{ARRAYFORMULA(IF('${sheetName}'!A6:A${endRow}<>"","${escapeQuotes(schoolObj.school)}","")),ARRAYFORMULA(IF('${sheetName}'!A6:A${endRow}<>"","${escapeQuotes(schoolObj.groupName)}","")),'${sheetName}'!A6:O${endRow}}`;
  });

  if (formulaParts.length) {
    sheet.getRange(2, 1).setFormula(
      `=QUERY({${formulaParts.join(';')}},"select * where Col3 is not null",0)`
    );
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function safeSheetName(name) {
  return String(name)
    .replace(/[\\/?*[\]:]/g, '')
    .substring(0, 95);
}

function cleanFileName(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim();
}

function escapeQuotes(text) {
  return String(text).replace(/"/g, '""');
}