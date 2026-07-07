function buildRRSubsidySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const groups = ss.getSheetByName("GROUPS(YES)");
  const individuals = ss.getSheetByName("INDIVIDUALS(YES)");

  const outputName = "R&R Subsidy";
  let out = ss.getSheetByName(outputName);
  if (!out) out = ss.insertSheet(outputName);
  out.clear();

  const headers = [
    "Type",
    "Student First Name",
    "Student Last Name",
    "School",
    "Category",
    "# Students Allocated",
    "Distance from QBA",
    "School Email Address",
    "Student / Parent Email Address",
    "Contact Teacher Email Address",
    "School Address"
  ];

  out.getRange(1, 1, 1, headers.length).setValues([headers]);

  const rows = [];

  // GROUPS(YES)
  if (groups) {
    const data = groups.getDataRange().getValues();

    data.slice(1).forEach(r => {
      rows.push([
        "Group",
        "",
        "",
        r[7],   // H - School
        r[15],  // P - Category
        r[6],   // G - # Students Allocated
        r[25],  // Z - Distance from QBA
        r[27],  // AB - School Email Address
        "",
        r[17],  // R - Contact Teacher Email
        ""      // School Address - still needs column
      ]);
    });
  }

  // INDIVIDUALS(YES)
  if (individuals) {
    const data = individuals.getDataRange().getValues();

    data.slice(1).forEach(r => {
      rows.push([
        "Individual",
        r[4],   // E - Student First Name
        r[5],   // F - Student Last Name
        r[6],   // G - School
        r[3],   // D - Category
        1,
        r[14],  // O - Distance from QBA
        r[42],  // AQ - School Email Address
        r[13],  // N - Student / Parent Emails
        r[35],  // AJ - Contact Teacher Email - check this one
        ""      // School Address - still needs column
      ]);
    });
  }

  if (rows.length) {
    out.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  out.setFrozenRows(1);
  out.autoResizeColumns(1, headers.length);
}