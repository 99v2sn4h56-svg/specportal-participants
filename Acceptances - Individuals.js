/*************************************************************
 * INDIVIDUAL ACCEPTANCE SYNC
 * Does NOT clear old Accepted? values.
 *************************************************************/

function ssSyncIndividualAcceptances() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const individualsSheet = ss.getSheetByName("INDIVIDUALS(YES)");
  const responseSheet = ss.getSheetByName("Individual Acceptance Responses");

  if (!individualsSheet || !responseSheet) {
    SpreadsheetApp.getUi().alert("Could not find INDIVIDUALS(YES) or Individual Acceptance Responses.");
    return;
  }

  const individualData = individualsSheet.getDataRange().getValues();
  const responseData = responseSheet.getDataRange().getValues();

  const individualHeaders = individualData[0];
  const responseHeaders = responseData[0];

  const responseMap = indHeaderMap_(responseHeaders);
  const statusCols = indEnsureStatusColumns_(responseSheet);
  const acceptanceMap = indBuildAcceptanceColumnMap_(individualHeaders, responseHeaders);
  const indexes = indBuildIndividualIndexes_(individualData);

  indClearStatus_(responseSheet, statusCols);

  let matched = 0;
  let notFound = 0;
  let duplicates = 0;

  for (let r = 1; r < responseData.length; r++) {
    const row = responseData[r];
    const responseRow = r + 1;

    const firstName = indGetByHeader_(row, responseMap, ["Student first name"]);
    const surname = indGetByHeader_(row, responseMap, ["Student surname"]);
    const studentEmail = indGetByHeader_(row, responseMap, ["Student email"]);
    const school = indGetByHeader_(row, responseMap, ["School"]);
    const category = indGetByHeader_(row, responseMap, ["Category acceptance"]);

    const matches = indFindBestMatches_(
      indexes,
      firstName,
      surname,
      school,
      category,
      studentEmail
    );

    if (matches.length === 0) {
      indMarkRow_(responseSheet, responseRow, statusCols, "✗ Not Found", "", `No match for ${firstName} ${surname} / ${studentEmail} / ${school} / ${category}`, "#f4cccc");
      notFound++;
      continue;
    }

    if (matches.length > 1) {
      indMarkRow_(responseSheet, responseRow, statusCols, "⚠ Multiple Matches", matches.join(", "), `Multiple possible name matches for ${firstName} ${surname}`, "#fff2cc");
      duplicates++;
      continue;
    }

    const targetRow = matches[0];

    individualsSheet.getRange(targetRow, 1).setValue("Yes");
    indCopyAcceptanceFields_(individualsSheet, targetRow, row, acceptanceMap);

    indMarkRow_(responseSheet, responseRow, statusCols, "✓ Matched", `INDIVIDUALS(YES) row ${targetRow}`, "", "#d9ead3");
    matched++;
  }

  ss.toast(`${matched} matched | ${notFound} not found | ${duplicates} duplicates`);
}

/*************************************************************
 * INDEX BUILDING
 *************************************************************/

function indBuildIndividualIndexes_(data) {
  const headers = data[0];
  const map = indHeaderMap_(headers);

  const firstCol = indFindHeaderIndex_(map, ["Student First Name", "First Name"]);
  const lastCol = indFindHeaderIndex_(map, ["Student Last Name", "Last Name", "Surname"]);
  const schoolCol = indFindHeaderIndex_(map, ["Current School", "School"]);
  const emailCol = indFindHeaderIndex_(map, ["Student Email"]);
  const combinedEmailCol = indFindHeaderIndex_(map, ["Student and Parent emails"]);
  const disciplineCol = indFindHeaderIndex_(map, ["Discipline"]);
  const subDisciplineCol = indFindHeaderIndex_(map, ["Sub-Discipline", "Sub Discipline"]);

  const indexes = {
    email: {},
    full: {},
    category: {},
    name: {}
  };

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const sheetRow = r + 1;

    const firstName = firstCol >= 0 ? row[firstCol] : row[5];
    const surname = lastCol >= 0 ? row[lastCol] : row[6];
    const school = schoolCol >= 0 ? row[schoolCol] : row[7];

    const emailText = [
      emailCol >= 0 ? row[emailCol] : "",
      combinedEmailCol >= 0 ? row[combinedEmailCol] : ""
    ].join(" ");

    indExtractEmails_(emailText).forEach(email => {
      indAddIndex_(indexes.email, email, sheetRow);
    });

    const categories = indCategoryCandidates_(
      disciplineCol >= 0 ? row[disciplineCol] : "",
      subDisciplineCol >= 0 ? row[subDisciplineCol] : ""
    );

    const firstNames = indFirstNameVariants_(firstName);
    const last = indCleanName_(surname);
    const schoolClean = indCleanSchool_(school);

    if (!firstNames.length || !last) continue;

    firstNames.forEach(first => {
      indAddIndex_(indexes.name, `${first}|${last}`, sheetRow);

      categories.forEach(category => {
        indAddIndex_(indexes.full, `${first}|${last}|${schoolClean}|${category}`, sheetRow);
        indAddIndex_(indexes.category, `${first}|${last}||${category}`, sheetRow);
      });
    });
  }

  return indexes;
}

function indFindBestMatches_(indexes, firstName, surname, school, category, studentEmail) {
  const emails = indExtractEmails_(studentEmail);

  for (const email of emails) {
    if (indexes.email[email]) return [...new Set(indexes.email[email])];
  }

  const firstNames = indFirstNameVariants_(firstName);
  const last = indCleanName_(surname);
  const schoolClean = indCleanSchool_(school);
  const categories = indCategoryCandidates_(category);

  for (const first of firstNames) {
    for (const cat of categories) {
      const key = `${first}|${last}|${schoolClean}|${cat}`;
      if (indexes.full[key]) return [...new Set(indexes.full[key])];
    }
  }

  for (const first of firstNames) {
    for (const cat of categories) {
      const key = `${first}|${last}||${cat}`;
      if (indexes.category[key]) return [...new Set(indexes.category[key])];
    }
  }

  for (const first of firstNames) {
    const key = `${first}|${last}`;
    if (indexes.name[key]) return [...new Set(indexes.name[key])];
  }

  return [];
}

function indAddIndex_(index, key, rowNumber) {
  if (!key) return;
  if (!index[key]) index[key] = [];
  if (!index[key].includes(rowNumber)) index[key].push(rowNumber);
}

/*************************************************************
 * ACCEPTANCE FIELD COPYING
 *************************************************************/

function indBuildAcceptanceColumnMap_(individualHeaders, responseHeaders) {
  const targetByOccurrence = {};
  const targetCounts = {};

  individualHeaders.forEach((header, index) => {
    const text = String(header || "");
    if (!text.includes("- Acceptances")) return;

    const sourceHeader = text.replace(/\s*-\s*Acceptances/i, "").trim();
    const clean = indCleanHeader_(sourceHeader);

    targetCounts[clean] = (targetCounts[clean] || 0) + 1;
    targetByOccurrence[`${clean}__${targetCounts[clean]}`] = index + 1;
  });

  const responseCounts = {};
  const map = {};

  responseHeaders.forEach((header, index) => {
    const clean = indCleanHeader_(header);
    if (clean === "sync status" || clean === "matched row" || clean === "sync notes") return;

    responseCounts[clean] = (responseCounts[clean] || 0) + 1;
    const targetCol = targetByOccurrence[`${clean}__${responseCounts[clean]}`];

    if (targetCol) map[index] = targetCol;
  });

  return map;
}

function indCopyAcceptanceFields_(sheet, targetRow, responseRowValues, acceptanceMap) {
  Object.keys(acceptanceMap).forEach(sourceIndexText => {
    const sourceIndex = Number(sourceIndexText);
    const targetCol = acceptanceMap[sourceIndex];
    sheet.getRange(targetRow, targetCol).setValue(responseRowValues[sourceIndex]);
  });
}

/*************************************************************
 * STATUS COLUMNS
 *************************************************************/

function indEnsureStatusColumns_(sheet) {
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

function indClearStatus_(sheet, cols) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  sheet.getRange(2, cols.statusCol, lastRow - 1, 3).clearContent();
  sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).setBackground(null);
}

function indMarkRow_(sheet, row, cols, status, matchedRow, notes, colour) {
  sheet.getRange(row, 1, 1, sheet.getLastColumn()).setBackground(colour);
  sheet.getRange(row, cols.statusCol).setValue(status);
  sheet.getRange(row, cols.matchedCol).setValue(matchedRow);
  sheet.getRange(row, cols.notesCol).setValue(notes);
}

/*************************************************************
 * CATEGORY NORMALISATION
 *************************************************************/

function indCategoryCandidates_(...values) {
  const candidates = [];

  values.forEach(value => {
    const raw = indClean_(value);
    if (!raw) return;

    raw.split(/,|;|\n/).forEach(part => {
      const cleanPart = indClean_(part);
      if (cleanPart) candidates.push(indCleanCategory_(cleanPart));
    });

    candidates.push(indCleanCategory_(raw));
  });

  return [...new Set(candidates.filter(Boolean))];
}

function indCleanCategory_(value) {
  const raw = indClean_(value);
  if (!raw) return "";

  if (raw.includes("speconline") || raw.includes("digital showcase")) return "speconline";
  if (raw.includes("student core choir") || raw.includes("core choir")) return "student core choir";
  if ((raw.includes("drum") || raw.includes("drumming")) && raw.includes("percussion")) return "drumming and percussion ensemble";
  if (raw.includes("secondary choir") || raw.includes("secondary combined choir")) return "secondary combined choir";
  if (raw.includes("backing vocal")) return "backing vocalist";
  if (raw.includes("featured vocal")) return "featured vocalist";
  if (raw.includes("featured instrumental") || raw.includes("instrumentalist")) return "featured instrumentalist";
  if (raw.includes("student co host") || raw.includes("student co-host") || raw.includes("cohost")) return "student co-host";
  if (raw.includes("boys hip hop") || raw.includes("boys hip-hop")) return "boys hip hop ensemble";
  if (raw.includes("featured drama") || raw.includes("drama ensemble")) return "featured drama ensemble";
  if (raw.includes("circus")) return "circus arts ensemble";

  if (raw.includes("featured dance") && raw.includes("hip hop")) return "featured dance - hip hop";
  if (raw.includes("featured dance") && raw.includes("contemporary")) return "featured dance - contemporary";
  if (raw.includes("featured dance") && (raw.includes("jazz") || raw.includes("musical theatre"))) return "featured dance - jazz/musical theatre";

  return raw;
}

/*************************************************************
 * HEADER / TEXT HELPERS
 *************************************************************/

function indHeaderMap_(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const clean = indCleanHeader_(header);
    if (clean && map[clean] === undefined) map[clean] = index;
  });
  return map;
}

function indFindHeaderIndex_(map, possibleHeaders) {
  for (const header of possibleHeaders) {
    const clean = indCleanHeader_(header);
    if (map[clean] !== undefined) return map[clean];
  }
  return -1;
}

function indGetByHeader_(row, map, possibleHeaders) {
  const index = indFindHeaderIndex_(map, possibleHeaders);
  return index >= 0 ? row[index] : "";
}

function indFirstNameVariants_(name) {
  const cleaned = indCleanName_(name);
  if (!cleaned) return [];

  const parts = cleaned.split(" ");
  const variants = [cleaned, parts[0]];

  if (parts.length >= 2) variants.push(parts[0] + " " + parts[1]);

  return [...new Set(variants)];
}

function indExtractEmails_(value) {
  const text = String(value || "").toLowerCase();
  const matches = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g);
  return matches ? [...new Set(matches.map(e => e.trim()))] : [];
}

function indCleanName_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function indCleanSchool_(value) {
  return indClean_(value);
}

function indCleanHeader_(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}

function indClean_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .trim()
    .replace(/\s+/g, " ");
}