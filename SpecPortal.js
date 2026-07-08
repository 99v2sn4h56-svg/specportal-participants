function openSpecPortalHome() {
  const html = HtmlService
    .createHtmlOutputFromFile("Portal")
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("GROUPS(YES)");
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  return values.slice(1)
    .filter(row => row.some(cell => cell !== "" && cell !== null))
    .map(row => ({
      school: row[7] || "",
      category: row[14] || "",
      item: row[15] || "",
      groupName: row[16] || "",
      teacherEmail: row[17] || "",
      classroom: row[18] || "",
      count: row[6] || "",
      teacherName: [row[34], row[35]].filter(Boolean).join(" ")
    }));
}


function portalGetSchoolsMasterData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Schools Master Dataset");
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  return values.slice(1)
    .filter(row => row.some(cell => cell !== "" && cell !== null))
    .map(row => ({
      code: row[0] || "",
      schoolName: row[2] || "",
      schoolEmail: row[7] || "",
      directorate: row[31] || ""
    }))
    .filter(school => school.schoolName);
}

function portalGetSchoolProfile(schoolName) {
  return ParticipantService.getSchoolProfile(schoolName);
}


function portalGetStudentPhotos() {
  const FOLDER_ID = "1y9A0Nwh7icSssRzTDVaR3vamCn3oWWlB";
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();

  const photos = {};

  while (files.hasNext()) {
    const file = files.next();

    const key = file.getName()
      .replace(/\.[^.]+$/, "")
      .replace(/\s*-\s*Headshot$/i, "")
      .replace(/[\-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    photos[key] = {
      fileId: file.getId(),
      url: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w300`
    };
  }

  return photos;
}

function portalGetPortalData() {
  return {
    participants: portalGetAllParticipants(),
    groups: portalGetAllGroups(),
    schools: portalGetSchoolsMasterData(),
    photos: portalGetStudentPhotos()
  };
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