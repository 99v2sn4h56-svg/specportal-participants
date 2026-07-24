/*************************************************************
 * GROUP COMPUTED COLUMNS SYNC
 *
 * GROUPS(YES) benchmarked at ~1.9-2.0s per getValues() read versus
 * ~0.8s for INDIVIDUALS(YES), despite having fewer cells (32,226 vs
 * 45,903). The gap tracked formula density almost exactly: 2,922 formula
 * cells in GROUPS(YES) (9% of cells) vs 1,437 in INDIVIDUALS(YES) (3%),
 * even though none of them are volatile or cross-workbook. Six columns
 * account for ~2,300 of those 2,922 cells and are mostly derived from
 * other same-row (or Schools Master Dataset lookup) values:
 *   - Region              (was: XLOOKUP against Schools Master Dataset)
 *   - Principal Network   (was: XLOOKUP against Schools Master Dataset)
 *   - Total                (was: Cost per student * # Alloc)
 *   - Calculation sentence (was: CONCATENATE of the above)
 *   - Shirt Category       (was: CONCATENATE of School name/Category/# Alloc)
 *   - All Teacher Emails   (was: CONCATENATE of the two contact teacher emails)
 *
 * This file recomputes those 6 columns in script and writes plain values,
 * removing that formula-read cost from every SpecCentral load.
 *
 * SAFETY RULE: a target cell is only ever overwritten if it currently
 * contains a live formula. Any cell that's already a static value is left
 * completely untouched. This matters because a dry-run comparison found
 * ~11 rows (e.g. "SpecFest Flash Mob" entries with no per-student cost)
 * where a staff member had manually overwritten the Total formula with a
 * hand-entered number -- blindly recomputing those would have replaced
 * real fee data with $0. Gating on "is this currently a formula" protects
 * every such historical override, in every column, without needing to
 * know why each one exists.
 *
 * All source and target columns are located by header text (reorder-safe),
 * matching the convention already used for costume/T-shirt/acceptance
 * tools. GROUPS(YES) has two columns both headed "School name" -- H (the
 * form-entered name, used in Shirt Category) and W (the school-selector
 * value used as the Schools Master Dataset lookup key). These can only be
 * told apart by column order within the duplicate pair, not by header text
 * alone; gccAllIndicesForHeader_ resolves them in sheet order.
 *************************************************************/

function gccHeaderMap_(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const clean = String(header || "").trim();
    if (clean && map[clean] === undefined) map[clean] = index;
  });
  return map;
}

function gccAllIndicesForHeader_(headers, headerText) {
  const indices = [];
  headers.forEach((header, index) => {
    if (String(header || "").trim() === headerText) indices.push(index);
  });
  return indices;
}

function gccRequireColumn_(map, headerText) {
  const index = map[headerText];
  if (index === undefined) {
    throw new Error(`Group Computed Columns Sync: expected a column headed "${headerText}" but none was found. The sheet structure may have changed -- update Group Computed Columns Sync.js before running this again.`);
  }
  return index;
}

function gccNormaliseSchoolKey_(value) {
  return String(value || "").trim().toLowerCase();
}

function gccBuildSchoolsMasterLookup_(ss) {
  const masterSheet = ss.getSheetByName("Schools Master Dataset");
  const lookup = {};
  if (!masterSheet) return lookup;

  const masterLastRow = masterSheet.getLastRow();
  const masterLastColumn = masterSheet.getLastColumn();
  if (masterLastRow < 2) return lookup;

  const masterHeaders = masterSheet.getRange(1, 1, 1, masterLastColumn).getValues()[0];
  const masterMap = gccHeaderMap_(masterHeaders);
  const schoolCol = gccRequireColumn_(masterMap, "School");
  const directorateCol = gccRequireColumn_(masterMap, "Directorate");
  const principalNetworkCol = gccRequireColumn_(masterMap, "Principal Network");

  const masterValues = masterSheet.getRange(2, 1, masterLastRow - 1, masterLastColumn).getValues();
  masterValues.forEach(row => {
    const key = gccNormaliseSchoolKey_(row[schoolCol]);
    if (key && lookup[key] === undefined) {
      lookup[key] = { region: row[directorateCol], principalNetwork: row[principalNetworkCol], rawName: row[schoolCol] };
    }
  });
  return lookup;
}

const GCC_TARGET_FIELDS = ["region", "principalNetwork", "total", "calcSentence", "shirtCategory", "allTeacherEmails"];

/**
 * Computes the 6 derived columns for every data row of GROUPS(YES), and
 * records which target cells are currently live formulas vs already-static
 * values. Returns everything the diagnostic and the real sync both need,
 * so they always agree on what's safe to touch.
 */
function gccComputeDerivedColumns_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("GROUPS(YES)");
  if (!sheet) throw new Error("Group Computed Columns Sync: GROUPS(YES) sheet not found.");

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2) return { sheet, columns: {}, sourceRows: [], sourceFormulas: [], computed: [] };

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const map = gccHeaderMap_(headers);

  const schoolNameIndices = gccAllIndicesForHeader_(headers, "School name");
  const schoolNamePrimaryCol = schoolNameIndices[0];
  const schoolNameLookupCol = schoolNameIndices.length > 1 ? schoolNameIndices[1] : schoolNameIndices[0];

  const columns = {
    categoryCol: gccRequireColumn_(map, "Category"),
    allocCol: gccRequireColumn_(map, "# Alloc"),
    costPerStudentCol: gccRequireColumn_(map, "Cost per student"),
    teacherEmail1Col: gccRequireColumn_(map, "Contact teacher email (1)"),
    teacherEmail2Col: gccRequireColumn_(map, "Contact teacher email (2)"),
    regionCol: gccRequireColumn_(map, "Region"),
    principalNetworkCol: gccRequireColumn_(map, "Principal Network"),
    totalCol: gccRequireColumn_(map, "Total"),
    calcSentenceCol: gccRequireColumn_(map, "Calculation sentence"),
    shirtCategoryCol: gccRequireColumn_(map, "Shirt Category"),
    allTeacherEmailsCol: gccRequireColumn_(map, "All Teacher Emails"),
    schoolNamePrimaryCol,
    schoolNameLookupCol
  };

  const fieldToColumn = {
    region: columns.regionCol,
    principalNetwork: columns.principalNetworkCol,
    total: columns.totalCol,
    calcSentence: columns.calcSentenceCol,
    shirtCategory: columns.shirtCategoryCol,
    allTeacherEmails: columns.allTeacherEmailsCol
  };

  const masterLookup = gccBuildSchoolsMasterLookup_(ss);
  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
  const sourceRows = dataRange.getValues();
  const sourceFormulas = dataRange.getFormulas();

  const computed = sourceRows.map((row, i) => {
    const schoolNamePrimary = row[columns.schoolNamePrimaryCol] || "";
    const schoolNameLookup = row[columns.schoolNameLookupCol] || "";
    const category = row[columns.categoryCol] || "";
    const allocRaw = row[columns.allocCol];
    const alloc = Number(allocRaw) || 0;
    const allocDisplay = allocRaw === "" || allocRaw === null || allocRaw === undefined ? "" : String(allocRaw);
    const costPerStudent = Number(row[columns.costPerStudentCol]) || 0;
    const teacherEmail1 = String(row[columns.teacherEmail1Col] || "").trim();
    const teacherEmail2 = String(row[columns.teacherEmail2Col] || "").trim();

    const match = masterLookup[gccNormaliseSchoolKey_(schoolNameLookup)];
    const region = match ? match.region : "";
    const principalNetwork = match ? match.principalNetwork : "";
    const total = costPerStudent * alloc;
    const shirtCategory = `${schoolNamePrimary} - ${category} (${allocDisplay} students)`;
    const calcSentence = `${category} - $${costPerStudent} per student\n${allocDisplay} students x $${costPerStudent} = $${total}`;
    const allTeacherEmails = [teacherEmail1, teacherEmail2].filter(Boolean).join("; ");

    const isFormula = {};
    GCC_TARGET_FIELDS.forEach(field => {
      isFormula[field] = !!sourceFormulas[i][fieldToColumn[field]];
    });

    return { region, principalNetwork, total, shirtCategory, calcSentence, allTeacherEmails, isFormula, lookupMatched: !!match, schoolNameLookup };
  });

  return { sheet, columns, fieldToColumn, sourceRows, sourceFormulas, computed, masterLookup };
}

/**
 * Sanity-check tool -- compares gccComputeDerivedColumns_()'s script output
 * against GROUPS(YES)'s current values, but ONLY for cells that are
 * currently live formulas (per the safety rule above). Cells that are
 * already static are reported separately as "preserved", never as a
 * mismatch, since syncGroupComputedColumns will never touch them. Safe to
 * re-run any time -- read-only, writes nothing. Useful to re-check after
 * GROUPS(YES)'s column structure changes, since gccRequireColumn_ will
 * throw a clear error here (rather than syncGroupComputedColumns silently
 * writing to the wrong column) if an expected header goes missing.
 */
function adminDiagnoseGroupComputedColumnsSync() {
  requirePortalCapability_("Administration.View");
  const { fieldToColumn, sourceRows, computed } = gccComputeDerivedColumns_();

  const comparableFields = ["region", "principalNetwork", "total", "shirtCategory", "allTeacherEmails"];

  const cosmeticEmailMismatches = [];
  const substantiveMismatches = [];
  let preservedStaticCells = 0;

  computed.forEach((row, i) => {
    comparableFields.forEach(field => {
      if (!row.isFormula[field]) {
        preservedStaticCells++;
        return; // static cell -- sync will never touch it, so it can never mismatch.
      }
      const colIndex = fieldToColumn[field];
      const current = sourceRows[i][colIndex];
      const next = row[field];
      const currentStr = current === null || current === undefined ? "" : String(current).trim();
      const nextStr = next === null || next === undefined ? "" : String(next).trim();
      if (currentStr === nextStr) return;

      const entry = { row: i + 2, field, current: currentStr, computed: nextStr };
      if (field === "region" || field === "principalNetwork") {
        entry.lookupKey = row.schoolNameLookup;
        entry.lookupMatched = row.lookupMatched;
      }

      const isCosmeticEmail = field === "allTeacherEmails" &&
        currentStr.replace(/[,;]\s*/g, "|").split("|").filter(Boolean).sort().join(",") ===
        nextStr.replace(/[,;]\s*/g, "|").split("|").filter(Boolean).sort().join(",");
      (isCosmeticEmail ? cosmeticEmailMismatches : substantiveMismatches).push(entry);
    });
  });

  const result = {
    generatedAt: new Date().toISOString(),
    totalDataRows: computed.length,
    preservedStaticCells,
    cosmeticEmailMismatchCount: cosmeticEmailMismatches.length,
    cosmeticEmailMismatchSample: cosmeticEmailMismatches.slice(0, 5),
    substantiveMismatchCount: substantiveMismatches.length,
    substantiveMismatches,
    calculationSentenceSample: computed.slice(0, 3).map((row, i) => ({
      row: i + 2,
      isFormula: row.isFormula.calcSentence,
      current: sourceRows[i][fieldToColumn.calcSentence],
      computed: row.calcSentence
    }))
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Writes a single target column, skipping any row marked !write entirely --
 * not even rewriting it with its own current value. That matters: a cell
 * can hold a legacy value that already violates a data validation rule on
 * that column (grandfathered in), and Sheets re-validates on every write
 * regardless of whether the value actually changes. Writing only
 * contiguous runs of rows that ARE changing means a static/preserved cell
 * is never touched by this call at all, so it can never trip that.
 */
function gccWriteColumnChunks_(sheet, colIndex, firstDataRow, rows) {
  let written = 0;
  let i = 0;
  while (i < rows.length) {
    if (!rows[i].write) { i++; continue; }
    let j = i;
    const chunk = [];
    while (j < rows.length && rows[j].write) {
      chunk.push([rows[j].value]);
      j++;
    }
    sheet.getRange(firstDataRow + i, colIndex + 1, chunk.length, 1).setValues(chunk);
    written += chunk.length;
    i = j;
  }
  return written;
}

/**
 * Writes the 6 derived columns as plain values -- but only into cells that
 * are currently live formulas, and ONLY those 6 columns (never a whole
 * row). Any cell that's already static (a manual override, or unrelated
 * columns like Notes) is left completely untouched. Only run this for real
 * after adminDiagnoseGroupComputedColumnsSync has shown zero substantive
 * mismatches among the live-formula cells -- see the header comment on
 * this file.
 */
function syncGroupComputedColumns() {
  const { sheet, fieldToColumn, computed } = gccComputeDerivedColumns_();
  if (!computed.length) return;

  let cellsWritten = 0;
  GCC_TARGET_FIELDS.forEach(field => {
    const colIndex = fieldToColumn[field];
    const rows = computed.map(row => ({ write: row.isFormula[field], value: row[field] }));
    cellsWritten += gccWriteColumnChunks_(sheet, colIndex, 2, rows);
  });

  // Deliberately NOT calling PerformanceCacheService.remove("participants:groups")
  // here. This function runs unattended every 5 minutes via the installed
  // trigger; a hard remove() forces every concurrent reader into the
  // lease-protected cold-rebuild path in PerformanceCacheService.js
  // (LockService wait, then a 10s poll, then CACHE_REBUILD_BUSY for
  // stragglers) -- a thundering herd, repeating every 5 minutes instead of
  // rarely. getOrLoadStaleWhileRevalidate already serves the previous
  // (briefly stale) value instantly to every reader in the meantime, so the
  // cache catches up on its own via the existing 5-minute freshness window
  // without ever forcing a synchronous rebuild storm.
  Logger.log(`syncGroupComputedColumns: wrote ${cellsWritten} cells across ${computed.length} rows, touching only the 6 target columns.`);
}

/**
 * One-time setup -- installs a 5-minute recurring trigger for
 * syncGroupComputedColumns(), matching the participants cache TTL. Safe to
 * run again; clears any existing trigger for this handler first.
 */
function installGroupComputedColumnsSyncTrigger() {
  const ui = SpreadsheetApp.getUi();
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === "syncGroupComputedColumns")
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("syncGroupComputedColumns").timeBased().everyMinutes(5).create();
  ui.alert("Group Computed Columns auto-sync installed -- refreshes automatically every 5 minutes.");
}
