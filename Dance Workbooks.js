const DANCE_FOLDER_ID = "1UfEjKw1wRa9FMHDxz0WabnSaB2oTtgp7";
const SOURCE_SHEET_NAME = "GROUPS(YES)";

const COMBINED_ITEMS = ["I Am Australian", "Land Down Under", "Dance Monkey"];
const COMBINED_WORKBOOK_NAME = "Dance - I Am Australian, Land Down Under & Dance Monkey";

const HEADER_COLOUR = "#1256cf";
const ALTERNATE_ROW_COLOUR = "#eef3ff";

const OUTPUT_HEADERS = [
  "Accepted? / # Alloc",
  "School Name",
  "Notes",
  "Link",
  "Segment",
  "Dance group name (if group is made up of multiple schools)",
  "Google Classroom link + Code",
  "All Teacher Emails",
  "Region",
  "School email address",
  "School Phone",
  "Contact teacher first name (1)",
  "Contact teacher surname (1)",
  "Contact teacher email (1)",
  "Contact teacher role (1)",
  "Contact teacher first name (2)",
  "Contact teacher surname (2)",
  "Contact teacher email (2)",
  "Contact teacher role (2)",
  "Contact teacher mobile (2)"
];

const SOURCE_COLS = [
  0,   // Accepted? Col A, fallback to # Alloc Col G
  7,   // School Name Col H
  8,   // Notes Col I
  9,   // Link Col J
  13,  // Segment Col N
  16,  // Dance group name Col Q
  18,  // Google Classroom link + Code Col S
  20,  // All Teacher Emails Col U
  23,  // Region Col X
  27,  // School email address Col AB
  28,  // School Phone Col AC
  34,  // Contact teacher's first name Col AI
  35,  // Contact teacher's surname Col AJ
  36,  // Contact teacher's email Col AK
  37,  // Contact teacher's role at the school Col AL
  39,  // Second contact teacher's first name Col AN
  40,  // Second contact teacher's surname Col AO
  41,  // Second contact teacher's email Col AP
  42,  // Second contact teacher's role at the school Col AQ
  43   // Second contact teacher's mobile number Col AR
];

function createOrUpdateDanceWorkbooks() {
  buildDanceWorkbooks_(true);
}

function syncExistingDanceWorkbooksOnly() {
  buildDanceWorkbooks_(false);
}

function buildDanceWorkbooks_(createMissing) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(SOURCE_SHEET_NAME);

  if (!sourceSheet) {
    SpreadsheetApp.getUi().alert(`Could not find sheet: ${SOURCE_SHEET_NAME}`);
    return;
  }

  const rootFolder = DriveApp.getFolderById(DANCE_FOLDER_ID);
  const values = sourceSheet.getDataRange().getValues();

  const itemCol = 14;     // Col O - Item
  const allocCol = 6;     // Col G - # Alloc
  const segmentCol = 13;  // Col N - Segment

  const rowsByItem = {};
  const segmentByItem = {};

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const item = String(row[itemCol] || "").trim();
    const segment = String(row[segmentCol] || "").trim();

    if (!item) continue;

    if (!rowsByItem[item]) {
      rowsByItem[item] = [];
      segmentByItem[item] = segment;
    }

    const outputRow = SOURCE_COLS.map((colIndex, i) => {
      let value = i === 0
        ? row[0] || row[allocCol] || ""
        : row[colIndex] || "";

      // Phone columns in the output:
      // Col K - School Phone
      // Col T - Second contact mobile number
      if (i === 10 || i === 19) {
        value = fixPhoneNumber_(value);
      }

      return value;
    });

    rowsByItem[item].push(outputRow);
  }

  createOrUpdateCombinedWorkbook_(rootFolder, rowsByItem, segmentByItem, createMissing);

  Object.keys(rowsByItem)
    .filter(item => !COMBINED_ITEMS.includes(item))
    .sort()
    .forEach(item => {
      const segment = segmentByItem[item] || "No Segment";
      const folderName = `${segment} - ${item}`;
      const itemFolder = getOrCreateFolder_(rootFolder, folderName, createMissing);

      if (!itemFolder) return;

      const workbookName = `Dance - ${item}`;
      const file = getSpreadsheetFileInFolder_(itemFolder, workbookName);

      if (!file && !createMissing) return;

      const targetSS = file
        ? SpreadsheetApp.openById(file.getId())
        : createSpreadsheetInFolder_(workbookName, itemFolder);

      const sheetName = sanitiseSheetName_(item);

      updateSingleSheet_(
        targetSS,
        sheetName,
        rowsByItem[item]
      );

      removeExtraSheets_(targetSS, [sheetName]);
    });

  SpreadsheetApp.getUi().alert(
    createMissing
      ? "Dance workbooks created/updated successfully."
      : "Existing Dance workbooks synced successfully."
  );
}

function createOrUpdateCombinedWorkbook_(rootFolder, rowsByItem, segmentByItem, createMissing) {
  const folderName = "Combined Dance Items - I Am Australian, Land Down Under & Dance Monkey";
  const combinedFolder = getOrCreateFolder_(rootFolder, folderName, createMissing);

  if (!combinedFolder) return;

  const file = getSpreadsheetFileInFolder_(combinedFolder, COMBINED_WORKBOOK_NAME);

  if (!file && !createMissing) return;

  const targetSS = file
    ? SpreadsheetApp.openById(file.getId())
    : createSpreadsheetInFolder_(COMBINED_WORKBOOK_NAME, combinedFolder);

  const sheetNamesToKeep = [];

  COMBINED_ITEMS.forEach(item => {
    if (!rowsByItem[item]) return;

    const sheetName = sanitiseSheetName_(item);
    sheetNamesToKeep.push(sheetName);

    updateSingleSheet_(
      targetSS,
      sheetName,
      rowsByItem[item]
    );
  });

  removeExtraSheets_(targetSS, sheetNamesToKeep);
}

function updateSingleSheet_(targetSS, sheetName, rows) {
  let sheet = targetSS.getSheetByName(sheetName);

  if (!sheet) {
    sheet = targetSS.insertSheet(sheetName);
  }

  sheet.clear();

  const output = [OUTPUT_HEADERS, ...rows];

  sheet
    .getRange(1, 1, output.length, OUTPUT_HEADERS.length)
    .setValues(output);

  sheet.getRange(1, 1, 1, OUTPUT_HEADERS.length)
    .setBackground(HEADER_COLOUR)
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setWrap(true)
    .setVerticalAlignment("middle");

  sheet.setFrozenRows(1);

  if (sheet.getFilter()) {
    sheet.getFilter().remove();
  }

  sheet
    .getRange(1, 1, Math.max(output.length, 2), OUTPUT_HEADERS.length)
    .createFilter();

  sheet.getDataRange()
    .setWrap(true)
    .setVerticalAlignment("top");

  // Alternate row colours, excluding header
  if (rows.length > 0) {
    for (let r = 2; r <= output.length; r++) {
      const rowColour = r % 2 === 0 ? ALTERNATE_ROW_COLOUR : "#ffffff";
      sheet
        .getRange(r, 1, 1, OUTPUT_HEADERS.length)
        .setBackground(rowColour);
    }
  }

  // Bold Column A and Column B
  if (output.length > 1) {
    sheet.getRange(2, 1, output.length - 1, 1).setFontWeight("bold");
    sheet.getRange(2, 2, output.length - 1, 1).setFontWeight("bold");
  }

  // Auto-fit columns to content
  sheet.autoResizeColumns(1, OUTPUT_HEADERS.length);

  // Double width of Column B after auto-fit
  const schoolColWidth = sheet.getColumnWidth(2);
  sheet.setColumnWidth(2, schoolColWidth * 2);
}

function fixPhoneNumber_(value) {
  if (!value) return "";

  let phone = String(value).trim();

  phone = phone.replace(/\s+/g, "");

  if (phone.startsWith("+61")) {
    phone = "0" + phone.substring(3);
  }

  if (!phone.startsWith("0") && /^\d+$/.test(phone)) {
    phone = "0" + phone;
  }

  return phone;
}

function getOrCreateFolder_(parentFolder, folderName, createMissing) {
  const cleanName = sanitiseFileName_(folderName);
  const folders = parentFolder.getFoldersByName(cleanName);

  if (folders.hasNext()) {
    return folders.next();
  }

  if (!createMissing) {
    return null;
  }

  return parentFolder.createFolder(cleanName);
}

function createSpreadsheetInFolder_(name, folder) {
  const newSS = SpreadsheetApp.create(name);
  const file = DriveApp.getFileById(newSS.getId());

  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  return newSS;
}

function getSpreadsheetFileInFolder_(folder, name) {
  const files = folder.getFilesByName(name);

  while (files.hasNext()) {
    const file = files.next();

    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return file;
    }
  }

  return null;
}

function removeExtraSheets_(spreadsheet, sheetNamesToKeep) {
  const keep = new Set(sheetNamesToKeep);

  spreadsheet.getSheets().forEach(sheet => {
    if (!keep.has(sheet.getName()) && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(sheet);
    }
  });
}

function sanitiseSheetName_(name) {
  return String(name)
    .replace(/[\\/?*[\]:]/g, "")
    .substring(0, 99)
    .trim();
}

function sanitiseFileName_(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim();
}