/**
 * ==================================================
 * Spec Portal Gateway
 * --------------------------------------------------
 * Thin server-side bridge between Portal.html and the
 * backend services. Business logic should live in the
 * Services/ files, not here.
 * ==================================================
 */

function openSpecPortalHome() {
  const html = HtmlService
    .createTemplateFromFile("Portal")
    .evaluate()
    .setTitle("Spec Portal");

  SpreadsheetApp.getUi().showSidebar(html);
}

function openSpecPortalOnOpen_() {
  openSpecPortalHome();
}

function portalSearchParticipants(query) {
  return ParticipantService.search(query);
}

function portalGetAllParticipants() {
  return ParticipantService.getAll();
}

function portalGetAllGroups() {
  return ParticipantService.getGroups();
}

function portalGetSchoolsMasterData() {
  return ParticipantService.getSchoolsMasterData();
}

function portalGetSchoolProfile(schoolName) {
  return ParticipantService.getSchoolProfile(schoolName);
}

function portalGetStudentPhotos() {
  return ProfilePhotoService.getStudentPhotos();
}

function portalGetPortalData() {
  return ParticipantService.getPortalData();
}

function portalGetRehearsals() {
  return RehearsalService.getAll();
}

function portalRefreshRehearsals() {
  return RehearsalService.refresh();
}

function createSpecPortalOpenTrigger() {
  const ss = SpreadsheetApp.getActive();

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "openSpecPortalHome") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("openSpecPortalHome")
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  SpreadsheetApp.getUi().alert("Spec Portal auto-open trigger created.");
}