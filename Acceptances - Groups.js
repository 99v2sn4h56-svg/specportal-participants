/*************************************************************
 * GROUP ACCEPTANCE SYNC
 *************************************************************/

function ssSyncGroupAcceptances() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const groupsSheet = ss.getSheetByName("GROUPS(YES)");
  const responseSheet = ss.getSheetByName("Group Acceptances Response");

  if (!groupsSheet || !responseSheet) {
    SpreadsheetApp.getUi().alert("Could not find GROUPS(YES) or Group Acceptances Response.");
    return;
  }

  const groupsData = groupsSheet.getDataRange().getValues();
  const responseData = responseSheet.getDataRange().getValues();

  if (groupsData.length < 2 || responseData.length < 2) {
    ss.toast("No data to sync.");
    return;
  }

  const statusCols = grpEnsureStatusColumns_(responseSheet);
  const groupIndex = {};

  for (let r = 1; r < groupsData.length; r++) {
    const row = groupsData[r];

    const schoolName = grpClean_(row[7]);        // H
    const category = grpCleanCategory_(row[15]); // P
    const schoolCode = String(row[26] || "").replace(/\.0$/, "").trim(); // AA

    if (schoolCode) grpAddIndex_(groupIndex, `${schoolCode}|${category}`, r + 1);
    if (schoolName) grpAddIndex_(groupIndex, `${schoolName}|${category}`, r + 1);
  }

  grpClearStatus_(responseSheet, statusCols);

  let matched = 0;
  let notMatched = 0;
  let duplicates = 0;

  for (let r = 1; r < responseData.length; r++) {
    const row = responseData[r];
    const responseRow = r + 1;

    const schoolName = grpClean_(row[2]); // C
    const schoolCode = String(row[3] || "").replace(/\.0$/, "").trim(); // D
    const category = grpCleanCategory_(row[7]); // H

    const totalStudents = row[27]; // AB
    const boys = row[28];          // AC
    const aboriginal = row[29];    // AD
    const adjustments = row[30];   // AE

    let matches = [];

    if (schoolCode) {
      matches = groupIndex[`${schoolCode}|${category}`] || [];
    }

    if (!matches.length && schoolName) {
      matches = groupIndex[`${schoolName}|${category}`] || [];
    }

    if (matches.length === 0) {
      grpMarkRow_(
        responseSheet,
        responseRow,
        statusCols,
        "✗ Not Found",
        "",
        `No match for ${schoolName} / ${category}`,
        "#f4cccc"
      );

      notMatched++;
      continue;
    }

    if (matches.length > 1) {
      grpMarkRow_(
        responseSheet,
        responseRow,
        statusCols,
        "⚠ Multiple Matches",
        matches.join(", "),
        "Multiple matching GROUPS(YES) rows",
        "#fff2cc"
      );

      duplicates++;
      continue;
    }

    const targetRow = matches[0];

    groupsSheet.getRange(targetRow, 1).setValue(totalStudents); // A
    groupsSheet.getRange(targetRow, 2).setValue(boys);          // B
    groupsSheet.getRange(targetRow, grpColumn_("CI")).setValue(aboriginal);
    groupsSheet.getRange(targetRow, grpColumn_("CJ")).setValue(adjustments);

    grpMarkRow_(
      responseSheet,
      responseRow,
      statusCols,
      "✓ Matched",
      `GROUPS(YES) row ${targetRow}`,
      "",
      "#d9ead3"
    );

    matched++;
  }

  ss.toast(`${matched} matched | ${notMatched} not found | ${duplicates} duplicates`);
}

/*************************************************************
 * STATUS COLUMNS
 *************************************************************/

function grpEnsureStatusColumns_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  let statusCol = headers.indexOf("Sync Status") + 1;
  let matchedCol = headers.indexOf("Matched Row") + 1;
  let notesCol = headers.indexOf("Sync Notes") + 1;

  let nextCol = sheet.getLastColumn() + 1;

  if (!statusCol) {
    statusCol = nextCol++;
    sheet.getRange(1, statusCol).setValue("Sync Status");
  }

  if (!matchedCol) {
    matchedCol = nextCol++;
    sheet.getRange(1, matchedCol).setValue("Matched Row");
  }

  if (!notesCol) {
    notesCol = nextCol++;
    sheet.getRange(1, notesCol).setValue("Sync Notes");
  }

  return { statusCol, matchedCol, notesCol };
}

function grpClearStatus_(sheet, cols) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return;

  sheet.getRange(2, cols.statusCol, lastRow - 1, 3).clearContent();
  sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).setBackground(null);
}

function grpMarkRow_(sheet, row, cols, status, matchedRow, notes, colour) {
  sheet.getRange(row, 1, 1, sheet.getLastColumn()).setBackground(colour);

  sheet.getRange(row, cols.statusCol).setValue(status);
  sheet.getRange(row, cols.matchedCol).setValue(matchedRow);
  sheet.getRange(row, cols.notesCol).setValue(notes);
}

/*************************************************************
 * INDEX HELPERS
 *************************************************************/

function grpAddIndex_(index, key, rowNumber) {
  if (!index[key]) index[key] = [];

  if (!index[key].includes(rowNumber)) {
    index[key].push(rowNumber);
  }
}

/*************************************************************
 * CATEGORY NORMALISATION
 *************************************************************/

function grpCleanCategory_(value) {
  const raw = grpClean_(value);

  // DANCE
  if (
    raw.includes("3-6 combined dance") ||
    raw.includes("combined dance (years 3-6)") ||
    raw.includes("combined dance years 3-6") ||
    (raw.includes("combined dance") && raw.includes("3") && raw.includes("6"))
  ) {
    return "3-6 combined dance";
  }

  if (
    raw.includes("k-2 combined dance") ||
    raw.includes("combined dance (years k-2)") ||
    raw.includes("combined dance years k-2") ||
    (raw.includes("combined dance") && raw.includes("k") && raw.includes("2"))
  ) {
    return "k-2 combined dance";
  }

  if (
    raw.includes("secondary combined dance") ||
    raw.includes("combined dance (years 7-12)") ||
    raw.includes("combined dance (years 7 -12)") ||
    raw.includes("combined dance (years 7 - 12)") ||
    raw.includes("combined dance years 7-12") ||
    raw.includes("combined dance years 7 -12") ||
    raw.includes("combined dance years 7 - 12") ||
    (raw.includes("combined dance") && raw.includes("7") && raw.includes("12"))
  ) {
    return "secondary combined dance";
  }

  // CHOIRS
  if (
    raw.includes("secondary choir") ||
    raw.includes("secondary combined choir")
  ) {
    return "secondary combined choir";
  }

  if (
    raw.includes("primary central choir") ||
    raw.includes("central choir")
  ) {
    return "primary central choir";
  }

  if (
    raw.includes("primary moving choir") ||
    raw.includes("moving choir")
  ) {
    return "primary moving choir";
  }

  if (raw.includes("signing choir")) {
    return "signing choir";
  }

  // BOYS HIP HOP
  if (
    raw.includes("boys hip hop") ||
    raw.includes("boys hip-hop") ||
    raw.includes("boys hip hop ensemble") ||
    raw.includes("boys hip-hop ensemble")
  ) {
    return "boys hip hop ensemble";
  }

  // D'ARTS
  if (
    raw.includes("darts") ||
    raw.includes("d arts") ||
    raw.includes("d'arts")
  ) {
    return "darts ensemble";
  }

  // DRAMA
  if (
    raw.includes("featured drama") ||
    raw.includes("drama ensemble")
  ) {
    return "featured drama";
  }

  // OTHER
  if (raw.includes("aboriginal dance")) {
    return "aboriginal dance ensemble";
  }

  if (raw.includes("circus")) {
    return "circus arts ensemble";
  }

  return raw;
}

/*************************************************************
 * GENERAL HELPERS
 *************************************************************/

function grpClean_(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}

function grpColumn_(letter) {
  let col = 0;

  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + letter.charCodeAt(i) - 64;
  }

  return col;
}