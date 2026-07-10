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
    .setTitle("Spec Central");

  SpreadsheetApp.getUi().showSidebar(html);
}

function doGet(e) {
  const app = String((e && e.parameter && e.parameter.app) || "central").toLowerCase();

  if (app === "mobile") {
    return openMobileSearchWebApp();
  }

  return HtmlService
    .createTemplateFromFile("SpecCentral")
    .evaluate()
    .setTitle("Spec Central")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function openSpecPortalOnOpen_() {
  openSpecPortalHome();
}

function getCurrentStaffContext() {
  // TODO: sync staff roles/modules from the Production Team spreadsheet.
  return StaffService.getCurrent();
}

function portalGetSpecCentralConfig() {
  const properties = PropertiesService.getScriptProperties();
  const timeline = TimelineService.getDashboardSummary();
  const staffTeam = StaffService.getAll();
  const currentStaff = getCurrentStaffContext();

  return {
    staff: currentStaff,
    staffTeam,
    timelineStatus: timeline.status || "",
    timelineLastRefreshed: timeline.lastRefreshed || "",
    staffStatus: staffTeam.length ? "Connected" : "Fallback / unavailable",
    attendanceUrl: properties.getProperty("SPEC_CENTRAL_ATTENDANCE_URL") ||
      properties.getProperty("ATTENDANCE_WEB_APP_URL") ||
      "",
    announcements: AnnouncementService.getActive(),
    notifications: NotificationService.getForCurrentUser(),
    rehearsals: timeline.upcomingRehearsals || [],
    todaysRehearsals: timeline.todaysRehearsals || [],
    attendanceEvents: [],
    currentDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM")
  };
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

function portalGetStaffProductionTeam() {
  return StaffService.getAll();
}

function portalGetRehearsals() {
  return RehearsalService.getAll();
}

function portalRefreshRehearsals() {
  return RehearsalService.refresh();
}

function portalGetCalendarData() {
  return TimelineService.getCalendarData();
}

function portalGetProjectManagementData() {
  return ProjectManagementService.getDashboardData();
}

function portalGetMediaTimelineData() {
  return MediaTimelineService.getDashboardData();
}

function createSpecPortalOpenTrigger() {
  const ss = SpreadsheetApp.getActive();

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (["openSpecPortalHome", "openSpecPortalOnOpen_"].includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("openSpecPortalOnOpen_")
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  SpreadsheetApp.getUi().alert("Spec Central auto-open trigger created.");
}
