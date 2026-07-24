/**
 * Replaces the "Show Run" tab's live =QUERY(IMPORTRANGE(...)) formula with
 * a periodically-refreshed static snapshot of the same authoritative
 * source ShowRunService.js already reads directly via script
 * (SourceRegistryService's "show-run" config) -- nothing in the app reads
 * this tab itself, it was a manual reference copy. A live cross-spreadsheet
 * formula forces Sheets to coordinate with the external spreadsheet on
 * every recalculation, which was adding latency to every read of this
 * whole workbook, not just this one tab. This keeps the tab useful and
 * roughly current without that live formula sitting in the workbook.
 */
function syncShowRunSnapshot() {
  const ui = SpreadsheetApp.getUi();
  const source = SourceRegistryService.getSourceConfig("show-run");

  if (!source || !source.spreadsheetId || source.sheetId == null) {
    ui.alert("Show Run source configuration is incomplete.");
    return;
  }

  const sourceSpreadsheet = SpreadsheetApp.openById(source.spreadsheetId);
  const sourceSheet = sourceSpreadsheet.getSheets().find(sheet => Number(sheet.getSheetId()) === Number(source.sheetId));

  if (!sourceSheet) {
    ui.alert(`Show Run source sheet ${source.sheetId} was not found.`);
    return;
  }

  const values = sourceSheet.getDataRange().getDisplayValues();

  const targetSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let targetSheet = targetSpreadsheet.getSheetByName("Show Run");
  if (!targetSheet) targetSheet = targetSpreadsheet.insertSheet("Show Run");

  // Read-only reference copy, not teacher/staff-entered data -- safe to
  // fully overwrite every sync, same as this project's other sync-report
  // sheets. clearContents() (not clear()) keeps any existing formatting.
  targetSheet.clearContents();
  if (values.length && values[0].length) {
    targetSheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  }
  targetSheet.getRange(1, 1).setNote(
    `Static snapshot synced ${new Date().toLocaleString()}. This tab is a read-only reference copy -- ` +
    `the live app reads directly from the source spreadsheet, not from here. Edits made directly in this ` +
    `tab will be overwritten on the next sync.`
  );

  ui.alert(
    "Show Run Sync complete",
    `Synced ${values.length} row(s) from the authoritative Show Run spreadsheet.\n\n` +
    `This tab is now a periodically-refreshed static copy instead of a live formula -- removing the live ` +
    `cross-spreadsheet IMPORTRANGE formula that was adding latency to every read of this workbook.`,
    ui.ButtonSet.OK
  );
}

/**
 * One-time setup -- installs a 15-minute recurring trigger for
 * syncShowRunSnapshot(), so the tab keeps refreshing automatically without
 * needing the live formula. Safe to run again; clears any existing trigger
 * for this handler first so it never creates duplicates.
 */
function installShowRunSyncTrigger() {
  const ui = SpreadsheetApp.getUi();
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === "syncShowRunSnapshot")
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("syncShowRunSnapshot").timeBased().everyMinutes(15).create();
  ui.alert("Show Run auto-sync installed -- refreshes automatically every 15 minutes.");
}
