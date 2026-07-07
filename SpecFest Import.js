/*************************************************************
 * SPECFEST IMPORT
 * Creates new GROUPS(YES) rows for:
 * - SpecFest Flash Mob
 * - SpecFest Ensemble
 *************************************************************/

function importSpecFestSignups() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const source = ss.getSheetByName("Group Acceptances Response");
  const target = ss.getSheetByName("GROUPS(YES)");

  if (!source || !target) {
    SpreadsheetApp.getUi().alert("Could not find Group Acceptances Response or GROUPS(YES).");
    return;
  }

  const sourceData = source.getDataRange().getValues();
  const targetData = target.getDataRange().getValues();
  const sourceHeaders = sourceData[0];
  const targetHeaders = targetData[0];
  const sourceMap = specHeaderMap_(sourceHeaders);

  let created = 0;
  let skipped = 0;

  for (let r = 1; r < sourceData.length; r++) {
    const row = sourceData[r];

    const rawCategory = specGet_(row, sourceMap, "Category selection");
    const category = specCleanCategory_(rawCategory);

    const isSpecFest =
      category === "specfest flash mob" ||
      category === "specfest ensemble";

    if (!isSpecFest) continue;

    const school = specGet_(row, sourceMap, "School");
    const schoolCode = specGet_(row, sourceMap, "School code");

    if (specFestExists_(targetData, schoolCode, school, category)) {
      skipped++;
      continue;
    }

    const newRow = target.getLastRow() + 1;

    /*************************************************
     * CORE GROUPS(YES) FIELDS
     *************************************************/

    target.getRange(newRow, specCol_("H")).setValue(school);        // School name
    target.getRange(newRow, specCol_("P")).setValue(rawCategory);   // Category
    target.getRange(newRow, specCol_("AA")).setValue(schoolCode);   // School code

    /*************************************************
     * BJ FROM FORM > V AND W
     *************************************************/

    const bjValue = row[specCol_("BJ") - 1];

    target.getRange(newRow, specCol_("V")).setValue(bjValue);
    target.getRange(newRow, specCol_("W")).setValue(bjValue);

    /*************************************************
     * COUNTS
     *************************************************/

    target.getRange(newRow, specCol_("A")).setValue(
      specGet_(row, sourceMap, "Total number of participating students. (this can be reduced by teachers up until Fri 15 Aug) *")
    );

    target.getRange(newRow, specCol_("B")).setValue(
      specGet_(row, sourceMap, "Of your total number above, how many are male identifying students?")
    );

    target.getRange(newRow, specCol_("CI")).setValue(
      specGet_(row, sourceMap, "Of your total number above, how many of your students are Aboriginal or Torres Strait Islander?")
    );

    target.getRange(newRow, specCol_("CJ")).setValue(
      specGet_(row, sourceMap, "Of your total number above, how many of your students have disabilities or require adjustments")
    );

    /*************************************************
     * SCHOOL DETAILS
     *************************************************/

    target.getRange(newRow, specCol_("AA")).setValue(schoolCode);
    target.getRange(newRow, specCol_("AB")).setValue(
      specGet_(row, sourceMap, "School email address")
    );
    target.getRange(newRow, specCol_("AC")).setValue(
      specGet_(row, sourceMap, "School phone")
    );

    /*************************************************
     * CONTACT TEACHER DETAILS
     *************************************************/

    target.getRange(newRow, specCol_("AI")).setValue(
      specGet_(row, sourceMap, "Teacher first name")
    );

    target.getRange(newRow, specCol_("AJ")).setValue(
      specGet_(row, sourceMap, "Teacher surname")
    );

    target.getRange(newRow, specCol_("AK")).setValue(
      specGet_(row, sourceMap, "Teacher email")
    );

    target.getRange(newRow, specCol_("AL")).setValue(
      specGet_(row, sourceMap, "If Teacher role at school was 'Other', please provide more information")
    );

    target.getRange(newRow, specCol_("AM")).setValue(
      specGet_(row, sourceMap, "Teacher mobile")
    );

    /*************************************************
     * ACCEPTANCE COLUMNS
     * Copies response fields into existing:
     * [Header] - Acceptances columns
     *************************************************/

    targetHeaders.forEach((header, c) => {
      const headerText = String(header || "");
      if (!headerText.includes("- Acceptances")) return;

      const sourceHeader = headerText
        .replace(/\s*-\s*Acceptances/i, "")
        .trim();

      const sourceCol = sourceMap[specClean_(sourceHeader)];
      if (sourceCol === undefined) return;

      target.getRange(newRow, c + 1).setValue(row[sourceCol]);
    });

    created++;
  }

  SpreadsheetApp.getActive().toast(
    `${created} SpecFest groups created. ${skipped} already existed.`
  );
}

/*************************************************************
 * CHECK IF SPECFEST ROW ALREADY EXISTS
 *************************************************************/

function specFestExists_(targetData, schoolCode, school, category) {
  const cleanCode = specCleanSchoolCode_(schoolCode);
  const cleanSchool = specClean_(school);
  const cleanCategory = specCleanCategory_(category);

  for (let r = 1; r < targetData.length; r++) {
    const row = targetData[r];

    const existingSchool = specClean_(row[specCol_("H") - 1]);
    const existingCategory = specCleanCategory_(row[specCol_("P") - 1]);
    const existingCode = specCleanSchoolCode_(row[specCol_("AA") - 1]);

    const codeMatch = cleanCode && existingCode === cleanCode;
    const schoolMatch = existingSchool === cleanSchool;
    const categoryMatch = existingCategory === cleanCategory;

    if (categoryMatch && (codeMatch || schoolMatch)) {
      return true;
    }
  }

  return false;
}

/*************************************************************
 * HELPERS
 *************************************************************/

function specHeaderMap_(headers) {
  const map = {};

  headers.forEach((header, index) => {
    map[specClean_(header)] = index;
  });

  return map;
}

function specGet_(row, map, header) {
  const col = map[specClean_(header)];
  if (col === undefined) return "";
  return row[col];
}

function specClean_(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}

function specCleanSchoolCode_(value) {
  return String(value || "")
    .replace(/\.0$/, "")
    .trim();
}

function specCleanCategory_(value) {
  const raw = specClean_(value);

  if (raw.includes("specfest flash mob")) return "specfest flash mob";
  if (raw.includes("specfest ensemble")) return "specfest ensemble";

  return raw;
}

function specCol_(letter) {
  let col = 0;

  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + letter.charCodeAt(i) - 64;
  }

  return col;
}