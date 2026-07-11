/*******************************************************
 * Spec Portal
 * Participant Service
 *
 * This file is the ONLY place that should know
 * where participant data lives.
 *******************************************************/

const ParticipantService = (() => {

  const SHEETS = {
    INDIVIDUALS: "INDIVIDUALS(YES)",
    GROUPS: "GROUPS(YES)",
    SCHOOLS_MASTER: "Schools Master Dataset"
  };

  const FIELDS = {

    // Identity
    FIRST_NAME: "Student First Name",
    LAST_NAME: "Student Last Name",
    STUDENT_ID: "Student ID",
    SRN: "SRN",

    // School
    SCHOOL: "Current School",
    YEAR: "Student Year",
    DIRECTORATE: "Directorate",

    // Participation
    DISCIPLINE: "Discipline",
    SUB_DISCIPLINE: "Sub-Discipline",
    ITEM: "Item",

    // Contact
    STUDENT_EMAIL: "Student Email",
    STUDENT_MOBILE: "Student Mobile",

    PARENT_NAME: "Parent Name",
    PARENT_EMAIL: "Parent Email",
    PARENT_PHONE: "Parent Phone",
    ADDITIONAL_PARENT_NAME: "Additional Parent Name",
    ADDITIONAL_PARENT_EMAIL: "Additional Parent Email",
    ADDITIONAL_PARENT_PHONE: "Additional Parent Phone",
    ADDITIONAL_PARENT_RELATIONSHIP: "Additional Parent Relationship",

    TEACHER_NAME: "Teacher Name",
    TEACHER_EMAIL: "Teacher Email"

  };

  return {
    SHEETS,
    FIELDS
  };

})();
/**
 * Returns the active spreadsheet.
 */
ParticipantService.getSpreadsheet = function () {
  return SpreadsheetApp.getActiveSpreadsheet();
};

/**
 * Returns the Individuals sheet.
 */
ParticipantService.getIndividualsSheet = function () {
  return this.getSpreadsheet().getSheetByName(this.SHEETS.INDIVIDUALS);
};

/**
 * Returns the Groups sheet.
 */
ParticipantService.getGroupsSheet = function () {
  return this.getSpreadsheet().getSheetByName(this.SHEETS.GROUPS);
};

/**
 * Returns the Schools Master Dataset sheet.
 */
ParticipantService.getSchoolsMasterSheet = function () {
  return this.getSpreadsheet().getSheetByName(this.SHEETS.SCHOOLS_MASTER);
};

function testParticipantService() {

  const sheet = ParticipantService.getIndividualsSheet();

  Logger.log(sheet.getName());
  Logger.log(sheet.getLastRow());

}
/**
 * Returns every participant as an array of objects.
 */
ParticipantService.getAll = function () {

  const sheet = this.getIndividualsSheet();

  const data = sheet.getDataRange().getDisplayValues();

  if (data.length < 2) return [];

  const headers = data.shift();
  const getIndex = header => headers.indexOf(header);
  const getFirstIndex = possibleHeaders => {
    for (const header of possibleHeaders) {
      const exactIndex = headers.indexOf(header);
      if (exactIndex >= 0) return exactIndex;
      const lowerIndex = headers.findIndex(value => String(value || "").trim().toLowerCase() === String(header || "").trim().toLowerCase());
      if (lowerIndex >= 0) return lowerIndex;
    }
    return -1;
  };
  const indexes = {
    firstName: getIndex(this.FIELDS.FIRST_NAME),
    lastName: getIndex(this.FIELDS.LAST_NAME),
    school: getIndex(this.FIELDS.SCHOOL),
    year: getIndex(this.FIELDS.YEAR),
    discipline: getIndex(this.FIELDS.DISCIPLINE),
    subDiscipline: getIndex(this.FIELDS.SUB_DISCIPLINE),
    item: getIndex(this.FIELDS.ITEM),
    studentEmail: getIndex(this.FIELDS.STUDENT_EMAIL),
    studentMobile: getIndex(this.FIELDS.STUDENT_MOBILE),
    parentName: getIndex(this.FIELDS.PARENT_NAME),
    parentEmail: getIndex(this.FIELDS.PARENT_EMAIL),
    parentPhone: getIndex(this.FIELDS.PARENT_PHONE),
    additionalParentName: getIndex(this.FIELDS.ADDITIONAL_PARENT_NAME),
    additionalParentEmail: getIndex(this.FIELDS.ADDITIONAL_PARENT_EMAIL),
    additionalParentPhone: getIndex(this.FIELDS.ADDITIONAL_PARENT_PHONE),
    additionalParentRelationship: getIndex(this.FIELDS.ADDITIONAL_PARENT_RELATIONSHIP),
    teacherName: getIndex(this.FIELDS.TEACHER_NAME),
    teacherEmail: getIndex(this.FIELDS.TEACHER_EMAIL),
    studentId: getIndex(this.FIELDS.STUDENT_ID),
    srn: getIndex(this.FIELDS.SRN),
    photoId: getFirstIndex(["PhotoID", "Photo ID", "Photo Id", "Drive Photo ID", "Headshot ID"]),
    photoUrl: getFirstIndex(["Photo URL", "PhotoURL", "Headshot URL", "HeadshotURL", "Image URL"])
  };
  const getCell = (row, index) => index >= 0 ? row[index] : "";

  return data.map(row => {

   const participant = {

  firstName: getCell(row, indexes.firstName),
  lastName: getCell(row, indexes.lastName),

  school: getCell(row, indexes.school),
  year: getCell(row, indexes.year),

  discipline: getCell(row, indexes.discipline),
  subDiscipline: getCell(row, indexes.subDiscipline),
  category: getCell(row, indexes.discipline),
  categoryDetail: getCell(row, indexes.subDiscipline),
  item: getCell(row, indexes.item),

  studentEmail: getCell(row, indexes.studentEmail),
  studentMobile: getCell(row, indexes.studentMobile),

  parentName: getCell(row, indexes.parentName),
  parentEmail: getCell(row, indexes.parentEmail),
  parentPhone: getCell(row, indexes.parentPhone),
  additionalParentName: getCell(row, indexes.additionalParentName),
  additionalParentEmail: getCell(row, indexes.additionalParentEmail),
  additionalParentPhone: getCell(row, indexes.additionalParentPhone),
  additionalParentRelationship: getCell(row, indexes.additionalParentRelationship),

  teacherName: getCell(row, indexes.teacherName),
  teacherEmail: getCell(row, indexes.teacherEmail),

  studentId: getCell(row, indexes.studentId),
  srn: getCell(row, indexes.srn),
  photoId: getCell(row, indexes.photoId),
  photoUrl: getCell(row, indexes.photoUrl)

};

    return participant;

  });

};
function testGetAllParticipants() {

  const participants = ParticipantService.getAll();

  Logger.log(participants.length);

  Logger.log(participants[0]);

}
/**
 * Searches participants by name, school, item or category.
 */
ParticipantService.search = function (query) {
  const q = String(query || "").toLowerCase().trim();
  if (q.length < 2) return [];

  const participants = this.getAll();

  return participants
    .filter(p => {
      const haystack = [
        p.firstName,
        p.lastName,
        `${p.firstName} ${p.lastName}`,
        p.school,
        p.year,
        p.discipline,
        p.subDiscipline,
        p.item,
        p.studentEmail,
        p.parentName,
        p.parentEmail,
        p.additionalParentName,
        p.additionalParentEmail,
        p.teacherName,
        p.teacherEmail
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    })
    .slice(0, 40);
};

/**
 * Returns every group entry as an array of objects.
 */
ParticipantService.getGroups = function () {
  const sheet = this.getGroupsSheet();
  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(header => String(header || "").trim());
  const getIndex = names => {
    for (const name of names) {
      const index = headers.findIndex(header => header.toLowerCase() === String(name).toLowerCase());
      if (index >= 0) return index;
    }
    return -1;
  };

  const acceptedIndex = getIndex(["Accepted?", "Accepted"]);
  const allocIndex = getIndex(["# Alloc", "Alloc", "Allocated", "Accepted? / # Alloc"]);
  const schoolIndex = getIndex(["School name", "School", "Current School"]);
  const segmentIndex = getIndex(["Segment"]);
  const itemIndex = getIndex(["Item", "Item / Group", "Items / Groups"]);
  const categoryIndex = getIndex(["Category", "Category selection"]);
  const groupNameIndex = getIndex(["Dance group name (if group is made up of multiple schools)", "Group Name", "Dance group name"]);
  const teacherEmailIndex = getIndex(["Teacher Email", "Contact teacher's email", "Teacher email (DoE)", "All Teacher Emails"]);
  const classroomIndex = getIndex(["Google Classroom", "Classroom"]);
  const teacherFirstIndex = getIndex(["Contact teacher's first name", "Teacher first name", "Teacher First Name"]);
  const teacherLastIndex = getIndex(["Contact teacher's surname", "Teacher surname", "Teacher Last Name"]);
  const teacherMobileIndex = getIndex(["Contact teacher's mobile number", "Teacher mobile", "Teacher Mobile", "Teacher phone"]);
  const teacherRoleIndex = getIndex(["Contact teacher's role at the school", "Teacher role at school", "Teacher role", "Role at school"]);
  const teacherAlumniIndex = getIndex(["Are you a Spec Alumni?", "Spec Alumni", "Alumni"]);
  const teacherAlumniRoleIndex = getIndex(["If you selected \"yes\", can you please tell us when and what role? You can also share a memory if you like.", "Spec Alumni Role", "Spec Alumni Roles", "Alumni Role"]);
  const teacherFirstTimeIndex = getIndex(["1st Time", "First Time", "First time"]);
  const secondTeacherFirstIndex = getIndex(["2nd teacher first name", "2nd Teacher First Name", "Second teacher first name"]);
  const secondTeacherLastIndex = getIndex(["2nd teachers surname", "2nd Teacher Surname", "Second teacher surname"]);
  const secondTeacherEmailIndex = getIndex(["2nd teacher email", "2nd Teacher Email", "Second teacher email"]);
  const secondTeacherMobileIndex = getIndex(["2nd teacher mobile", "2nd Teacher Mobile", "Second teacher mobile"]);
  const secondTeacherRoleIndex = getIndex(["2nd teacher role at school", "2nd Teacher Role at School", "Second teacher role at school"]);
  const secondTeacherAlumniIndex = getIndex(["Are you a Spec Alumni? 2", "2nd teacher Spec Alumni", "Second teacher Spec Alumni"]);
  const secondTeacherAlumniRoleIndex = getIndex(["2nd teacher Spec Alumni Role", "Second teacher Spec Alumni Role", "2nd teacher alumni role"]);

  return values.slice(1)
    .filter(row => row.some(cell => cell !== "" && cell !== null))
    .map(row => ({
      school: row[schoolIndex >= 0 ? schoolIndex : 7] || "",
      segment: row[segmentIndex >= 0 ? segmentIndex : 13] || "",
      item: row[itemIndex >= 0 ? itemIndex : 14] || "",
      category: row[categoryIndex >= 0 ? categoryIndex : 15] || "",
      groupName: row[groupNameIndex >= 0 ? groupNameIndex : 16] || "",
      teacherEmail: row[teacherEmailIndex >= 0 ? teacherEmailIndex : 17] || "",
      classroom: row[classroomIndex >= 0 ? classroomIndex : 18] || "",
      acceptedCount: row[acceptedIndex >= 0 ? acceptedIndex : 0] || "",
      allocatedCount: row[allocIndex >= 0 ? allocIndex : 6] || "",
      count: row[acceptedIndex >= 0 ? acceptedIndex : 0] || row[allocIndex >= 0 ? allocIndex : 6] || "",
      acceptanceStatus: row[acceptedIndex >= 0 ? acceptedIndex : 0] ? "Accepted" : "Not accepted yet",
      teacherName: [row[teacherFirstIndex >= 0 ? teacherFirstIndex : 34], row[teacherLastIndex >= 0 ? teacherLastIndex : 35]].filter(Boolean).join(" "),
      teacherMobile: row[teacherMobileIndex] || "",
      teacherRole: row[teacherRoleIndex] || "",
      teacherContactType: "Primary contact",
      teacherIsSpecAlumni: row[teacherAlumniIndex] || "",
      teacherSpecRoles: row[teacherAlumniRoleIndex] || "",
      teacherFirstTime: row[teacherFirstTimeIndex] || "",
      secondTeacherName: [row[secondTeacherFirstIndex], row[secondTeacherLastIndex]].filter(Boolean).join(" "),
      secondTeacherEmail: row[secondTeacherEmailIndex] || "",
      secondTeacherMobile: row[secondTeacherMobileIndex] || "",
      secondTeacherRole: row[secondTeacherRoleIndex] || "",
      secondTeacherContactType: "Second contact",
      secondTeacherIsSpecAlumni: row[secondTeacherAlumniIndex] || "",
      secondTeacherSpecRoles: row[secondTeacherAlumniRoleIndex] || ""
    }));
};

/**
 * Returns the schools master data used by Spec Portal.
 */
ParticipantService.getSchoolsMasterData = function () {
  const sheet = this.getSchoolsMasterSheet();
  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();
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
};

/**
 * Returns profile data for one school.
 */
ParticipantService.getSchoolProfile = function (schoolName) {
  const target = String(schoolName || "").trim();
  const targetLower = target.toLowerCase();
  if (!target) return null;

  const participants = this.getAll()
    .filter(p => String(p.school || "").trim().toLowerCase() === targetLower)
    .sort((a, b) => String(`${a.firstName || ""} ${a.lastName || ""}`).localeCompare(String(`${b.firstName || ""} ${b.lastName || ""}`)));

  const groups = this.getGroups()
    .filter(g => String(g.school || "").trim().toLowerCase() === targetLower);

  const master = this.getSchoolsMasterData()
    .find(s => String(s.schoolName || "").trim().toLowerCase() === targetLower) || null;

  const teacherMap = new Map();
  const itemMap = new Map();
  const disciplineMap = new Map();
  const teacherEmails = new Set();
  const familyEmails = new Set();

  participants.forEach(p => {
    const teacherKey = String(p.teacherEmail || p.teacherName || "").trim().toLowerCase();
    if (teacherKey && !teacherMap.has(teacherKey)) {
      teacherMap.set(teacherKey, {
        name: p.teacherName || "",
        email: p.teacherEmail || ""
      });
    }

    if (p.teacherEmail) teacherEmails.add(p.teacherEmail);

    [p.studentEmail, p.parentEmail, p.additionalParentEmail].forEach(email => {
      if (email) familyEmails.add(email);
    });

    const discipline = p.discipline || "Unspecified";
    if (!disciplineMap.has(discipline)) {
      disciplineMap.set(discipline, {
        name: discipline,
        count: 0,
        items: new Set()
      });
    }

    const disciplineRecord = disciplineMap.get(discipline);
    disciplineRecord.count++;

    if (p.item) {
      disciplineRecord.items.add(p.item);

      if (!itemMap.has(p.item)) {
        itemMap.set(p.item, {
          name: p.item,
          discipline: p.discipline || "",
          count: 0
        });
      }

      itemMap.get(p.item).count++;
    }
  });

  return {
    schoolName: target,
    master,
    groups,
    groupCount: groups.length,
    participantCount: participants.length,
    teacherCount: teacherMap.size,
    itemCount: itemMap.size,
    teachers: Array.from(teacherMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    items: Array.from(itemMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    disciplines: Array.from(disciplineMap.values()).map(d => ({
      name: d.name,
      count: d.count,
      items: Array.from(d.items).sort()
    })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    participants,
    teacherEmails: Array.from(teacherEmails).sort(),
    familyEmails: Array.from(familyEmails).sort()
  };
};

/**
 * Returns all data needed to initialise Spec Portal in one server call.
 */
ParticipantService.getPortalData = function () {
  let photos = {};

  try {
    if (typeof ProfilePhotoService !== "undefined" && ProfilePhotoService.getCachedStudentPhotos) {
      photos = ProfilePhotoService.getCachedStudentPhotos() || {};
    }
  } catch (err) {
    photos = {};
  }

  return {
    participants: this.getAll(),
    groups: this.getGroups(),
    schools: this.getSchoolsMasterData(),
    photos
  };
};
function testParticipantSearch() {
  const results = ParticipantService.search("james");

  Logger.log(results.length);
  Logger.log(results[0]);
}
// ==========================================
// LEGACY PARTICIPANT SEARCH
// TO BE REFACTORED INTO PARTICIPANT SERVICE
// ==========================================

// const PARTICIPANT_SEARCH_SHEET_NAME = "🔍 Participant Search";
// const PARTICIPANT_SEARCH_CACHE_KEY = "participantSearchIndex_v4";
// const PARTICIPANT_SEARCH_CACHE_SECONDS = 600;
// const PARTICIPANT_SEARCH_CACHE_CHUNK_SIZE = 90000;

// /*************************************************************
//  SIDEBAR
// *************************************************************/

// function openParticipantSearchSidebar() {
//   clearParticipantSearchCache_();
//   setupParticipantSearchSheet_();

//   const html = HtmlService
//     .createHtmlOutputFromFile("SearchSidebar")
//     .setTitle("Participant Search 🔍")
//     .setWidth(500);

//   SpreadsheetApp.getUi().showSidebar(html);
// }

// /*************************************************************
//  MANUAL REFRESH
// *************************************************************/

// function refreshParticipantSearchIndex() {
//   clearParticipantSearchCache_();

//   const ss = SpreadsheetApp.getActiveSpreadsheet();
//   const records = buildParticipantRecords_(ss);

//   putParticipantRecordsCache_(records);
//   setupParticipantSearchSheet_();

//   SpreadsheetApp.getUi().alert(
//     `Participant Search refreshed.\n\n${records.length} searchable records loaded.`
//   );
// }

// /*************************************************************
//  SEARCH
// *************************************************************/

// function searchParticipantsForTiles(filters) {
//   const records = getParticipantRecords_();
//   const tiles = [];

//   const cleanFilters = {
//     everything: cleanSearch_(filters.everything),
//     school: cleanSearch_(filters.school),
//     person: cleanSearch_(filters.person),
//     group: cleanSearch_(filters.group)
//   };

//   addSchoolTiles_(records, cleanFilters, tiles);
//   addCategoryTiles_(records, cleanFilters, tiles);
//   addItemTiles_(records, cleanFilters, tiles);

//   records.forEach(record => {
//     if (matchesRecordFilters_(record, cleanFilters)) {
//       tiles.push(record);
//     }
//   });

//   return tiles.slice(0, 100);
// }

// function writeSelectedParticipant(record) {
//   if (record.action === "collection") {
//     writeCollectionToSearchSheet_(record);
//   } else {
//     writeProfileToSearchSheet_(record);
//   }
// }

// /*************************************************************
//  PROFILE VIEW
// *************************************************************/

// function writeProfileToSearchSheet_(record) {
//   const ss = SpreadsheetApp.getActiveSpreadsheet();
//   const sheet = getSearchSheet_(ss);

//   clearSearchBody_(sheet);

//   const colour = getTypeColour_(record.type);
//   const lightColour = getTypeLightColour_(record.type);

//   sheet.getRange("A3:J3")
//     .merge()
//     .setValue(`${record.icon} ${record.title}`)
//     .setFontFamily("Poppins")
//     .setFontSize(20)
//     .setFontWeight("bold")
//     .setFontColor("#ffffff")
//     .setBackground(colour)
//     .setHorizontalAlignment("center")
//     .setVerticalAlignment("middle");

//   sheet.setRowHeight(3, 44);

//   sheet.getRange("A5:C5")
//     .merge()
//     .setValue("Profile")
//     .setFontFamily("Poppins")
//     .setFontSize(14)
//     .setFontWeight("bold")
//     .setFontColor("#1f3b73")
//     .setBackground("#eaf2ff");

//   sheet.getRange("D5:J5")
//     .merge()
//     .setValue("Summary")
//     .setFontFamily("Poppins")
//     .setFontSize(14)
//     .setFontWeight("bold")
//     .setFontColor("#1f3b73")
//     .setBackground("#eaf2ff");

//   const profileRows = [
//     ["Type", record.type || ""],
//     ["Name / Group", record.title || ""],
//     ["School", record.school || ""],
//     ["Category", record.category || ""],
//     ["Item / Group", record.item || ""],
//     ["Email", record.email || ""],
//     ["Phone", record.phone || ""],
//     ["Status / Count", record.status || ""],
//     ["Source Sheet", record.sheetName || ""],
//     ["Source Row", record.rowNumber || ""],
//     ["Application Link", record.applicationLink || ""]
//   ];

//   sheet.getRange(6, 1, profileRows.length, 2)
//     .setValues(profileRows)
//     .setFontFamily("Poppins")
//     .setWrap(true)
//     .setVerticalAlignment("top")
//     .setBorder(true, true, true, true, true, true, "#dce5f5", SpreadsheetApp.BorderStyle.SOLID);

//   sheet.getRange(6, 1, profileRows.length, 1)
//     .setFontWeight("bold")
//     .setBackground("#f3f6fb")
//     .setFontColor("#1f3b73");

//   sheet.getRange(6, 2, profileRows.length, 1)
//     .setBackground("#ffffff");

//   if (record.applicationLink) {
//     sheet.getRange(16, 2)
//       .setFormula(`=HYPERLINK("${record.applicationLink}","Open Application")`);
//   }

//   const summaryRows = [
//     ["Name", record.title || ""],
//     ["School", record.school || ""],
//     ["Role / Type", record.type || ""],
//     ["Category", record.category || ""],
//     ["Item / Group", record.item || ""],
//     ["Email", record.email || ""],
//     ["Phone", record.phone || ""],
//     ["Status / Count", record.status || ""],
//     ["Source Sheet", record.sheetName || ""],
//     ["Source Row", record.rowNumber || ""]
//   ];

//   sheet.getRange("D6:E15")
//     .setValues(summaryRows)
//     .setFontFamily("Poppins")
//     .setFontSize(11)
//     .setWrap(true)
//     .setVerticalAlignment("top")
//     .setBorder(true, true, true, true, true, true, "#dce5f5", SpreadsheetApp.BorderStyle.SOLID);

//   sheet.getRange("D6:D15")
//     .setFontWeight("bold")
//     .setFontColor("#1f3b73")
//     .setBackground("#f3f6fb");

//   sheet.getRange("E6:E15")
//     .setBackground(lightColour);

//   applySearchSheetWidths_(sheet);
//   ss.setActiveSheet(sheet);
// }

// /*************************************************************
//  COLLECTION VIEW
// *************************************************************/

// function writeCollectionToSearchSheet_(tile) {
//   const ss = SpreadsheetApp.getActiveSpreadsheet();
//   const sheet = getSearchSheet_(ss);
//   const records = getParticipantRecords_();

//   const cleanTileValue = cleanSearch_(tile.filterValue);

//   const filtered = records.filter(record => {
//     if (tile.collectionType === "category") return record._category === cleanTileValue;
//     if (tile.collectionType === "item") return record._item === cleanTileValue;
//     if (tile.collectionType === "school") return record._school === cleanTileValue;
//     return false;
//   });

//   clearSearchBody_(sheet);

//   sheet.getRange("A3:J3")
//     .merge()
//     .setValue(`${tile.icon} ${tile.cleanTitle || tile.filterValue} — ${filtered.length} result/s`)
//     .setFontFamily("Poppins")
//     .setFontSize(20)
//     .setFontWeight("bold")
//     .setFontColor("#ffffff")
//     .setBackground(getTypeColour_(tile.type))
//     .setHorizontalAlignment("center")
//     .setVerticalAlignment("middle");

//   sheet.setRowHeight(3, 44);

//   const studentCount = filtered.filter(r => r.type === "Student").length;
//   const groupCount = filtered.filter(r => r.type === "School Group").length;
//   const teacherCount = filtered.filter(r => r.type === "Teacher").length;

//   sheet.getRange("A5:J5")
//     .merge()
//     .setValue(`Students: ${studentCount}     Groups: ${groupCount}     Teachers: ${teacherCount}`)
//     .setFontFamily("Poppins")
//     .setFontSize(12)
//     .setFontWeight("bold")
//     .setFontColor("#1f3b73")
//     .setBackground("#eaf2ff")
//     .setHorizontalAlignment("center");

//   sheet.getRange("A7:J7")
//     .setValues([[
//       "Type",
//       "Name / Group",
//       "School",
//       "Category",
//       "Email",
//       "Phone",
//       "Status / Count",
//       "Application Link",
//       "Source Sheet",
//       "Source Row"
//     ]])
//     .setFontFamily("Poppins")
//     .setFontWeight("bold")
//     .setFontColor("#ffffff")
//     .setBackground("#1f3b73");

//   if (!filtered.length) {
//     sheet.getRange("A8").setValue("No results found.");
//     applySearchSheetWidths_(sheet);
//     return;
//   }

//   const values = filtered.map(record => [
//     record.type,
//     record.title,
//     record.school,
//     record.category,
//     record.email,
//     record.phone,
//     record.status,
//     record.applicationLink ? "Open Application" : "",
//     record.sheetName,
//     record.rowNumber
//   ]);

//   sheet.getRange(8, 1, values.length, 10)
//     .setValues(values)
//     .setFontFamily("Poppins")
//     .setFontSize(10)
//     .setWrap(true)
//     .setVerticalAlignment("top")
//     .setBorder(true, true, true, true, true, true, "#dce5f5", SpreadsheetApp.BorderStyle.SOLID);

//   filtered.forEach((record, i) => {
//     const row = 8 + i;
//     const bg = i % 2 === 0 ? getTypeLightColour_(record.type) : "#ffffff";

//     sheet.getRange(row, 1, 1, 10).setBackground(bg);
//     sheet.getRange(row, 1).setFontWeight("bold").setFontColor("#1f3b73");

//     if (record.applicationLink) {
//       sheet.getRange(row, 8)
//         .setFormula(`=HYPERLINK("${record.applicationLink}","Open Application")`);
//     }
//   });

//   sheet.getRange(8, 2, values.length, 1).setFontWeight("bold");

//   applySearchSheetWidths_(sheet);
//   ss.setActiveSheet(sheet);
// }

// /*************************************************************
//  SEARCH SHEET SETUP
// *************************************************************/

// function setupParticipantSearchSheet_() {
//   const ss = SpreadsheetApp.getActiveSpreadsheet();
//   const sheet = getSearchSheet_(ss);

//   sheet.clear();
//   sheet.setHiddenGridlines(true);
//   sheet.setFrozenRows(2);

//   sheet.getRange("A1:J1")
//     .merge()
//     .setValue("Schools Spectacular Directory")
//     .setFontFamily("Poppins")
//     .setFontSize(28)
//     .setFontWeight("bold")
//     .setFontColor("#ffffff")
//     .setBackground("#1f3b73")
//     .setHorizontalAlignment("center")
//     .setVerticalAlignment("middle");

//   sheet.setRowHeight(1, 72);

//   sheet.getRange("A2:J2")
//     .merge()
//     .setValue("Search students, schools, groups, categories, items and teacher contacts.")
//     .setFontFamily("Poppins")
//     .setFontStyle("italic")
//     .setFontColor("#1f3b73")
//     .setBackground("#eaf2ff")
//     .setHorizontalAlignment("center");

//   sheet.getRange("B3:I4")
//     .merge()
//     .setValue("🔍 OPEN PARTICIPANT SEARCH")
//     .setFontFamily("Poppins")
//     .setFontSize(18)
//     .setFontWeight("bold")
//     .setFontColor("#ffffff")
//     .setBackground("#1f3b73")
//     .setHorizontalAlignment("center")
//     .setVerticalAlignment("middle");

//   sheet.getRange("A6:J1000")
//     .setBackground("#eef5ff")
//     .clearContent();

//   sheet.getRange("A6:J6")
//     .merge()
//     .setValue("Use the Participant Search sidebar to begin.")
//     .setFontFamily("Poppins")
//     .setFontColor("#657189")
//     .setFontStyle("italic")
//     .setBackground("#eef5ff");

//   applySearchSheetWidths_(sheet);
// }

// /*************************************************************
//  RECORD INDEX
// *************************************************************/

// function getParticipantRecords_() {
//   const cached = getParticipantRecordsCache_();
//   if (cached) return cached;

//   const ss = SpreadsheetApp.getActiveSpreadsheet();
//   const records = buildParticipantRecords_(ss);

//   putParticipantRecordsCache_(records);
//   return records;
// }

// function buildParticipantRecords_(ss) {
//   const records = [];

//   addIndividualRecords_(ss, records);
//   addGroupRecords_(ss, records);
//   addTeacherDirectoryRecords_(ss, records);

//   const deduped = dedupeRecords_(records);

//   deduped.forEach(record => {
//     record._title = cleanSearch_(record.title);
//     record._school = cleanSearch_(record.school);
//     record._category = cleanSearch_(record.category);
//     record._item = cleanSearch_(record.item);
//     record._person = cleanSearch_(`${record.title} ${record.email} ${record.phone}`);
//     record._group = cleanSearch_(`${record.category} ${record.item}`);
//     record._search = cleanSearch_(`${record.title} ${record.school} ${record.category} ${record.item} ${record.email} ${record.phone} ${record.status}`);
//   });

//   return deduped;
// }

// function addIndividualRecords_(ss, records) {
//   const sheet = ss.getSheetByName("INDIVIDUALS(YES)");
//   if (!sheet) return;

//   const data = sheet.getDataRange().getValues();
//   if (data.length < 2) return;

//   const headers = makeHeaderMap_(data[0]);

//   const firstCol = findHeaderIndex_(headers, ["Student First Name", "First Name"]);
//   const lastCol = findHeaderIndex_(headers, ["Student Last Name", "Last Name"]);
//   const schoolCol = findHeaderIndex_(headers, ["Current School", "School"]);
//   const categoryCol = findHeaderIndex_(headers, ["Category", "Discipline"]);
//   const itemCol = findHeaderIndex_(headers, ["Sub-Discipline", "Item"]);
//   const emailCol = findHeaderIndex_(headers, ["Student and Parent emails", "Student Email", "Parent Email"]);
//   const phoneCol = findHeaderIndex_(headers, ["Student Mobile", "Student Phone", "Parent Phone", "Phone"]);
//   const statusCol = findHeaderIndex_(headers, ["Accepted?", "Status"]);
//   const applicationCol = findHeaderIndex_(headers, ["Application", "Application ID", "Application Link"]);

//   for (let r = 1; r < data.length; r++) {
//     const row = data[r];

//     const first = getCell_(row, firstCol, 5);
//     const last = getCell_(row, lastCol, 6);
//     const name = `${first || ""} ${last || ""}`.trim();

//     if (!name) continue;

//     records.push({
//       action: "profile",
//       type: "Student",
//       icon: "👤",
//       title: name,
//       school: getCell_(row, schoolCol, 7),
//       category: getCell_(row, categoryCol, 2),
//       item: getCell_(row, itemCol, -1),
//       email: getCell_(row, emailCol, 13),
//       phone: formatPhone_(getCell_(row, phoneCol, -1)),
//       status: getCell_(row, statusCol, 0),
//       applicationLink: getCell_(row, applicationCol, 3),
//       sheetName: "INDIVIDUALS(YES)",
//       rowNumber: r + 1
//     });
//   }
// }

// function addGroupRecords_(ss, records) {
//   const sheet = ss.getSheetByName("GROUPS(YES)");
//   if (!sheet) return;

//   const data = sheet.getDataRange().getValues();
//   if (data.length < 2) return;

//   const headers = makeHeaderMap_(data[0]);

//   const schoolCol = findHeaderIndex_(headers, ["School", "Current School"]);
//   const itemCol = findHeaderIndex_(headers, ["Item", "Group", "Items / Groups"]);
//   const categoryCol = findHeaderIndex_(headers, ["Category", "Category selection"]);
//   const emailCol = findHeaderIndex_(headers, ["Teacher Email", "Teacher email (DoE)", "Teacher Email/s"]);
//   const phoneCol = findHeaderIndex_(headers, ["Teacher Mobile", "Teacher Phone", "Teacher Mobile/s"]);
//   const statusCol = findHeaderIndex_(headers, ["Accepted?", "Status", "Count"]);

//   for (let r = 1; r < data.length; r++) {
//     const row = data[r];

//     const school = getCell_(row, schoolCol, 7);
//     const item = getCell_(row, itemCol, 13);
//     const category = getCell_(row, categoryCol, 14);

//     if (!school && !category && !item) continue;

//     records.push({
//       action: "profile",
//       type: "School Group",
//       icon: "🏫",
//       title: item || school,
//       school,
//       category,
//       item,
//       email: getCell_(row, emailCol, 17),
//       phone: formatPhone_(getCell_(row, phoneCol, 18)),
//       status: getCell_(row, statusCol, 0) || getCell_(row, -1, 6),
//       applicationLink: "",
//       sheetName: "GROUPS(YES)",
//       rowNumber: r + 1
//     });
//   }
// }

// function addTeacherDirectoryRecords_(ss, records) {
//   const sheet = ss.getSheetByName("Teacher Contact Directory");
//   if (!sheet) return;

//   const data = sheet.getDataRange().getValues();
//   if (data.length < 2) return;

//   const headers = makeHeaderMap_(data[0]);

//   const nameCol = findHeaderIndex_(headers, ["Teacher Name"]);
//   const schoolCol = findHeaderIndex_(headers, ["Teacher School", "School"]);
//   const roleCol = findHeaderIndex_(headers, ["Teacher Role/s", "Teacher Role"]);
//   const emailCol = findHeaderIndex_(headers, ["Teacher Email/s", "Teacher Email"]);
//   const mobileCol = findHeaderIndex_(headers, ["Teacher Mobile/s", "Teacher Mobile"]);
//   const categoryCol = findHeaderIndex_(headers, ["Categories", "Category"]);
//   const itemCol = findHeaderIndex_(headers, ["Items / Groups", "Item", "Group"]);

//   const seen = {};

//   for (let r = 1; r < data.length; r++) {
//     const row = data[r];

//     let name = cleanTeacherName_(getCell_(row, nameCol, -1));
//     const school = getCell_(row, schoolCol, -1);
//     const email = getCell_(row, emailCol, -1);
//     const phone = formatPhone_(getCell_(row, mobileCol, -1));
//     const category = getCell_(row, categoryCol, -1);
//     const item = getCell_(row, itemCol, -1);

//     if (!name && !email && !phone) continue;

//     const dedupeKey = cleanSearch_(`${name}|${email}|${phone}|${school}`);
//     if (seen[dedupeKey]) continue;
//     seen[dedupeKey] = true;

//     records.push({
//       action: "profile",
//       type: "Teacher",
//       icon: "👩‍🏫",
//       title: name || email || phone,
//       school,
//       category,
//       item,
//       email,
//       phone,
//       status: getCell_(row, roleCol, -1),
//       applicationLink: "",
//       sheetName: "Teacher Contact Directory",
//       rowNumber: r + 1
//     });
//   }
// }

// /*************************************************************
//  TILES
// *************************************************************/

// function addSchoolTiles_(records, filters, tiles) {
//   const query = filters.school || filters.everything;
//   if (!query) return;

//   const map = {};

//   records.forEach(record => {
//     if (!record.school || !record._school.includes(query)) return;

//     if (!map[record.school]) {
//       map[record.school] = {
//         action: "collection",
//         type: "School",
//         icon: "🏫",
//         cleanTitle: record.school,
//         title: record.school,
//         collectionType: "school",
//         filterValue: record.school,
//         count: 0
//       };
//     }

//     map[record.school].count++;
//   });

//   Object.values(map).forEach(tile => {
//     tile.title = `${tile.cleanTitle} (${tile.count})`;
//     tiles.push(tile);
//   });
// }

// function addCategoryTiles_(records, filters, tiles) {
//   const query = filters.group || filters.everything;
//   if (!query) return;

//   const map = {};

//   records.forEach(record => {
//     if (!record.category || !record._category.includes(query)) return;

//     if (!map[record.category]) {
//       map[record.category] = {
//         action: "collection",
//         type: "Category",
//         icon: "🎭",
//         cleanTitle: record.category,
//         title: record.category,
//         collectionType: "category",
//         filterValue: record.category,
//         count: 0
//       };
//     }

//     map[record.category].count++;
//   });

//   Object.values(map).forEach(tile => {
//     tile.title = `${tile.cleanTitle} (${tile.count})`;
//     tiles.push(tile);
//   });
// }

// function addItemTiles_(records, filters, tiles) {
//   const query = filters.group || filters.everything;
//   if (!query) return;

//   const map = {};

//   records.forEach(record => {
//     if (!record.item || !record._item.includes(query)) return;

//     if (!map[record.item]) {
//       map[record.item] = {
//         action: "collection",
//         type: "Item",
//         icon: "🎵",
//         cleanTitle: record.item,
//         title: record.item,
//         collectionType: "item",
//         filterValue: record.item,
//         count: 0
//       };
//     }

//     map[record.item].count++;
//   });

//   Object.values(map).forEach(tile => {
//     tile.title = `${tile.cleanTitle} (${tile.count})`;
//     tiles.push(tile);
//   });
// }

// function matchesRecordFilters_(record, filters) {
//   if (filters.everything && !record._search.includes(filters.everything)) return false;
//   if (filters.school && !record._school.includes(filters.school)) return false;
//   if (filters.person && !record._person.includes(filters.person)) return false;
//   if (filters.group && !record._group.includes(filters.group)) return false;

//   return filters.everything || filters.school || filters.person || filters.group;
// }

// /*************************************************************
//  CACHE
// *************************************************************/

// function getParticipantRecordsCache_() {
//   const cache = CacheService.getScriptCache();
//   const metaRaw = cache.get(PARTICIPANT_SEARCH_CACHE_KEY + "_meta");

//   if (!metaRaw) return null;

//   const meta = JSON.parse(metaRaw);
//   let json = "";

//   for (let i = 0; i < meta.chunks; i++) {
//     const chunk = cache.get(`${PARTICIPANT_SEARCH_CACHE_KEY}_${i}`);
//     if (!chunk) return null;
//     json += chunk;
//   }

//   return JSON.parse(json);
// }

// function putParticipantRecordsCache_(records) {
//   const cache = CacheService.getScriptCache();
//   const json = JSON.stringify(records);
//   const chunks = [];

//   for (let i = 0; i < json.length; i += PARTICIPANT_SEARCH_CACHE_CHUNK_SIZE) {
//     chunks.push(json.slice(i, i + PARTICIPANT_SEARCH_CACHE_CHUNK_SIZE));
//   }

//   chunks.forEach((chunk, i) => {
//     cache.put(`${PARTICIPANT_SEARCH_CACHE_KEY}_${i}`, chunk, PARTICIPANT_SEARCH_CACHE_SECONDS);
//   });

//   cache.put(
//     PARTICIPANT_SEARCH_CACHE_KEY + "_meta",
//     JSON.stringify({ chunks: chunks.length, count: records.length }),
//     PARTICIPANT_SEARCH_CACHE_SECONDS
//   );
// }

// function clearParticipantSearchCache_() {
//   const cache = CacheService.getScriptCache();
//   const metaRaw = cache.get(PARTICIPANT_SEARCH_CACHE_KEY + "_meta");

//   if (metaRaw) {
//     const meta = JSON.parse(metaRaw);
//     for (let i = 0; i < meta.chunks; i++) {
//       cache.remove(`${PARTICIPANT_SEARCH_CACHE_KEY}_${i}`);
//     }
//   }

//   cache.remove(PARTICIPANT_SEARCH_CACHE_KEY + "_meta");
// }

// /*************************************************************
//  HELPERS
// *************************************************************/

// function getSearchSheet_(ss) {
//   let sheet = ss.getSheetByName(PARTICIPANT_SEARCH_SHEET_NAME);

//   if (!sheet) {
//     sheet = ss.insertSheet(PARTICIPANT_SEARCH_SHEET_NAME);
//   }

//   return sheet;
// }

// function clearSearchBody_(sheet) {
//   sheet.getRange("A3:J1000")
//     .clearContent()
//     .clearFormat()
//     .breakApart()
//     .setBackground("#eef5ff")
//     .setBorder(false, false, false, false, false, false)
//     .setFontFamily("Poppins")
//     .setWrap(true);
// }

// function applySearchSheetWidths_(sheet) {
//   [90, 210, 250, 220, 360, 140, 120, 150, 130, 80].forEach((width, i) => {
//     sheet.setColumnWidth(i + 1, width);
//   });
// }

// function dedupeRecords_(records) {
//   const seen = {};
//   const output = [];

//   records.forEach(record => {
//     const key = cleanSearch_([
//       record.type,
//       record.title,
//       record.school,
//       record.category,
//       record.item,
//       record.email,
//       record.phone
//     ].join("|"));

//     if (seen[key]) return;

//     seen[key] = true;
//     output.push(record);
//   });

//   return output;
// }

// function cleanTeacherName_(value) {
//   const text = String(value || "").trim();
//   if (!text) return "";

//   const parts = text.split(/\s+/).filter(Boolean);
//   const cleaned = [];
//   const seen = {};

//   parts.forEach(part => {
//     const key = part.toLowerCase();
//     if (!seen[key]) {
//       cleaned.push(part);
//       seen[key] = true;
//     }
//   });

//   return cleaned.join(" ");
// }

// function getTypeColour_(type) {
//   if (type === "Student") return "#8bbcff";
//   if (type === "School Group") return "#f6c945";
//   if (type === "Category") return "#9fd3c7";
//   if (type === "Item") return "#f7b7d2";
//   if (type === "Teacher") return "#7fc8a9";
//   if (type === "School") return "#d9c2ff";
//   return "#e8eef8";
// }

// function getTypeLightColour_(type) {
//   if (type === "Student") return "#eef6ff";
//   if (type === "School Group") return "#fff8dd";
//   if (type === "Category") return "#eefaf6";
//   if (type === "Item") return "#fff1f7";
//   if (type === "Teacher") return "#f0fbf5";
//   if (type === "School") return "#f7f0ff";
//   return "#ffffff";
// }

// function cleanSearch_(value) {
//   return String(value || "")
//     .toLowerCase()
//     .trim()
//     .replace(/\s+/g, " ");
// }

// function makeHeaderMap_(headers) {
//   const map = {};

//   headers.forEach((header, index) => {
//     if (!header) return;
//     map[cleanHeader_(header)] = index;
//   });

//   return map;
// }

// function findHeaderIndex_(headerMap, possibleHeaders) {
//   for (const header of possibleHeaders) {
//     const key = cleanHeader_(header);
//     if (headerMap[key] !== undefined) return headerMap[key];
//   }

//   return -1;
// }

// function cleanHeader_(value) {
//   return String(value || "")
//     .toLowerCase()
//     .replace(/\s+/g, " ")
//     .trim();
// }

// function getCell_(row, preferredCol, fallbackCol) {
//   if (preferredCol >= 0 && row[preferredCol] !== undefined && row[preferredCol] !== "") {
//     return row[preferredCol];
//   }

//   if (fallbackCol >= 0 && row[fallbackCol] !== undefined) {
//     return row[fallbackCol];
//   }

//   return "";
// }

// function formatPhone_(value) {
//   let phone = String(value || "").replace(/\D/g, "").trim();

//   if (!phone) return "";

//   if (phone.length === 9 && phone.startsWith("4")) {
//     phone = "0" + phone;
//   }

//   if (phone.length === 10 && phone.startsWith("04")) {
//     return phone.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");
//   }

//   return phone;
// }

// /*************************************************************
//  OPTIONAL SHEET BUTTON CLICK
// *************************************************************/

// function onSelectionChange(e) {
//   const sheet = e.range.getSheet();

//   if (sheet.getName() !== PARTICIPANT_SEARCH_SHEET_NAME) return;

//   const row = e.range.getRow();
//   const col = e.range.getColumn();

//   if (row >= 3 && row <= 4 && col >= 2 && col <= 9) {
//     openParticipantSearchSidebar();
//   }
// }
