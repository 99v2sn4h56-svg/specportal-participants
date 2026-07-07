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
    GROUPS: "GROUPS(YES)"
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

function testParticipantService() {

  const sheet = ParticipantService.getIndividualsSheet();

  Logger.log(sheet.getName());
  Logger.log(sheet.getLastRow());

}