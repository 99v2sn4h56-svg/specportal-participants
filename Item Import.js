/************************************************************
IMPORT TOOL
Paste any data into IMPORT with headings in row 1.
The script detects headings and imports to GROUPS(YES) or INDIVIDUALS(YES).
************************************************************/

function createImportSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName("IMPORT");
  if (!sheet) sheet = ss.insertSheet("IMPORT");
  sheet.clear();

  const sampleHeaders = [
    "Import Type",
    "School",
    "Category",
    "Student Count",
    "First Name",
    "Last Name",
    "Year",
    "Discipline",
    "Sub-Discipline",
    "Teacher Email",
    "Principal First Name",
    "Principal Last Name",
    "Principal Email",
    "Cost Per Student",
    "Import Status"
  ];

  sheet.getRange(1, 1, 1, sampleHeaders.length).setValues([sampleHeaders]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sampleHeaders.length)
    .setFontWeight("bold")
    .setBackground("#d9ead3");

  sheet.setColumnWidths(1, sampleHeaders.length, 160);

  let log = ss.getSheetByName("IMPORT LOG");
  if (!log) log = ss.insertSheet("IMPORT LOG");

  if (log.getLastRow() === 0) {
    log.appendRow([
      "Date",
      "User",
      "Imported Groups",
      "Imported Individuals",
      "Warnings"
    ]);
    log.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#cfe2f3");
  }

  SpreadsheetApp.getUi().alert("IMPORT tab created. Paste your data with headings in row 1.");
}

function analyseImport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const importSheet = ss.getSheetByName("IMPORT");

  if (!importSheet) {
    SpreadsheetApp.getUi().alert("No IMPORT sheet found. Run Create / Reset IMPORT Tab first.");
    return;
  }

  const data = importSheet.getDataRange().getValues();
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert("No data found to analyse.");
    return;
  }

  const headers = data[0];
  const map = getImportColumnMap_(headers);
  const statusCol = getOrCreateImportStatusColumn_(importSheet, headers);
  const schools = getSchoolLookup_();

  let groups = 0;
  let individuals = 0;
  let warnings = 0;

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (row.join("").trim() === "") continue;

    const type = detectImportTypeFromMap_(row, map);
    const school = clean_(valueFromMap_(row, map, "school"));
    const first = clean_(valueFromMap_(row, map, "firstName"));
    const last = clean_(valueFromMap_(row, map, "lastName"));
    const category = clean_(valueFromMap_(row, map, "category"));

    let status = [];

    if (type === "Group") groups++;
    if (type === "Individual") individuals++;

    if (!school) {
      status.push("⚠ Missing school");
      warnings++;
    } else if (!schools[normalise_(school)]) {
      status.push("⚠ School not found in master dataset");
      warnings++;
    }

    if (type === "Individual" && (!first || !last)) {
      status.push("⚠ Missing student name");
      warnings++;
    }

    if (type === "Group" && !category) {
      status.push("⚠ Missing category");
      warnings++;
    }

    if (type === "Unknown") {
      status.push("⚠ Could not detect Group or Individual");
      warnings++;
    }

    if (status.length === 0) status.push("Ready: " + type);

    importSheet.getRange(r + 1, statusCol).setValue(status.join(" | "));
  }

  SpreadsheetApp.getUi().alert(
    "Import analysed:\n\n" +
    "Groups found: " + groups + "\n" +
    "Individuals found: " + individuals + "\n" +
    "Warnings: " + warnings
  );
}

function importRecords() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const importSheet = ss.getSheetByName("IMPORT");
  const groupsSheet = ss.getSheetByName("GROUPS(YES)");
  const individualsSheet = ss.getSheetByName("INDIVIDUALS(YES)");
  const logSheet = ss.getSheetByName("IMPORT LOG");

  if (!importSheet || !groupsSheet || !individualsSheet) {
    SpreadsheetApp.getUi().alert("Missing IMPORT, GROUPS(YES), or INDIVIDUALS(YES) sheet.");
    return;
  }

  const data = importSheet.getDataRange().getValues();
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert("No data found to import.");
    return;
  }

  const headers = data[0];
  const map = getImportColumnMap_(headers);
  const statusCol = getOrCreateImportStatusColumn_(importSheet, headers);
  const schools = getSchoolLookup_();

  let importedGroups = 0;
  let importedIndividuals = 0;
  let warnings = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (row.join("").trim() === "") continue;

    const type = detectImportTypeFromMap_(row, map);

    const schoolName = clean_(valueFromMap_(row, map, "school"));
    const schoolRecord = schools[normalise_(schoolName)] || {};

    const category = clean_(valueFromMap_(row, map, "category"));
    const studentCount = valueFromMap_(row, map, "studentCount");
    const firstName = clean_(valueFromMap_(row, map, "firstName"));
    const lastName = clean_(valueFromMap_(row, map, "lastName"));
    const year = valueFromMap_(row, map, "year");
    const discipline = clean_(valueFromMap_(row, map, "discipline")) || category;
    const subDiscipline = clean_(valueFromMap_(row, map, "subDiscipline"));
    const directorate = clean_(valueFromMap_(row, map, "directorate")) || schoolRecord.directorate || "";
    const teacherEmail = clean_(valueFromMap_(row, map, "teacherEmail"));
    const principalFirst = clean_(valueFromMap_(row, map, "principalFirstName"));
    const principalLast = clean_(valueFromMap_(row, map, "principalLastName"));
    const principalEmail = clean_(valueFromMap_(row, map, "principalEmail"));
    const costPerStudent = Number(valueFromMap_(row, map, "costPerStudent")) || "";

    if (!schoolName) {
      warnings.push("Row " + (r + 1) + ": missing school");
      importSheet.getRange(r + 1, statusCol).setValue("⚠ Not imported: missing school");
      continue;
    }

    if (type === "Group") {
      if (!category) {
        warnings.push("Row " + (r + 1) + ": missing category");
        importSheet.getRange(r + 1, statusCol).setValue("⚠ Not imported: missing category");
        continue;
      }

      const output = new Array(55).fill("");

      output[6] = studentCount;                 // G Count
      output[7] = schoolName;                   // H School
      output[14] = category;                    // O Category
      output[17] = teacherEmail;                // R Teacher Email
      output[26] = principalFirst;              // AA Principal First
      output[27] = principalLast;               // AB Principal Last
      output[28] = principalEmail;              // AC Principal Email
      output[53] = costPerStudent;              // BB Cost Per Student

      if (studentCount && costPerStudent) {
        output[54] = Number(studentCount) * Number(costPerStudent); // BC Total
      }

      groupsSheet.appendRow(output);
      importedGroups++;
      importSheet.getRange(r + 1, statusCol).setValue("✅ Imported as Group");
      continue;
    }

    if (type === "Individual") {
      if (!firstName || !lastName) {
        warnings.push("Row " + (r + 1) + ": missing student name");
        importSheet.getRange(r + 1, statusCol).setValue("⚠ Not imported: missing student name");
        continue;
      }

      const output = new Array(37).fill("");

      output[2] = discipline;                   // C Discipline
      output[3] = subDiscipline;                // D Sub-Discipline
      output[4] = firstName;                    // E First Name
      output[5] = lastName;                     // F Last Name
      output[6] = schoolName;                   // G School
      output[7] = directorate;                  // H Directorate
      output[9] = year;                         // J Year
      output[11] = costPerStudent;              // L Cost
      output[35] = [principalFirst, principalLast].join(" ").trim(); // AJ Principal Name
      output[36] = principalEmail;              // AK Principal Email

      individualsSheet.appendRow(output);
      importedIndividuals++;
      importSheet.getRange(r + 1, statusCol).setValue("✅ Imported as Individual");
      continue;
    }

    warnings.push("Row " + (r + 1) + ": could not detect type");
    importSheet.getRange(r + 1, statusCol).setValue("⚠ Not imported: could not detect type");
  }

  if (logSheet) {
    logSheet.appendRow([
      new Date(),
      Session.getActiveUser().getEmail(),
      importedGroups,
      importedIndividuals,
      warnings.join(" | ")
    ]);
  }

  SpreadsheetApp.getUi().alert(
    "Import complete:\n\n" +
    "Groups imported: " + importedGroups + "\n" +
    "Individuals imported: " + importedIndividuals + "\n" +
    "Warnings: " + warnings.length
  );
}

/************************************************************
HEADING DETECTION
************************************************************/

function getImportColumnMap_(headers) {
  const map = {};

  headers.forEach((heading, index) => {
    const h = normaliseHeading_(heading);

    if ([
      "import type",
      "type",
      "record type"
    ].includes(h)) map.importType = index;

    if ([
      "school",
      "school name",
      "current school",
      "form responder"
    ].includes(h)) map.school = index;

    if ([
      "school code",
      "code"
    ].includes(h)) map.schoolCode = index;

    if ([
      "school email",
      "school email address"
    ].includes(h)) map.schoolEmail = index;

    if ([
      "category",
      "category selection",
      "ensemble",
      "item",
      "discipline category"
    ].includes(h)) map.category = index;

    if ([
      "student count",
      "count",
      "number of students",
      "no students",
      "no. students",
      "students",
      "allocation",
      "number allocated"
    ].includes(h)) map.studentCount = index;

    if ([
      "first name",
      "firstname",
      "student first name",
      "given name",
      "student given name"
    ].includes(h)) map.firstName = index;

    if ([
      "last name",
      "lastname",
      "surname",
      "student surname",
      "family name",
      "student family name"
    ].includes(h)) map.lastName = index;

    if ([
      "year",
      "year group",
      "school year",
      "current year"
    ].includes(h)) map.year = index;

    if ([
      "discipline"
    ].includes(h)) map.discipline = index;

    if ([
      "sub discipline",
      "sub-discipline",
      "subdiscipline",
      "category detail",
      "unsuccessful category",
      "successful category"
    ].includes(h)) map.subDiscipline = index;

    if ([
      "directorate"
    ].includes(h)) map.directorate = index;

    if ([
      "teacher first name",
      "supervising teacher first name"
    ].includes(h)) map.teacherFirstName = index;

    if ([
      "teacher surname",
      "teacher last name",
      "supervising teacher surname"
    ].includes(h)) map.teacherSurname = index;

    if ([
      "teacher email",
      "teacher email doe",
      "teacher email address",
      "teacher email doe address",
      "2nd teacher email",
      "second teacher email"
    ].includes(h)) map.teacherEmail = index;

    if ([
      "teacher mobile",
      "teacher phone",
      "teacher phone number"
    ].includes(h)) map.teacherMobile = index;

    if ([
      "principal first name",
      "principal given name"
    ].includes(h)) map.principalFirstName = index;

    if ([
      "principal last name",
      "principal surname",
      "principal family name"
    ].includes(h)) map.principalLastName = index;

    if ([
      "principal email",
      "principal email address"
    ].includes(h)) map.principalEmail = index;

    if ([
      "cost",
      "cost per student",
      "fee",
      "student fee"
    ].includes(h)) map.costPerStudent = index;

    if ([
  "school year",
  "student year",
  "student school year",
  "school year"
].includes(h)) map.year = index;

if ([
  "student name first name",
  "student first name",
  "first name"
].includes(h)) map.firstName = index;

if ([
  "student name last name",
  "student last name",
  "last name",
  "surname"
].includes(h)) map.lastName = index;

if ([
  "teacher name teacher given name",
  "teacher first name",
  "teacher given name"
].includes(h)) map.teacherFirstName = index;

if ([
  "teacher name teacher last name",
  "teacher surname",
  "teacher last name"
].includes(h)) map.teacherSurname = index;

if ([
  "principal name principal first name",
  "principal first name"
].includes(h)) map.principalFirstName = index;

if ([
  "principal name principal last name",
  "principal surname",
  "principal last name"
].includes(h)) map.principalLastName = index;
  });


  return map;
}

function detectImportTypeFromMap_(row, map) {
  const chosen = clean_(valueFromMap_(row, map, "importType")).toLowerCase();

  if (chosen === "group" || chosen === "groups") return "Group";
  if (chosen === "individual" || chosen === "individuals" || chosen === "student") return "Individual";
  if (chosen === "auto") {
    // Continue auto-detecting below.
  }

  const first = clean_(valueFromMap_(row, map, "firstName"));
  const last = clean_(valueFromMap_(row, map, "lastName"));
  const count = valueFromMap_(row, map, "studentCount");
  const category = clean_(valueFromMap_(row, map, "category"));

  if (first || last) return "Individual";
  if (count || category) return "Group";

  return "Unknown";
}

function valueFromMap_(row, map, key) {
  return map[key] !== undefined ? row[map[key]] : "";
}

function getOrCreateImportStatusColumn_(sheet, headers) {
  let statusCol = headers.findIndex(h => normaliseHeading_(h) === "import status") + 1;

  if (statusCol === 0) {
    statusCol = headers.length + 1;
    sheet.getRange(1, statusCol).setValue("Import Status");
    sheet.getRange(1, statusCol)
      .setFontWeight("bold")
      .setBackground("#fce5cd");
  }

  return statusCol;
}

/************************************************************
SCHOOL LOOKUP
************************************************************/

function getSchoolLookup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Schools Master Dataset");
  const lookup = {};

  if (!sheet) return lookup;

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const code = data[i][0];        // A
    const school = data[i][2];      // C
    const email = data[i][7];       // H
    const directorate = data[i][31]; // AF

    if (school) {
      lookup[normalise_(school)] = {
        code,
        school,
        email,
        directorate
      };
    }
  }

  return lookup;
}

/************************************************************
HELPERS
************************************************************/

function clean_(value) {
  return String(value || "").trim();
}

function normalise_(value) {
  return clean_(value).toLowerCase().replace(/\s+/g, " ");
}

function normaliseHeading_(value) {
  return clean_(value)
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}