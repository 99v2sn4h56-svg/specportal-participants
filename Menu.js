/*************************************************************
 SPEC TOOLS MENU
*************************************************************/

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // Participant Search Menu
  ui.createMenu("Participant Search 🔍")
    .addItem("Open Search Sidebar", "openParticipantSearchSidebar")
    .addToUi();

  // Spec Tools Menu
  ui.createMenu("Spec Tools")
    .addItem("Mobile Search 📱", "showMobileSearch")
    .addSeparator()

    .addItem("Refresh School Summary 🎓", "buildSchoolSummary")
    .addItem("Refresh Email Validation", "highlightNonDETEmailsOnGroups")
    .addItem("Generate School Map Export", "generateSchoolMapExport")
    .addItem("Export School Summary to Excel", "exportSchoolSummaryToExcel")
    .addSeparator()

    .addItem("Sync Individual Acceptance Forms", "ssSyncIndividualAcceptances")
    .addItem("Sync Group Acceptance Forms", "ssSyncGroupAcceptances")
    .addSeparator()

    .addItem("Create / Reset IMPORT Tab ↪️", "createImportSheets")
    .addItem("Analyse Import ↪️", "analyseImport")
    .addItem("Import Records ↪️", "importRecords")
    .addSeparator()

    .addItem("Create / Update Dance Workbooks", "createOrUpdateDanceWorkbooks")
    .addItem("Sync Existing Dance Workbooks Only", "syncExistingDanceWorkbooksOnly")
    .addItem("Generate Costume Sheets 🕺🏽👯", "generateCostumeSheets")
    .addItem("Update Existing Costume Sheets", "updateExistingCostumeSheets")
    .addToUi();

  // Auto-open Participant Search when spreadsheet opens
  openParticipantSearchSidebar();
}