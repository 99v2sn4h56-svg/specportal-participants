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
    .addToUi();

  // Auto-open Spec Central sidebar when spreadsheet opens.
  try {
    openSpecPortalOnOpen_();
  } catch (err) {
    Logger.log(`Spec Central auto-open skipped: ${err}`);
  }
}
