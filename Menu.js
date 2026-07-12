/*************************************************************
 SPEC TOOLS MENU
*************************************************************/

function onOpen() {
  const ui = SpreadsheetApp.getUi();


  // Participant Search Menu
 ui.createMenu("Participant Search 🔍")
  .addItem("Open Spec Portal", "openSpecPortalHome")
  .addItem("Enable Auto-open Sidebar", "createSpecPortalOpenTrigger")
  .addToUi();
  // Spec Tools Menu
  ui.createMenu("Spec Tools")
    .addItem("Refresh School Summary 🎓", "buildSchoolSummary")
    .addItem("Refresh Email Validation", "highlightNonDETEmailsOnGroups")
    .addItem("Generate School Map Export", "generateSchoolMapExport")
    .addItem("Export School Summary to Excel", "exportSchoolSummaryToExcel")
    .addSeparator()

    .addItem("Sync Individual Acceptance Forms", "ssSyncIndividualAcceptances")
    .addItem("Sync Group Acceptance Forms", "ssSyncGroupAcceptances")
    .addSeparator()

    .addItem("Upload Acceptances/New Participant", "openAcceptanceImportCentre")
    .addSeparator()

    .addItem("Create / Update Dance Workbooks", "createOrUpdateDanceWorkbooks")
    .addItem("Sync Existing Dance Workbooks Only", "syncExistingDanceWorkbooksOnly")
    .addItem("Generate Costume Sheets 🕺🏽👯", "generateCostumeSheets")
    .addItem("Update Existing Costume Sheets", "updateExistingCostumeSheets")
    .addSeparator()
    .addItem("Stable ID Migration — Dry Run", "showStableIdMigrationDryRun")
    .addItem("Stable ID Migration — Apply", "applyStableIdMigrationFromMenu")
    .addToUi();

  // Auto-open Spec Central sidebar when spreadsheet opens.
  try {
    openSpecPortalOnOpen_();
  } catch (err) {
    Logger.log(`Spec Central auto-open skipped: ${err}`);
  }
}

function showStableIdMigrationDryRun() {
  const report = StableIdMigrationService.dryRun();
  SpreadsheetApp.getUi().alert(
    "Stable ID Migration — Dry Run",
    formatStableIdMigrationReport_(report),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function applyStableIdMigrationFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const preview = StableIdMigrationService.dryRun();
  const prompt = ui.prompt(
    "Apply Stable ID Migration",
    formatStableIdMigrationReport_(preview) + "\n\nType APPLY-STABLE-IDS to continue.",
    ui.ButtonSet.OK_CANCEL
  );
  if (prompt.getSelectedButton() !== ui.Button.OK) return;
  const result = StableIdMigrationService.apply({ confirmation: prompt.getResponseText() });
  ui.alert(result.ok ? "Stable ID migration completed." : `Migration was not applied: ${result.error || "Unknown error"}`);
}

function formatStableIdMigrationReport_(report) {
  return [report.timeline, report.groups].map(item => [
    item.target.toUpperCase(),
    `Rows: ${item.populatedRows}`,
    `Existing IDs: ${item.existingIds}`,
    `Missing IDs: ${item.missingIds}`,
    `Duplicates: ${(item.duplicateIds || []).length}`,
    item.proposedAction
  ].join("\n")).join("\n\n");
}
