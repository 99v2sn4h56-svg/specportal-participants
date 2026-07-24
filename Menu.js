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

  // Spec Tools Menu — grouped into submenus by task area. Every action below
  // runs through runSpecTool_, so it always gives a starting toast and a
  // friendly error if something goes wrong, instead of failing silently or
  // showing Apps Script's raw error dialog.
  ui.createMenu("Spec Tools")
    .addSubMenu(ui.createMenu("📊 School Reports")
      .addItem("Refresh School Summary", "menuRefreshSchoolSummary")
      .addItem("Refresh Email Validation", "menuRefreshEmailValidation")
      .addItem("Generate School Map Export", "menuGenerateSchoolMapExport")
      .addItem("Export School Summary to Excel", "menuExportSchoolSummaryToExcel"))
    .addSubMenu(ui.createMenu("✅ Acceptances")
      .addItem("Sync Individual Acceptance Forms", "menuSyncIndividualAcceptances")
      .addItem("Sync Group Acceptance Forms", "menuSyncGroupAcceptances")
      .addItem("Upload Acceptances / New Participant", "menuUploadAcceptances"))
    .addSubMenu(ui.createMenu("💃 Dance Workbooks (school/teacher roster)")
      .addItem("Create / Update Dance Workbooks", "menuCreateOrUpdateDanceWorkbooks")
      .addItem("Sync Existing Dance Workbooks Only", "menuSyncExistingDanceWorkbooks"))
    .addSubMenu(ui.createMenu("📏 Costume Measurement Sheets")
      .addItem("1. Generate NEW sheets (first-time only — creates fresh, empty sheets)", "menuGenerateCostumeSheets")
      .addItem("2. Update existing sheets (safe — never erases entered measurements)", "menuUpdateExistingCostumeSheets")
      .addItem("Audit: check which sheets have data", "menuAuditCostumeMeasurementSheets")
      .addItem("Sync fill status to GROUPS(YES)", "menuSyncCostumeMeasurementStatus"))
    .addSubMenu(ui.createMenu("👕 T-Shirt Orders")
      .addItem("Sync Order Status from Form", "menuSyncTshirtOrderStatus"))
    .addSubMenu(ui.createMenu("🧮 Group Computed Columns")
      .addItem("Sync Now", "menuSyncGroupComputedColumns")
      .addItem("Enable Auto-Sync (every 5 min)", "menuInstallGroupComputedColumnsSyncTrigger"))
    .addSubMenu(ui.createMenu("🎬 Show Run")
      .addItem("Sync Now", "menuSyncShowRunSnapshot")
      .addItem("Enable Auto-Sync (every 15 min)", "menuInstallShowRunSyncTrigger"))
    .addSubMenu(ui.createMenu("🔑 Stable ID Migration")
      .addItem("Dry Run", "menuStableIdMigrationDryRun")
      .addItem("Apply", "menuStableIdMigrationApply"))
    .addToUi();

  // Auto-open Spec Central sidebar when spreadsheet opens.
  try {
    openSpecPortalOnOpen_();
  } catch (err) {
    Logger.log(`Spec Central auto-open skipped: ${err}`);
  }
}

/**
 * Shared wrapper for every Spec Tools menu action. Gives consistent
 * start/finish feedback and turns an uncaught error into a clear alert
 * instead of Apps Script's default error dialog or (for tools that gave no
 * feedback at all, like the old School Summary refresh) silence.
 */
function runSpecTool_(label, fn) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Working…", label, 5);
  try {
    fn();
    ss.toast("Done.", label, 5);
  } catch (err) {
    Logger.log(`Spec Tools · ${label} failed: ${(err && err.stack) || err}`);
    SpreadsheetApp.getUi().alert(
      `${label} failed`,
      `Something went wrong and the action did not complete.\n\n${(err && err.message) || err}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

// --- School Reports ---
function menuRefreshSchoolSummary() { runSpecTool_("Refresh School Summary", buildSchoolSummary); }
function menuRefreshEmailValidation() { runSpecTool_("Refresh Email Validation", highlightNonDETEmailsOnGroups); }
function menuGenerateSchoolMapExport() { runSpecTool_("Generate School Map Export", generateSchoolMapExport); }
function menuExportSchoolSummaryToExcel() { runSpecTool_("Export School Summary to Excel", exportSchoolSummaryToExcel); }

// --- Acceptances ---
function menuSyncIndividualAcceptances() { runSpecTool_("Sync Individual Acceptance Forms", ssSyncIndividualAcceptances); }
function menuSyncGroupAcceptances() { runSpecTool_("Sync Group Acceptance Forms", ssSyncGroupAcceptances); }
function menuUploadAcceptances() { runSpecTool_("Upload Acceptances / New Participant", openAcceptanceImportCentre); }

// --- Dance Workbooks (roster) ---
function menuCreateOrUpdateDanceWorkbooks() { runSpecTool_("Create / Update Dance Workbooks", createOrUpdateDanceWorkbooks); }
function menuSyncExistingDanceWorkbooks() { runSpecTool_("Sync Existing Dance Workbooks Only", syncExistingDanceWorkbooksOnly); }

// --- Costume Measurement Sheets ---
function menuGenerateCostumeSheets() { runSpecTool_("Generate Costume Sheets", generateCostumeSheets); }
function menuUpdateExistingCostumeSheets() { runSpecTool_("Update Existing Costume Sheets", updateExistingCostumeSheets); }
function menuAuditCostumeMeasurementSheets() { runSpecTool_("Audit Costume Measurement Sheets", auditCostumeMeasurementSheets); }
function menuSyncCostumeMeasurementStatus() { runSpecTool_("Sync Costume Measurement Status to GROUPS(YES)", syncCostumeMeasurementStatus); }

// --- T-Shirt Orders ---
function menuSyncTshirtOrderStatus() { runSpecTool_("Sync T-Shirt Order Status from Form", syncTshirtOrderStatus); }

// --- Group Computed Columns ---
function menuSyncGroupComputedColumns() { runSpecTool_("Sync Group Computed Columns", syncGroupComputedColumns); }
function menuInstallGroupComputedColumnsSyncTrigger() { runSpecTool_("Enable Group Computed Columns Auto-Sync", installGroupComputedColumnsSyncTrigger); }

// --- Show Run ---
function menuSyncShowRunSnapshot() { runSpecTool_("Sync Show Run Snapshot", syncShowRunSnapshot); }
function menuInstallShowRunSyncTrigger() { runSpecTool_("Enable Show Run Auto-Sync", installShowRunSyncTrigger); }

// --- Stable ID Migration ---
function menuStableIdMigrationDryRun() { runSpecTool_("Stable ID Migration — Dry Run", showStableIdMigrationDryRun_); }
function menuStableIdMigrationApply() { runSpecTool_("Stable ID Migration — Apply", applyStableIdMigrationFromMenu_); }

function showStableIdMigrationDryRun_() {
  const report = StableIdMigrationService.dryRun();
  SpreadsheetApp.getUi().alert(
    "Stable ID Migration — Dry Run",
    formatStableIdMigrationReport_(report),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function applyStableIdMigrationFromMenu_() {
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
