/**
 * Guided Import Centre service.
 *
 * Business logic lives here; ImportCentre.html is only the UI layer.
 */

function openIndividualAcceptanceImportCentre() {
  openImportCentre_("individual");
}

function openGroupAcceptanceImportCentre() {
  openImportCentre_("group");
}

function openAcceptanceImportCentre() {
  openImportCentre_("auto");
}

function openImportCentre_(type) {
  const template = HtmlService.createTemplateFromFile("ImportCentre");
  template.initialImportType = type || "individual";

  SpreadsheetApp.getUi().showModelessDialog(
    template
      .evaluate()
      .setTitle("Spec Central Import Centre")
      .setWidth(980)
      .setHeight(760),
    "Spec Central Import Centre"
  );
}

function importCentreAnalyseUpload(payload) {
  return ImportService.analyse(payload);
}

function importCentreCommitImport(payload) {
  return ImportService.commit(payload);
}

const ImportService = (() => {
  const SHEETS = {
    individual: "INDIVIDUALS(YES)",
    group: "GROUPS(YES)",
    history: "Import History"
  };
  const CATEGORY_CANONICAL = [
    { value: "K-2 Combined Dance", aliases: ["K-2 Combined Dance", "K–2 Combined Dance", "Combined Dance K-2", "Combined Dance (Years K-2)", "Combined Dance Years K-2", "Combined Dance (K-2)"] },
    { value: "3-6 Combined Dance", aliases: ["3-6 Combined Dance", "3–6 Combined Dance", "Combined Dance 3-6", "Combined Dance (Years 3-6)", "Combined Dance Years 3-6", "Combined Dance (3-6)"] },
    { value: "Secondary Combined Dance", aliases: ["Secondary Combined Dance", "Combined Dance Secondary", "Combined Dance (Secondary)", "Combined Dance (Years 7-12)", "Combined Dance Years 7-12"] },
    { value: "Aboriginal Dance Ensemble", aliases: ["Aboriginal Dance Ensemble", "Aboriginal Dance"] },
    { value: "D'Arts", aliases: ["D'Arts", "D Arts", "D&#39;Arts"] },
    { value: "Signing Choir", aliases: ["Signing Choir"] },
    { value: "Boys HH School Groups", aliases: ["Boys HH School Groups", "Boys Hip Hop School Groups"] },
    { value: "Primary Central Choir", aliases: ["Primary Central Choir", "Central Choir", "Primary Choir"] },
    { value: "Secondary Combined Choir", aliases: ["Secondary Combined Choir", "Secondary Choir", "Combined Choir Secondary", "Combined Choir (Secondary)"] },
    { value: "Primary Moving Choir", aliases: ["Primary Moving Choir", "Moving Choir"] },
    { value: "Boys Hip Hop", aliases: ["Boys Hip Hop"] },
    { value: "SpecFest Flash Mob", aliases: ["SpecFest Flash Mob", "Flash Mob"] },
    { value: "SpecFest Ensemble", aliases: ["SpecFest Ensemble"] }
  ];

  function analyse(payload) {
    const started = Date.now();
    const requestedType = normaliseRequestedType_(payload && payload.importType);
    const fileName = String((payload && payload.fileName) || "Uploaded file").trim();
    const rows = normaliseMatrix_(payload && payload.rows);

    if (rows.length < 2) {
      throw new Error("The uploaded file does not contain any data rows.");
    }

    const typeSelection = resolveImportType_(requestedType, rows);
    const type = typeSelection.type;
    const destination = typeSelection.destination;
    const headerSelection = typeSelection.headerSelection;
    const incomingHeaders = headerSelection.headers;
    const incomingRows = rows.slice(headerSelection.headerRowIndex + 1)
      .filter(row => row.some(cell => String(cell || "").trim() !== ""));
    const mapping = buildMapping_(type, incomingHeaders, destination.headers);
    const existingIndex = buildExistingIndex_(type, destination);

    const skippedSourceRows = [];
    const records = incomingRows
      .map((row, index) => ({ row, sourceRowNumber: headerSelection.headerRowNumber + index + 1 }))
      .filter(item => {
        if (isProcessableIncomingRow_(type, item.row, mapping)) return true;
        skippedSourceRows.push(item.sourceRowNumber);
        return false;
      })
      .map(item => analyseIncomingRow_(type, item.row, item.sourceRowNumber, mapping, destination, existingIndex));

    const summary = buildSummary_(records, mapping);
    summary.skippedSourceRows = skippedSourceRows.length;

    return {
      analysisId: Utilities.getUuid(),
      importType: type,
      fileName,
      destinationSheet: destination.sheetName,
      incomingHeaders,
      detectedHeaderRow: headerSelection.headerRowNumber,
      requestedImportType: requestedType,
      detectedImportType: type,
      typeDetection: typeSelection.typeDetection,
      destinationHeaders: destination.headers,
      mapping,
      records,
      skippedSourceRows,
      summary,
      durationMs: Date.now() - started
    };
  }

  function commit(payload) {
    const started = Date.now();
    const analysis = payload && payload.analysis;
    const decisions = (payload && payload.decisions) || {};

    if (!analysis || !analysis.records || !analysis.mapping) {
      throw new Error("Missing import analysis. Please analyse the file again.");
    }

    const type = normaliseType_(analysis.importType);
    const destination = readDestination_(type);
    const sheet = destination.sheet;
    const headers = destination.headers;
    const columnPlan = prepareColumnResolutions_(
      sheet,
      headers,
      analysis.mapping.unresolved || [],
      decisions.columns || {}
    );
    const colByHeader = buildHeaderMap_(headers);
    const mappedFields = buildEffectiveMappedFields_(analysis.mapping, columnPlan.byIncomingIndex);

    const existingByRow = {};
    destination.rows.forEach(record => {
      existingByRow[record.rowNumber] = record.values.slice();
    });

    const updates = [];
    const creates = [];
    const skipped = [];
    let conflictsResolved = 0;

    analysis.records.forEach(record => {
      const recordDecision = decisions.records && decisions.records[record.recordId];
      if (recordDecision === "skip") {
        skipped.push(record);
        return;
      }

      if (record.match && record.match.action === "review" && !recordDecision) {
        skipped.push(record);
        return;
      }

      const manualRow = parseManualRowDecision_(recordDecision);

      if ((!record.match || record.match.action === "create") && recordDecision !== "create" && !manualRow) {
        skipped.push(record);
        return;
      }

      if (recordDecision === "create") {
        const newRow = new Array(headers.length).fill("");
        applyIncomingToRow_(newRow, mappedFields, record, colByHeader, {}, true);
        creates.push(newRow);
        return;
      }

      const targetRow = manualRow || record.match.rowNumber;

      if (!targetRow || !existingByRow[targetRow]) {
        skipped.push(record);
        return;
      }

      const rowValues = existingByRow[targetRow].slice();
      const result = applyIncomingToRow_(rowValues, mappedFields, record, colByHeader, decisions, false);
      conflictsResolved += result.conflictsResolved;

      if (result.changed) {
        updates.push({
          rowNumber: targetRow,
          changes: result.changes
        });
      }
    });

    batchWriteUpdates_(sheet, headers.length, updates);

    if (creates.length) {
      const startRow = Math.max(sheet.getLastRow() + 1, 2);
      sheet.getRange(startRow, 1, creates.length, headers.length).setValues(creates);
    }

    const result = {
      importType: type,
      sourceFilename: analysis.fileName,
      destinationSheet: destination.sheetName,
      recordsProcessed: analysis.records.length,
      recordsUpdated: updates.length,
      recordsCreated: creates.length,
      recordsSkipped: skipped.length,
      columnsAdded: columnPlan.addedHeaders.length,
      conflictsResolved,
      errors: "",
      durationMs: Date.now() - started
    };

    logImport_(result);
    return result;
  }

  function normaliseMatrix_(rows) {
    return (rows || [])
      .map(row => Array.isArray(row) ? row : [])
      .filter(row => row.length);
  }

  function normaliseType_(type) {
    return String(type || "").toLowerCase() === "group" ? "group" : "individual";
  }

  function normaliseRequestedType_(type) {
    const value = String(type || "").toLowerCase();
    if (value === "group" || value === "individual") return value;
    return "auto";
  }

  function resolveImportType_(requestedType, rows) {
    if (requestedType !== "auto") {
      const destination = readDestination_(requestedType);
      const headerSelection = selectHeaderRow_(requestedType, rows, destination.headers, { strict: true });
      return {
        type: requestedType,
        destination,
        headerSelection,
        typeDetection: {
          requestedType,
          detectedType: requestedType,
          autoDetected: false,
          confidence: 1,
          alternatives: []
        }
      };
    }

    const candidates = ["individual", "group"].map(type => {
      const destination = readDestination_(type);
      const headerSelection = selectHeaderRow_(type, rows, destination.headers, { strict: false });
      return { type, destination, headerSelection };
    });

    candidates.sort((a, b) =>
      b.headerSelection.score - a.headerSelection.score ||
      b.headerSelection.mappedCount - a.headerSelection.mappedCount
    );

    const selected = candidates[0];
    const runnerUp = candidates[1];

    if (!selected || selected.headerSelection.mappedCount === 0) {
      throw new Error("Could not identify whether this is an individual or group acceptance file. Check the upload headings.");
    }

    return {
      type: selected.type,
      destination: selected.destination,
      headerSelection: selected.headerSelection,
      typeDetection: {
        requestedType,
        detectedType: selected.type,
        autoDetected: true,
        confidence: calculateTypeConfidence_(selected, runnerUp),
        alternatives: candidates.map(candidate => ({
          type: candidate.type,
          score: candidate.headerSelection.score,
          mappedColumns: candidate.headerSelection.mappedCount,
          detectedHeaderRow: candidate.headerSelection.headerRowNumber
        }))
      }
    };
  }

  function calculateTypeConfidence_(selected, runnerUp) {
    if (!runnerUp || runnerUp.headerSelection.score <= 0) return 1;
    const score = selected.headerSelection.score;
    const next = runnerUp.headerSelection.score;
    return Math.max(0.5, Math.min(0.99, Number(((score - next) / score + 0.5).toFixed(2))));
  }

  function readDestination_(type) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = SHEETS[type];
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) throw new Error(`Destination sheet not found: ${sheetName}`);

    const values = sheet.getDataRange().getDisplayValues();
    const headers = values.length ? values[0].map(value => String(value || "").trim()) : [];
    const rows = values.slice(1).map((row, index) => ({
      rowNumber: index + 2,
      values: row
    }));

    return { sheetName, sheet, headers, rows };
  }

  function selectHeaderRow_(type, rows, destinationHeaders, options) {
    const maxScanRows = Math.min(rows.length, 10);
    const candidates = [];
    const strict = !options || options.strict !== false;

    for (let index = 0; index < maxScanRows; index++) {
      const headers = normaliseIncomingHeaders_(rows[index]);
      const mapping = buildMapping_(type, headers, destinationHeaders);
      const nonBlankCount = headers.filter(header => header !== "").length;
      const blankCount = headers.length - nonBlankCount;
      const mappedCount = mapping.mapped.length;
      const score = (mappedCount * 20) + nonBlankCount - (blankCount * 0.25) + (index === 4 ? 2 : 0);

      candidates.push({
        headerRowIndex: index,
        headerRowNumber: index + 1,
        headers,
        mappedCount,
        nonBlankCount,
        blankCount,
        score
      });
    }

    candidates.sort((a, b) =>
      b.score - a.score ||
      b.mappedCount - a.mappedCount ||
      b.nonBlankCount - a.nonBlankCount ||
      a.headerRowIndex - b.headerRowIndex
    );

    const selected = candidates[0];
    if (strict && (!selected || selected.mappedCount === 0)) {
      throw new Error("Could not detect a usable header row. Check that the upload contains acceptance form headings.");
    }

    return selected || {
      headerRowIndex: 0,
      headerRowNumber: 1,
      headers: [],
      mappedCount: 0,
      nonBlankCount: 0,
      blankCount: 0,
      score: 0
    };
  }

  function normaliseIncomingHeaders_(row) {
    return (row || []).map(value => {
      const header = String(value || "").trim();
      return isBlankHeader_(header) ? "" : header;
    });
  }

  function isBlankHeader_(header) {
    return header === "" || /^blank(?:\s*\d+)?$/i.test(header);
  }

  function buildMapping_(type, incomingHeaders, destinationHeaders) {
    const aliasMap = ImportFieldDictionary.buildAliasMap(type);
    const destinationMap = buildDestinationFieldMap_(type, destinationHeaders);
    const mapped = [];
    const unresolved = [];

    incomingHeaders.forEach((header, index) => {
      const canonicalField = aliasMap[ImportFieldDictionary.normaliseHeading(header)] || "";
      const destinationHeader = canonicalField ? destinationMap[canonicalField] || "" : "";

      const record = {
        incomingIndex: index,
        incomingHeader: header,
        canonicalField,
        canonicalLabel: canonicalField ? ImportFieldDictionary.get(type)[canonicalField].label : "",
        destinationHeader,
        suggestedDestinationHeader: destinationHeader || suggestDestinationHeader_(header, destinationHeaders)
      };

      if (canonicalField && destinationHeader) {
        mapped.push(record);
      } else {
        unresolved.push(record);
      }
    });

    return { mapped, unresolved };
  }

  function suggestDestinationHeader_(incomingHeader, destinationHeaders) {
    const incoming = normaliseHeaderKey_(incomingHeader);
    if (!incoming) return "";

    let best = { header: "", score: 0 };
    destinationHeaders.forEach(header => {
      const score = headerSimilarity_(incoming, normaliseHeaderKey_(header));
      if (score > best.score) best = { header, score };
    });

    return best.score >= 0.58 ? best.header : "";
  }

  function headerSimilarity_(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return 0.82;

    const aWords = a.split(" ").filter(Boolean);
    const bWords = b.split(" ").filter(Boolean);
    const shared = aWords.filter(word => bWords.indexOf(word) !== -1).length;
    const wordScore = shared / Math.max(aWords.length, bWords.length, 1);
    const editScore = 1 - (levenshteinDistance_(a, b) / Math.max(a.length, b.length, 1));
    return Math.max(wordScore, editScore);
  }

  function levenshteinDistance_(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }

    return matrix[b.length][a.length];
  }

  function buildDestinationFieldMap_(type, destinationHeaders) {
    const fields = ImportFieldDictionary.get(type);
    const map = {};
    const normalisedDestination = {};

    destinationHeaders.forEach(header => {
      normalisedDestination[ImportFieldDictionary.normaliseHeading(header)] = header;
    });

    Object.keys(fields).forEach(key => {
      const field = fields[key];
      const aliases = [field.label].concat(field.aliases || []);

      for (const alias of aliases) {
        const header = normalisedDestination[ImportFieldDictionary.normaliseHeading(alias)];
        if (header) {
          map[key] = header;
          return;
        }
      }
    });

    return map;
  }

  function buildHeaderMap_(headers) {
    const map = {};
    headers.forEach((header, index) => {
      map[header] = index;
    });
    return map;
  }

  function prepareColumnResolutions_(sheet, headers, unresolved, columnDecisions) {
    const byIncomingIndex = {};
    const addedHeaders = [];
    const existingHeaders = {};
    headers.forEach(header => existingHeaders[normaliseHeaderKey_(header)] = header);

    (unresolved || []).forEach(item => {
      const decision = columnDecisions[String(item.incomingIndex)];
      if (!decision || decision.action === "ignore") return;

      if (decision.action === "map") {
        const destinationHeader = String(decision.destinationHeader || "").trim();
        if (!destinationHeader || headers.indexOf(destinationHeader) === -1) return;
        byIncomingIndex[item.incomingIndex] = {
          action: "map",
          destinationHeader
        };
        return;
      }

      if (decision.action === "add") {
        const requestedHeader = cleanNewHeader_(decision.newHeader || item.incomingHeader);
        if (!requestedHeader) return;

        const destinationHeader = makeUniqueHeader_(requestedHeader, existingHeaders);
        existingHeaders[normaliseHeaderKey_(destinationHeader)] = destinationHeader;
        headers.push(destinationHeader);
        addedHeaders.push(destinationHeader);
        byIncomingIndex[item.incomingIndex] = {
          action: "add",
          destinationHeader
        };
      }
    });

    if (addedHeaders.length) {
      const startColumn = headers.length - addedHeaders.length + 1;
      const requiredColumns = startColumn + addedHeaders.length - 1;
      if (sheet.getMaxColumns() < requiredColumns) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredColumns - sheet.getMaxColumns());
      }
      sheet.getRange(1, startColumn, 1, addedHeaders.length).setValues([addedHeaders]);
    }

    return { byIncomingIndex, addedHeaders };
  }

  function buildEffectiveMappedFields_(mapping, columnPlan) {
    const mapped = (mapping.mapped || []).filter(item => item.destinationHeader).slice();

    (mapping.unresolved || []).forEach(item => {
      const plan = columnPlan[item.incomingIndex];
      if (!plan || !plan.destinationHeader) return;
      mapped.push(Object.assign({}, item, {
        canonicalField: item.canonicalField || `custom:${item.incomingIndex}`,
        canonicalLabel: item.canonicalLabel || item.incomingHeader,
        destinationHeader: plan.destinationHeader
      }));
    });

    return mapped;
  }

  function cleanNewHeader_(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function normaliseHeaderKey_(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function makeUniqueHeader_(header, existingHeaders) {
    let candidate = header;
    let count = 2;
    while (existingHeaders[normaliseHeaderKey_(candidate)]) {
      candidate = `${header} ${count}`;
      count++;
    }
    return candidate;
  }

  function buildExistingIndex_(type, destination) {
    const headerMap = buildHeaderMap_(destination.headers);
    const indexes = {
      applicationId: {},
      studentId: {},
      srn: {},
      nameSchool: {},
      nameDob: {},
      nameParentEmail: {},
      schoolCodeItem: {},
      schoolItem: {},
      schoolGroup: {},
      bySchool: {},
      bySchoolCode: {},
      fuzzy: []
    };

    destination.rows.forEach(record => {
      const values = record.values;
      const get = header => values[headerMap[header]] || "";
      const rowRef = {
        rowNumber: record.rowNumber,
        values
      };

      const appId = normaliseKey_(get(findHeader_(destination.headers, ["Application ID", "ApplicationId", "Submission ID"])));
      const studentId = normaliseKey_(get(findHeader_(destination.headers, ["Student ID"])));
      const srn = normaliseKey_(get(findHeader_(destination.headers, ["SRN"])));
      const first = normaliseName_(get(findHeader_(destination.headers, ["Student First Name", "First Name"])));
      const last = normaliseName_(get(findHeader_(destination.headers, ["Student Last Name", "Last Name", "Surname"])));
      const full = normaliseName_(get(findHeader_(destination.headers, ["Student Name", "Full Name"])) || `${first} ${last}`);
      const school = normaliseName_(get(findHeader_(destination.headers, ["Current School", "School", "School Name"])));
      const dob = normaliseKey_(get(findHeader_(destination.headers, ["Date of Birth", "DOB"])));
      const parentEmail = normaliseEmail_(get(findHeader_(destination.headers, ["Parent Email", "Parent/Carer Email", "Primary Parent Email"])));
      const schoolCode = normaliseKey_(get(findHeader_(destination.headers, ["School Code", "Code"])));
      const item = normaliseCategory_(get(findHeader_(destination.headers, ["Item", "Category", "Discipline"])));
      const groupName = normaliseName_(get(findHeader_(destination.headers, ["Group Name"])));

      addIndex_(indexes.applicationId, appId, rowRef);
      addIndex_(indexes.studentId, studentId, rowRef);
      addIndex_(indexes.srn, srn, rowRef);
      addIndex_(indexes.nameSchool, [first, last, school].join("|"), rowRef);
      addIndex_(indexes.nameSchool, [full, school].join("|"), rowRef);
      addIndex_(indexes.nameDob, [full, dob].join("|"), rowRef);
      addIndex_(indexes.nameParentEmail, [full, parentEmail].join("|"), rowRef);
      addIndex_(indexes.schoolCodeItem, [schoolCode, item].join("|"), rowRef);
      addIndex_(indexes.schoolItem, [school, item].join("|"), rowRef);
      addIndex_(indexes.schoolGroup, [school, groupName].join("|"), rowRef);
      addIndex_(indexes.bySchool, school, rowRef);
      addIndex_(indexes.bySchoolCode, schoolCode, rowRef);

      indexes.fuzzy.push({ rowNumber: record.rowNumber, first, last, full, school, item, groupName, values });
    });

    return indexes;
  }

  function analyseIncomingRow_(type, row, sourceRowNumber, mapping, destination, existingIndex) {
    const recordId = `r${sourceRowNumber}`;
    const incoming = {};

    mapping.mapped.forEach(item => {
      incoming[item.canonicalField] = row[item.incomingIndex];
    });

    const match = findMatch_(type, incoming, existingIndex);
    const suggestions = type === "group" ? getGroupMatchSuggestions_(incoming, existingIndex, destination.headers) : [];
    const conflicts = [];

    if (match && match.rowNumber) {
      const existing = destination.rows.find(item => item.rowNumber === match.rowNumber);
      const headerMap = buildHeaderMap_(destination.headers);

      mapping.mapped.forEach(item => {
        const incomingValue = cleanValue_(row[item.incomingIndex]);
        if (incomingValue === "") return;

        const existingValue = cleanValue_(existing.values[headerMap[item.destinationHeader]]);

        if (existingValue !== "" && !valuesEquivalent_(item, existingValue, incomingValue)) {
          conflicts.push({
            conflictId: `${recordId}:${item.destinationHeader}`,
            canonicalField: item.canonicalField,
            canonicalLabel: item.canonicalLabel,
            destinationHeader: item.destinationHeader,
            existingValue,
            incomingValue,
            confidence: match.confidence,
            recommendedChoice: "keep"
          });
        }
      });
    }

    return {
      recordId,
      sourceRowNumber,
      incoming,
      raw: row,
      match: match || { action: "create", confidence: 1, reason: "No reliable existing match found" },
      suggestions,
      conflicts,
      requiresReview: conflicts.length > 0 || (match && match.action === "review")
    };
  }

  function isProcessableIncomingRow_(type, row, mapping) {
    const incoming = {};
    (mapping.mapped || []).forEach(item => {
      incoming[item.canonicalField] = cleanValue_(row[item.incomingIndex]);
    });

    if (type === "group") {
      const hasSchool = Boolean(incoming.school || incoming.schoolCode || incoming.applicationId);
      const hasGroupIdentity = Boolean(incoming.item || incoming.category || incoming.discipline || incoming.groupName);
      return hasSchool && hasGroupIdentity;
    }

    const hasStudent = Boolean(incoming.applicationId || incoming.studentId || incoming.srn || incoming.fullName || (incoming.firstName && incoming.lastName));
    const hasContext = Boolean(incoming.school || incoming.dob || incoming.parentEmail);
    return hasStudent && hasContext;
  }

  function findMatch_(type, incoming, indexes) {
    if (type === "group") return findGroupMatch_(incoming, indexes);
    return findIndividualMatch_(incoming, indexes);
  }

  function findIndividualMatch_(incoming, indexes) {
    const first = normaliseName_(incoming.firstName);
    const last = normaliseName_(incoming.lastName);
    const full = normaliseName_(incoming.fullName || `${incoming.firstName || ""} ${incoming.lastName || ""}`);
    const school = normaliseName_(incoming.school);
    const dob = normaliseKey_(incoming.dob);
    const parentEmail = normaliseEmail_(incoming.parentEmail);

    return firstMatch_(indexes.applicationId, normaliseKey_(incoming.applicationId), 1, "Application ID") ||
      firstMatch_(indexes.studentId, normaliseKey_(incoming.studentId), 0.98, "Student ID") ||
      firstMatch_(indexes.srn, normaliseKey_(incoming.srn), 0.97, "SRN") ||
      firstMatch_(indexes.nameSchool, [first, last, school].join("|"), 0.92, "Exact first name + last name + school") ||
      firstMatch_(indexes.nameSchool, [full, school].join("|"), 0.9, "Full name + school") ||
      firstMatch_(indexes.nameDob, [full, dob].join("|"), 0.88, "Full name + DOB") ||
      firstMatch_(indexes.nameParentEmail, [full, parentEmail].join("|"), 0.86, "Full name + parent email") ||
      fuzzyIndividualMatch_(first, last, full, school, indexes.fuzzy);
  }

  function findGroupMatch_(incoming, indexes) {
    const schoolCode = normaliseKey_(incoming.schoolCode);
    const school = normaliseName_(incoming.school);
    const item = normaliseCategory_(incoming.item || incoming.category || incoming.discipline);
    const groupName = normaliseName_(incoming.groupName);

    return firstMatch_(indexes.applicationId, normaliseKey_(incoming.applicationId), 1, "Application ID") ||
      firstMatch_(indexes.schoolCodeItem, [schoolCode, item].join("|"), 0.94, "School code + item/category") ||
      firstMatch_(indexes.schoolItem, [school, item].join("|"), 0.9, "School name + item/category") ||
      firstMatch_(indexes.schoolGroup, [school, groupName].join("|"), 0.88, "School + group name") ||
      fuzzyGroupMatch_(school, item, groupName, indexes.fuzzy);
  }

  function getGroupMatchSuggestions_(incoming, indexes, headers) {
    const school = normaliseName_(incoming.school);
    const schoolCode = normaliseKey_(incoming.schoolCode);
    const item = normaliseCategory_(incoming.item || incoming.category || incoming.discipline);
    const groupName = normaliseName_(incoming.groupName);
    const hasSchoolPool = Boolean(school && indexes.bySchool[school] && indexes.bySchool[school].length);
    const hasSchoolCodePool = Boolean(schoolCode && indexes.bySchoolCode[schoolCode] && indexes.bySchoolCode[schoolCode].length);
    const pool = hasSchoolPool
      ? indexes.bySchool[school]
      : hasSchoolCodePool
      ? indexes.bySchoolCode[schoolCode]
      : indexes.fuzzy;

    const headerMap = buildHeaderMap_(headers);
    const itemHeader = findHeader_(headers, ["Item", "Category", "Discipline"]);
    const categoryHeader = findHeader_(headers, ["Category", "Category selection"]);
    const schoolHeader = findHeader_(headers, ["School name", "School", "Current School"]);
    const groupHeader = findHeader_(headers, ["Dance group name (if group is made up of multiple schools)", "Group Name", "Dance group name"]);
    const countHeader = findHeader_(headers, ["Accepted?", "# Alloc", "Accepted? / # Alloc"]);

    return pool
      .map(record => {
        const values = record.values || [];
        const existingItem = cleanValue_(values[headerMap[itemHeader]]);
        const existingCategory = cleanValue_(values[headerMap[categoryHeader]]);
        const existingSchool = cleanValue_(values[headerMap[schoolHeader]]) || record.school || "";
        const existingGroupName = cleanValue_(values[headerMap[groupHeader]]);
        const existingCount = cleanValue_(values[headerMap[countHeader]]);
        const itemScore = item ? Math.max(similarity_(item, normaliseCategory_(existingItem)), similarity_(item, normaliseCategory_(existingCategory))) : 0;
        const groupScore = groupName ? similarity_(groupName, existingGroupName) : 0;
        const schoolScore = school ? similarity_(school, normaliseName_(existingSchool)) : (hasSchoolCodePool ? 1 : 0);
        const score = (schoolScore * 0.45) + (Math.max(itemScore, groupScore) * 0.55);

        return {
          rowNumber: record.rowNumber,
          school: existingSchool,
          item: existingItem,
          category: existingCategory,
          groupName: existingGroupName,
          count: existingCount,
          score: Number(score.toFixed(2))
        };
      })
      .filter(item => item.score >= 0.45 || hasSchoolCodePool || (school && normaliseName_(item.school) === school))
      .sort((a, b) => b.score - a.score || a.rowNumber - b.rowNumber)
      .slice(0, 5);
  }

  function firstMatch_(index, key, confidence, reason) {
    if (!key || key.replace(/\|/g, "") === "") return null;
    const matches = index[key] || [];
    if (matches.length === 1) {
      return { action: "update", rowNumber: matches[0].rowNumber, confidence, reason };
    }
    if (matches.length > 1) {
      return {
        action: "review",
        rowNumber: matches[0].rowNumber,
        possibleRows: matches.map(match => match.rowNumber),
        confidence: Math.min(confidence, 0.75),
        reason: `${reason}; multiple possible rows`
      };
    }
    return null;
  }

  function fuzzyIndividualMatch_(first, last, full, school, rows) {
    if (!full && (!first || !last)) return null;
    const possible = rows
      .map(row => {
        const nameScore = similarity_(full || `${first} ${last}`, row.full || `${row.first} ${row.last}`);
        const schoolScore = school && row.school ? similarity_(school, row.school) : 0;
        return { rowNumber: row.rowNumber, score: (nameScore * 0.75) + (schoolScore * 0.25) };
      })
      .filter(item => item.score >= 0.78)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!possible.length) return null;

    return {
      action: "review",
      rowNumber: possible[0].rowNumber,
      possibleRows: possible.map(item => item.rowNumber),
      confidence: Number(possible[0].score.toFixed(2)),
      reason: "Fuzzy possible match; manual review required"
    };
  }

  function fuzzyGroupMatch_(school, item, groupName, rows) {
    if (!school) return null;
    const possible = rows
      .map(row => {
        const schoolScore = similarity_(school, row.school);
        const itemScore = item && row.item ? similarity_(item, row.item) : 0;
        const groupScore = groupName && row.groupName ? similarity_(groupName, row.groupName) : 0;
        const categoryOrGroupScore = Math.max(itemScore, groupScore);
        return { rowNumber: row.rowNumber, score: (schoolScore * 0.45) + (categoryOrGroupScore * 0.55), categoryOrGroupScore };
      })
      .filter(item => item.score >= 0.82 && item.categoryOrGroupScore >= 0.72)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!possible.length) return null;

    return {
      action: "review",
      rowNumber: possible[0].rowNumber,
      possibleRows: possible.map(item => item.rowNumber),
      confidence: Number(possible[0].score.toFixed(2)),
      reason: "Fuzzy possible match; manual review required"
    };
  }

  function applyIncomingToRow_(rowValues, mappedFields, record, colByHeader, decisions, isCreate) {
    let changed = false;
    let conflictsResolved = 0;
    const changes = [];

    mappedFields.forEach(item => {
      const incomingValue = normaliseImportValue_(item, record.raw[item.incomingIndex]);
      if (incomingValue === "") return;

      const col = colByHeader[item.destinationHeader];
      if (col === undefined) return;

      const existingValue = normaliseImportValue_(item, rowValues[col]);
      const conflictId = `${record.recordId}:${item.destinationHeader}`;
      const fieldDecision = (decisions.conflicts && decisions.conflicts[conflictId]) ||
        (decisions.fields && decisions.fields[item.destinationHeader]) ||
        (existingValue && !valuesEquivalent_(item, existingValue, incomingValue) ? "keep" : "incoming");

      if (!isCreate && existingValue && !valuesEquivalent_(item, existingValue, incomingValue) && fieldDecision !== "incoming" && fieldDecision !== "merge") {
        conflictsResolved++;
        return;
      }

      const nextValue = fieldDecision === "merge" && existingValue
        ? mergeValues_(existingValue, incomingValue)
        : incomingValue;

      if (!valuesEquivalent_(item, rowValues[col], nextValue)) {
        rowValues[col] = nextValue;
        changes.push({ col, value: nextValue });
        changed = true;
      }
    });

    return { changed, conflictsResolved, changes };
  }

  function batchWriteUpdates_(sheet, width, updates) {
    if (!updates.length) return;

    const byColumn = {};

    updates.forEach(update => {
      (update.changes || []).forEach(change => {
        const key = String(change.col);
        if (!byColumn[key]) byColumn[key] = [];
        byColumn[key].push({
          rowNumber: update.rowNumber,
          value: change.value
        });
      });
    });

    Object.keys(byColumn).forEach(colText => {
      const col = Number(colText) + 1;
      const cells = byColumn[colText].sort((a, b) => a.rowNumber - b.rowNumber);
      let batch = [];

      function flush() {
        if (!batch.length) return;
        sheet.getRange(batch[0].rowNumber, col, batch.length, 1)
          .setValues(batch.map(item => [item.value]));
        batch = [];
      }

      cells.forEach(cell => {
        if (!batch.length || cell.rowNumber === batch[batch.length - 1].rowNumber + 1) {
          batch.push(cell);
        } else {
          flush();
          batch.push(cell);
        }
      });

      flush();
    });
  }

  function parseManualRowDecision_(decision) {
    const match = String(decision || "").match(/^row:(\d+)$/);
    return match ? Number(match[1]) : 0;
  }

  function logImport_(result) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.history);
    if (!sheet) sheet = ss.insertSheet(SHEETS.history);

    const headers = [
      "Timestamp",
      "User Email",
      "Import Type",
      "Source Filename",
      "Records Processed",
      "Records Updated",
      "Records Created",
      "Records Skipped",
      "Conflicts Resolved",
      "Errors",
      "Duration",
      "Destination Sheet"
    ];

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      try {
        sheet.hideSheet();
      } catch (err) {}
    }

    sheet.appendRow([
      new Date(),
      UserContextService.getEmail(),
      result.importType,
      result.sourceFilename,
      result.recordsProcessed,
      result.recordsUpdated,
      result.recordsCreated,
      result.recordsSkipped,
      result.conflictsResolved,
      result.errors,
      result.durationMs,
      result.destinationSheet
    ]);
  }

  function buildSummary_(records, mapping) {
    const matched = records.filter(record => record.match && record.match.action === "update").length;
    const fuzzy = records.filter(record => record.match && record.match.action === "review").length;
    const create = records.filter(record => !record.match || record.match.action === "create").length;
    const conflicts = records.reduce((total, record) => total + record.conflicts.length, 0);

    return {
      recordsProcessed: records.length,
      recordsMatched: matched,
      recordsToCreate: create,
      recordsRequiringReview: fuzzy + records.filter(record => record.conflicts.length).length,
      conflicts,
      mappedColumns: mapping.mapped.length,
      unresolvedColumns: mapping.unresolved.length,
      warnings: mapping.unresolved.map(item => `Unresolved column: ${item.incomingHeader}`)
    };
  }

  function findHeader_(headers, possible) {
    const normalised = {};
    headers.forEach(header => normalised[ImportFieldDictionary.normaliseHeading(header)] = header);

    for (const header of possible) {
      const found = normalised[ImportFieldDictionary.normaliseHeading(header)];
      if (found) return found;
    }

    return "";
  }

  function addIndex_(index, key, value) {
    if (!key || key.replace(/\|/g, "") === "") return;
    if (!index[key]) index[key] = [];
    index[key].push(value);
  }

  function normaliseKey_(value) {
    return String(value || "").trim().toLowerCase().replace(/\.0$/, "");
  }

  function normaliseEmail_(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normaliseName_(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normaliseCategory_(value) {
    return normaliseName_(canonicalCategoryValue_(value));
  }

  function canonicalCategoryValue_(value) {
    const original = cleanValue_(value);
    const normalised = normaliseName_(original);
    if (!normalised) return "";

    for (const item of CATEGORY_CANONICAL) {
      const aliases = [item.value].concat(item.aliases || []);
      if (aliases.some(alias => normaliseName_(alias) === normalised)) {
        return item.value;
      }
    }

    return original;
  }

  function isCategoryField_(item) {
    const field = normaliseName_(item && item.canonicalField);
    const header = normaliseName_(item && item.destinationHeader);
    return field === "category" ||
      field === "item" ||
      field === "discipline" ||
      header === "category" ||
      header === "item" ||
      header === "discipline";
  }

  function normaliseImportValue_(item, value) {
    const cleaned = cleanValue_(value);
    return isCategoryField_(item) ? canonicalCategoryValue_(cleaned) : cleaned;
  }

  function valuesEquivalent_(item, left, right) {
    const leftValue = normaliseImportValue_(item, left);
    const rightValue = normaliseImportValue_(item, right);
    if (isCategoryField_(item)) {
      return normaliseCategory_(leftValue) === normaliseCategory_(rightValue);
    }
    return cleanValue_(leftValue) === cleanValue_(rightValue);
  }

  function cleanValue_(value) {
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function mergeValues_(a, b) {
    const values = [cleanValue_(a), cleanValue_(b)].filter(Boolean);
    return Array.from(new Set(values)).join("; ");
  }

  function similarity_(a, b) {
    const left = normaliseName_(a);
    const right = normaliseName_(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return 0.88;

    const leftParts = new Set(left.split(" "));
    const rightParts = new Set(right.split(" "));
    const overlap = Array.from(leftParts).filter(part => rightParts.has(part)).length;
    return overlap / Math.max(leftParts.size, rightParts.size);
  }

  return {
    analyse,
    commit
  };
})();
