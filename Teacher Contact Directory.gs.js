

/*************************************************************
 * MASTER TEACHER CONTACT DIRECTORY
 *************************************************************/

function buildTeacherContactDirectory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const groupsSheet = ss.getSheetByName("GROUPS(YES)");
  const groupResponsesSheet = ss.getSheetByName("Group Acceptances Response");
  const individualsSheet = ss.getSheetByName("INDIVIDUALS(YES)");

  const outputName = "Teacher Contact Directory";
  let output = ss.getSheetByName(outputName);
  if (!output) output = ss.insertSheet(outputName);
  output.clear();

  const rawContacts = [];

  if (groupsSheet) tcdAddFromGroupsYes_(groupsSheet, rawContacts);
  if (groupResponsesSheet) tcdAddFromGroupResponses_(groupResponsesSheet, rawContacts);
  if (individualsSheet) tcdAddFromIndividuals_(individualsSheet, rawContacts);

  const directoryRows = tcdBuildMasterTeacherRows_(rawContacts);

  const headers = [
    "Teacher Name",
    "Teacher School",
    "Teacher Role/s",
    "Teacher Email/s",
    "Teacher Mobile/s",
    "Contact Type/s",
    "Categories",
    "Items / Groups",
    "Student / Participant Count",
    "Group Count",
    "Source Rows",
    "Data Quality Notes"
  ];

  output.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontFamily("Poppins")
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#1f3b73");

  if (directoryRows.length) {
    output.getRange(2, 1, directoryRows.length, headers.length)
      .setValues(directoryRows)
      .setFontFamily("Poppins")
      .setWrap(true);

    output.getRange(2, 1, directoryRows.length, 1)
      .setFontWeight("bold");

    tcdColourDirectoryRows_(output, directoryRows.length);
  }

  output.setFrozenRows(1);
  output.autoResizeColumns(1, headers.length);

  output.setColumnWidth(1, 220);
  output.setColumnWidth(2, 260);
  output.setColumnWidth(3, 220);
  output.setColumnWidth(4, 300);
  output.setColumnWidth(5, 160);
  output.setColumnWidth(6, 220);
  output.setColumnWidth(7, 260);
  output.setColumnWidth(8, 260);
  output.setColumnWidth(11, 300);
  output.setColumnWidth(12, 220);

  if (output.getFilter()) output.getFilter().remove();
  output.getDataRange().createFilter();

  ss.toast(`Teacher Contact Directory built. ${directoryRows.length} unique teacher records.`);
}

/*************************************************************
 * GROUPS(YES)
 *************************************************************/

function tcdAddFromGroupsYes_(sheet, contacts) {
  const data = sheet.getDataRange().getValues();
  const map = tcdHeaderMap_(data[0]);

  for (let r = 1; r < data.length; r++) {
    const row = data[r];

    const school = tcdGet_(row, map, ["School name", "School"], 8);       // H
    const category = tcdGet_(row, map, ["Category"], 15);                 // O
    const item = tcdGet_(row, map, ["Item", "Item / Group"], 14);         // N
    const acceptedStudents = row[0] || "";                                // A
    const allocatedStudents = tcdGet_(row, map, ["# Alloc"], 7);          // G

    // Main teacher from AF/AG, email/mobile from AH/AI if available
    const t1First = tcdGet_(row, map, ["Contact teacher's first name", "Teacher first name"], 32); // AF
    const t1Last = tcdGet_(row, map, ["Contact teacher's surname", "Teacher surname"], 33);        // AG
    const t1Email = tcdGet_(row, map, ["Contact teacher's email", "Teacher email"], 34);           // AH
    const t1Role = tcdGet_(row, map, ["Contact teacher's role at the school", "Teacher role"], 35);
    const t1Mobile = tcdGet_(row, map, ["Contact teacher's mobile number", "Teacher mobile"], 36);

    tcdPushRawContact_(contacts, {
      name: `${t1First || ""} ${t1Last || ""}`.trim(),
      school,
      role: t1Role || "Supervising teacher",
      email: t1Email,
      mobile: t1Mobile,
      contactType: "Group supervising teacher",
      category,
      item,
      participantCount: Number(acceptedStudents || allocatedStudents || 0) || "",
      groupCount: 1,
      source: `GROUPS(YES) row ${r + 1}`
    });

    // Second teacher from AK/AL, email/mobile from AM/AN if available
    const t2First = tcdGet_(row, map, ["Second contact teacher's first name", "2nd teacher first name"], 37); // AK
    const t2Last = tcdGet_(row, map, ["Second contact teacher's surname", "2nd teacher surname"], 38);        // AL
    const t2Email = tcdGet_(row, map, ["Second contact teacher's email", "2nd teacher email"], 39);           // AM
    const t2Role = tcdGet_(row, map, ["Second contact teacher's role at the school", "2nd teacher role"], 40);
    const t2Mobile = tcdGet_(row, map, ["Second contact teacher's mobile number", "2nd teacher mobile"], 41);

    tcdPushRawContact_(contacts, {
      name: `${t2First || ""} ${t2Last || ""}`.trim(),
      school,
      role: t2Role || "Supervising teacher",
      email: t2Email,
      mobile: t2Mobile,
      contactType: "Group second teacher",
      category,
      item,
      participantCount: Number(acceptedStudents || allocatedStudents || 0) || "",
      groupCount: 1,
      source: `GROUPS(YES) row ${r + 1}`
    });

    // Fall back to All Teacher Emails in R, but borrow names by matching email later.
    const allTeacherEmails = tcdGet_(row, map, ["All Teacher Emails"], 18); // R
    const fallbackMobile = tcdGet_(row, map, ["Teacher Mobile"], 19);       // S

    tcdSplitEmails_(allTeacherEmails).forEach(email => {
      const cleanEmail = tcdCleanEmail_(email);
      if (
        cleanEmail &&
        cleanEmail !== tcdCleanEmail_(t1Email) &&
        cleanEmail !== tcdCleanEmail_(t2Email)
      ) {
        tcdPushRawContact_(contacts, {
          name: "",
          school,
          role: "Supervising teacher",
          email,
          mobile: fallbackMobile,
          contactType: "Group supervising teacher",
          category,
          item,
          participantCount: Number(acceptedStudents || allocatedStudents || 0) || "",
          groupCount: 1,
          source: `GROUPS(YES) row ${r + 1}`
        });
      }
    });
  }
}

/*************************************************************
 * GROUP ACCEPTANCE RESPONSES
 *************************************************************/

function tcdAddFromGroupResponses_(sheet, contacts) {
  const data = sheet.getDataRange().getValues();
  const map = tcdHeaderMap_(data[0]);

  for (let r = 1; r < data.length; r++) {
    const row = data[r];

    const school = tcdGet_(row, map, ["School"]);
    const category = tcdGet_(row, map, ["Category selection"]);
    const item = tcdGet_(row, map, ["Ensemble/group name"]);
    const participantCount = tcdGet_(row, map, [
      "Total number of participating students. (this can be reduced by teachers up until Fri 15 Aug) *"
    ]);

    const t1First = tcdGet_(row, map, ["Teacher first name"]);
    const t1Surname = tcdGet_(row, map, ["Teacher surname"]);
    const t1Role = tcdGet_(row, map, ["Teacher role at school"]);
    const t1Email = tcdGet_(row, map, ["Teacher email (DoE)", "Teacher email"]);
    const t1Mobile = tcdGet_(row, map, ["Teacher mobile"]);

    tcdPushRawContact_(contacts, {
      name: `${t1First || ""} ${t1Surname || ""}`.trim(),
      school,
      role: t1Role,
      email: t1Email,
      mobile: t1Mobile,
      contactType: "Main contact teacher",
      category,
      item,
      participantCount,
      groupCount: 1,
      source: `Group Acceptances Response row ${r + 1}`
    });

    const t2First = tcdGet_(row, map, ["2nd teacher first name"]);
    const t2Surname = tcdGet_(row, map, ["2nd teacher surname"]);
    const t2Role = tcdGet_(row, map, ["2nd teacher role at school"]);
    const t2Email = tcdGet_(row, map, ["2nd teacher email"]);
    const t2Mobile = tcdGet_(row, map, ["2nd teacher mobile"]);

    tcdPushRawContact_(contacts, {
      name: `${t2First || ""} ${t2Surname || ""}`.trim(),
      school,
      role: t2Role,
      email: t2Email,
      mobile: t2Mobile,
      contactType: "Second teacher",
      category,
      item,
      participantCount,
      groupCount: 1,
      source: `Group Acceptances Response row ${r + 1}`
    });

    const additionalEmails = tcdGet_(row, map, [
      "Please list any additional email address you would like to be included in the communication for this group."
    ]);

    tcdSplitEmails_(additionalEmails).forEach(email => {
      tcdPushRawContact_(contacts, {
        name: "",
        school,
        role: "",
        email,
        mobile: "",
        contactType: "Additional email",
        category,
        item,
        participantCount,
        groupCount: 1,
        source: `Group Acceptances Response row ${r + 1}`
      });
    });
  }
}

/*************************************************************
 * INDIVIDUALS(YES)
 *************************************************************/

function tcdAddFromIndividuals_(sheet, contacts) {
  const data = sheet.getDataRange().getValues();
  const map = tcdHeaderMap_(data[0]);

  for (let r = 1; r < data.length; r++) {
    const row = data[r];

    const studentFirst = tcdGet_(row, map, ["First Name", "Student First Name"], 6);
    const studentLast = tcdGet_(row, map, ["Last Name", "Student Last Name", "Surname"], 7);
    const studentName = `${studentFirst || ""} ${studentLast || ""}`.trim();

    const school = tcdGet_(row, map, ["Current School", "School"], 8);
    const category = tcdGet_(row, map, ["Discipline", "Category"], 3);
    const item = tcdGet_(row, map, ["Sub-Discipline", "Sub Discipline"], 4) || studentName;

    const teacherName = tcdGet_(row, map, ["Teacher Name", "Contact Teacher Name"], 34);
    const teacherEmail = tcdGet_(row, map, ["Teacher Email", "Contact Teacher Email"], 35);

    tcdPushRawContact_(contacts, {
      name: teacherName,
      school,
      role: "Individual participant teacher",
      email: teacherEmail,
      mobile: "",
      contactType: "Individual participant teacher",
      category,
      item,
      participantCount: 1,
      groupCount: 0,
      source: `INDIVIDUALS(YES) row ${r + 1}`
    });

    const principalName = tcdGet_(row, map, ["Principal Name"], 36);
    const principalEmail = tcdGet_(row, map, ["Principal Email"], 37);

    tcdPushRawContact_(contacts, {
      name: principalName,
      school,
      role: "Principal",
      email: principalEmail,
      mobile: "",
      contactType: "Principal",
      category,
      item,
      participantCount: 1,
      groupCount: 0,
      source: `INDIVIDUALS(YES) row ${r + 1}`
    });
  }
}

/*************************************************************
 * BUILD MASTER TEACHER ROWS
 *************************************************************/

function tcdBuildMasterTeacherRows_(contacts) {
  const emailNameLookup = {};
  const emailSchoolLookup = {};
  const emailRoleLookup = {};
  const emailMobileLookup = {};

  contacts.forEach(contact => {
    const email = tcdCleanEmail_(contact.email);
    const name = tcdCleanDisplay_(contact.name);
    const school = tcdCleanDisplay_(contact.school);
    const role = tcdCleanDisplay_(contact.role);
    const mobile = tcdFormatPhone_(contact.mobile);

    if (email && name) emailNameLookup[email] = name;
    if (email && school) emailSchoolLookup[email] = school;
    if (email && role) emailRoleLookup[email] = role;
    if (email && mobile) emailMobileLookup[email] = mobile;
  });

  const teachers = {};

  contacts.forEach(contact => {
    const email = tcdCleanEmail_(contact.email);
    let name = tcdCleanDisplay_(contact.name);
    let school = tcdCleanDisplay_(contact.school);
    let role = tcdCleanDisplay_(contact.role);
    let mobile = tcdFormatPhone_(contact.mobile);

    if (!name && email && emailNameLookup[email]) name = emailNameLookup[email];
    if (!school && email && emailSchoolLookup[email]) school = emailSchoolLookup[email];
    if (!role && email && emailRoleLookup[email]) role = emailRoleLookup[email];
    if (!mobile && email && emailMobileLookup[email]) mobile = emailMobileLookup[email];

    if (!email && !name && !mobile) return;

    const key = tcdTeacherKey_(name, email, mobile, school);

    if (!teachers[key]) {
      teachers[key] = {
        names: {},
        schools: {},
        roles: {},
        emails: {},
        mobiles: {},
        contactTypes: {},
        categories: {},
        items: {},
        sourceRows: {},
        participantCount: 0,
        groupCount: 0,
        notes: {}
      };
    }

    const teacher = teachers[key];

    if (name) teacher.names[name] = true;
    if (school) teacher.schools[school] = true;
    if (role) teacher.roles[role] = true;
    if (email) teacher.emails[email] = true;
    if (mobile) teacher.mobiles[mobile] = true;
    if (contact.contactType) teacher.contactTypes[tcdCleanDisplay_(contact.contactType)] = true;
    if (contact.category) teacher.categories[tcdCleanDisplay_(contact.category)] = true;
    if (contact.item) teacher.items[tcdCleanDisplay_(contact.item)] = true;
    if (contact.source) teacher.sourceRows[contact.source] = true;

    teacher.participantCount += Number(contact.participantCount || 0) || 0;
    teacher.groupCount += Number(contact.groupCount || 0) || 0;

    if (email && !tcdLooksLikeEmail_(email)) teacher.notes["Check email format"] = true;
    if (mobile && mobile.replace(/\D/g, "").length < 10) teacher.notes["Check mobile number"] = true;
    if (!name) teacher.notes["Name missing from source data"] = true;
  });

  return Object.values(teachers)
    .map(t => [
      tcdJoinKeys_(t.names),
      tcdJoinKeys_(t.schools),
      tcdJoinKeys_(t.roles),
      tcdJoinKeys_(t.emails),
      tcdJoinKeys_(t.mobiles),
      tcdJoinKeys_(t.contactTypes),
      tcdJoinKeys_(t.categories),
      tcdJoinKeys_(t.items),
      t.participantCount || "",
      t.groupCount || "",
      tcdJoinKeys_(t.sourceRows),
      tcdJoinKeys_(t.notes)
    ])
    .sort((a, b) => {
      const schoolCompare = String(a[1]).localeCompare(String(b[1]));
      if (schoolCompare !== 0) return schoolCompare;
      return String(a[0]).localeCompare(String(b[0]));
    });
}

/*************************************************************
 * FORMATTING
 *************************************************************/

function tcdColourDirectoryRows_(sheet, rowCount) {
  const typeColumn = 6;

  for (let i = 0; i < rowCount; i++) {
    const rowNum = i + 2;
    const type = String(sheet.getRange(rowNum, typeColumn).getValue() || "").toLowerCase();

    let colour = "#ffffff";

    if (type.includes("main")) colour = "#eaf2ff";
    else if (type.includes("second")) colour = "#eaf7ef";
    else if (type.includes("additional")) colour = "#fff8dd";
    else if (type.includes("principal")) colour = "#f3eaff";
    else if (type.includes("individual")) colour = "#fff0f6";
    else if (type.includes("group")) colour = "#f2f6ff";

    sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).setBackground(colour);
  }
}

/*************************************************************
 * HELPERS
 *************************************************************/

function tcdPushRawContact_(contacts, contact) {
  const email = tcdCleanEmail_(contact.email);
  const mobile = tcdFormatPhone_(contact.mobile);
  const name = tcdCleanDisplay_(contact.name);

  if (!email && !mobile && !name) return;

  contacts.push({
    name,
    school: tcdCleanDisplay_(contact.school),
    role: tcdCleanDisplay_(contact.role),
    email,
    mobile,
    contactType: tcdCleanDisplay_(contact.contactType),
    category: tcdCleanDisplay_(contact.category),
    item: tcdCleanDisplay_(contact.item),
    participantCount: contact.participantCount,
    groupCount: contact.groupCount,
    source: contact.source
  });
}

function tcdTeacherKey_(name, email, mobile, school) {
  if (email) return `email:${email}`;
  if (mobile) return `mobile:${mobile}`;
  return `name-school:${tcdClean_(name)}|${tcdClean_(school)}`;
}

function tcdHeaderMap_(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const key = tcdCleanHeader_(header);
    if (key && map[key] === undefined) map[key] = index;
  });
  return map;
}

function tcdGet_(row, map, possibleHeaders, fallbackColumn) {
  for (const header of possibleHeaders) {
    const key = tcdCleanHeader_(header);
    if (map[key] !== undefined) return row[map[key]];
  }

  if (fallbackColumn) return row[fallbackColumn - 1];

  return "";
}

function tcdCleanHeader_(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}

function tcdClean_(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}

function tcdCleanDisplay_(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function tcdCleanEmail_(value) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function tcdJoinKeys_(obj) {
  return Object.keys(obj || {})
    .filter(Boolean)
    .sort()
    .join("\n");
}

function tcdSplitEmails_(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map(e => e.trim())
    .filter(Boolean);
}

function tcdFormatPhone_(value) {
  let phone = String(value || "")
    .replace(/\D/g, "")
    .trim();

  if (!phone) return "";

  if (phone.length === 9 && phone.startsWith("4")) {
    phone = "0" + phone;
  }

  if (phone.length === 10 && phone.startsWith("04")) {
    return phone.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");
  }

  return phone;
}

function tcdLooksLikeEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}