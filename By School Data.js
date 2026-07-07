function buildSchoolSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const groupsSheet = ss.getSheetByName("GROUPS(YES)");
  const individualsSheet = ss.getSheetByName("INDIVIDUALS(YES)");
  const schoolsSheet = ss.getSheetByName("Schools Master Dataset");

  const summarySheetName = "School Summary";
  const directorateSheetName = "Directorate Summary";

  let summarySheet = ss.getSheetByName(summarySheetName);
  if (!summarySheet) summarySheet = ss.insertSheet(summarySheetName);
  summarySheet.clear();

  let directorateSheet = ss.getSheetByName(directorateSheetName);
  if (!directorateSheet) directorateSheet = ss.insertSheet(directorateSheetName);
  directorateSheet.clear();

  const groupsData = groupsSheet.getDataRange().getValues();
  const individualsData = individualsSheet.getDataRange().getValues();
  const schoolsData = schoolsSheet.getDataRange().getValues();

  const groupHeaders = groupsData[0];
  const individualHeaders = individualsData[0];

  const GROUP_COUNT_A_COL = 0;
  const GROUP_COUNT_FALLBACK_COL = 6;

  const GROUP_SCHOOL_COL = getColumnByHeader(groupHeaders, [
    "School name",
    "School",
    "Current School"
  ], 7);

  const GROUP_CATEGORY_COL = getColumnByHeader(groupHeaders, [
    "Category",
    "Catgeory"
  ], 14);

  const GROUP_GROUP_NAME_COL = getColumnByHeader(groupHeaders, [
    "Dance group name",
    "Group name",
    "Group Name"
  ], 16); // Q

  const GROUP_TEACHER_EMAIL_COL = getColumnByHeader(groupHeaders, [
    "Teacher Email",
    "Teacher email",
    "Teacher email (DoE)",
    "Contact Teacher Email",
    "Contact teacher email"
  ], 17); // R

  const GROUP_TEACHER_FIRST_COL = getColumnByHeader(groupHeaders, [
    "Contact teacher's first name",
    "Contact Teacher First Name",
    "Teacher first name",
    "Teacher First Name"
  ], 34); // AI

  const GROUP_TEACHER_LAST_COL = getColumnByHeader(groupHeaders, [
    "Contact teacher's surname",
    "Contact Teacher Surname",
    "Teacher surname",
    "Teacher last name",
    "Teacher Last Name"
  ], 35); // AJ

  const GROUP_PRINCIPAL_FIRST_COL = getColumnByHeader(groupHeaders, [
    "Principal's first name",
    "Principal First Name",
    "Principal first name"
  ], 29); // AD

  const GROUP_PRINCIPAL_LAST_COL = getColumnByHeader(groupHeaders, [
    "Principal's surname",
    "Principal surname",
    "Principal Last Name",
    "Principal last name"
  ], 30); // AE

  const GROUP_PRINCIPAL_EMAIL_COL = getColumnByHeader(groupHeaders, [
    "Principal's email",
    "Principal Email",
    "Principal email"
  ], 31); // AF

  const GROUP_COST_PER_STUDENT_COL = getColumnByHeader(groupHeaders, [
    "Cost per student",
    "Cost Per Student"
  ], 53);

  const GROUP_TOTAL_COST_COL = getColumnByHeader(groupHeaders, [
    "Total",
    "Total Cost"
  ], 54);

  const IND_CATEGORY_COL = getColumnByHeader(individualHeaders, [
    "Discipline",
    "Applic Discipline",
    "Category"
  ], 3);

  const IND_SUBCATEGORY_COL = getColumnByHeader(individualHeaders, [
    "Sub-Discipline",
    "Sub Discipline"
  ], 4);

  const IND_FIRST_COL = getColumnByHeader(individualHeaders, [
    "Student First Name",
    "First Name"
  ], 5);

  const IND_LAST_COL = getColumnByHeader(individualHeaders, [
    "Student Last Name",
    "Last Name"
  ], 6);

  const IND_SCHOOL_COL = getColumnByHeader(individualHeaders, [
    "Current School",
    "School"
  ], 7);

  const IND_DIRECTORATE_COL = getColumnByHeader(individualHeaders, [
    "Directorate"
  ], 8);

  const IND_YEAR_COL = getColumnByHeader(individualHeaders, [
    "Student Year",
    "Year"
  ], 10);

  const IND_COST_COL = getColumnByHeader(individualHeaders, [
    "Cost"
  ], 12);

  const IND_PRINCIPAL_NAME_COL = getColumnByHeader(individualHeaders, [
    "Principal Name"
  ], 36); // AK

  const IND_PRINCIPAL_EMAIL_COL = getColumnByHeader(individualHeaders, [
    "Principal Email"
  ], 37); // AL

  const schools = {};
  const schoolMaster = {};

  for (let i = 1; i < schoolsData.length; i++) {
    const code = schoolsData[i][0];
    const schoolName = correctSchoolName(schoolsData[i][2]);
    const email = schoolsData[i][7];
    const directorate = schoolsData[i][31];

    if (!schoolName) continue;

    schoolMaster[normaliseName(schoolName)] = {
      code: code || "",
      email: email || "",
      directorate: directorate || ""
    };
  }

  for (let i = 1; i < groupsData.length; i++) {
    const row = groupsData[i];

    const count =
      Number(row[GROUP_COUNT_A_COL]) ||
      Number(row[GROUP_COUNT_FALLBACK_COL]) ||
      0;

    const school = correctSchoolName(getValue(row, GROUP_SCHOOL_COL));
    const category = getValue(row, GROUP_CATEGORY_COL);
    const groupName = getValue(row, GROUP_GROUP_NAME_COL);

    const teacherEmail = getValue(row, GROUP_TEACHER_EMAIL_COL);
    const teacherFirst = getValue(row, GROUP_TEACHER_FIRST_COL);
    const teacherLast = getValue(row, GROUP_TEACHER_LAST_COL);

    const principalFirst = getValue(row, GROUP_PRINCIPAL_FIRST_COL);
    const principalLast = getValue(row, GROUP_PRINCIPAL_LAST_COL);
    const principalEmail = getValue(row, GROUP_PRINCIPAL_EMAIL_COL);

    const costPerStudent = Number(getValue(row, GROUP_COST_PER_STUDENT_COL)) || 0;
    const totalCost =
      costPerStudent
        ? count * costPerStudent
        : Number(getValue(row, GROUP_TOTAL_COST_COL)) || 0;

    if (!school || !category) continue;

    const schoolKey = normaliseName(school);
    if (!schools[schoolKey]) schools[schoolKey] = createSchoolRecord(school);

    if (category.toString().trim().toLowerCase() === "secondary combined dance") {
      schools[schoolKey].hasSecondaryCombinedDance = true;
    }

    addPrincipalCandidate(
      schools[schoolKey],
      principalFirst,
      principalLast,
      principalEmail
    );

    addTeacherEmail(schools[schoolKey], teacherEmail);

    addGroupDetail(
      schools[schoolKey],
      category,
      count,
      teacherEmail,
      teacherFirst,
      teacherLast,
      groupName
    );

    schools[schoolKey].groupCategories[cleanCategory(category)] = true;

    schools[schoolKey].groups.push(
      buildGroupSummaryBlock(
        category,
        count,
        costPerStudent,
        totalCost,
        teacherEmail,
        teacherFirst,
        teacherLast,
        groupName
      )
    );

    addCategoryCount(schools[schoolKey], category, count);

    schools[schoolKey].groupStudentCount += count;
    schools[schoolKey].groupCostTotal += totalCost;
  }

  for (let i = 1; i < individualsData.length; i++) {
    const row = individualsData[i];

    const categoryRaw = getValue(row, IND_CATEGORY_COL);
    const subCategory = getValue(row, IND_SUBCATEGORY_COL);
    const first = getValue(row, IND_FIRST_COL);
    const last = getValue(row, IND_LAST_COL);
    const school = correctSchoolName(getValue(row, IND_SCHOOL_COL));
    const directorate = getValue(row, IND_DIRECTORATE_COL);
    const year = getValue(row, IND_YEAR_COL);
    const cost = Number(getValue(row, IND_COST_COL)) || 0;
    const principalName = getValue(row, IND_PRINCIPAL_NAME_COL);
    const principalEmail = getValue(row, IND_PRINCIPAL_EMAIL_COL);

    if (!school || !first || !last || !categoryRaw) continue;
    if (!looksLikeSchoolName(school)) continue;

    const schoolKey = normaliseName(school);
    if (!schools[schoolKey]) schools[schoolKey] = createSchoolRecord(school);

    const splitPrincipal = splitFullName(principalName);

    addPrincipalCandidate(
      schools[schoolKey],
      splitPrincipal.first,
      splitPrincipal.last,
      principalEmail
    );

    const category = cleanCategory(categoryRaw);
    const sub = subCategory ? subCategory.toString().trim() : "";

    schools[schoolKey].individualCategoryNames[category] = true;

    if (category.toLowerCase() === "featured dance") {
      schools[schoolKey].hasFeaturedDanceIndividual = true;
    }

    if (!schools[schoolKey].individualCategories[category]) {
      schools[schoolKey].individualCategories[category] = [];
    }

    if (!schools[schoolKey].directorate && directorate) {
      schools[schoolKey].directorate = directorate;
    }

    let studentLine = `${first} ${last} (Year ${year})`;

    if (category.toLowerCase() === "featured dance" && sub) {
      studentLine += ` (${sub})`;
    } else if (sub) {
      studentLine += ` - ${sub}`;
    }

    if (cost) studentLine += ` - $${cost}`;

    schools[schoolKey].individualCategories[category].push(studentLine);
    schools[schoolKey].individualDetailLines.push(`${first} ${last} - ${category}`);

    addCategoryCount(schools[schoolKey], category, 1);

    schools[schoolKey].individualStudentCount += 1;
    schools[schoolKey].individualCostTotal += cost;
  }

  const summaryOutput = [[
    "School Code",
    "School Name",
    "School Email",
    "Participation Categories",
    "Participation Details",
    "Principal First Name",
    "Principal Surname",
    "Principal Email",
    "Contact Teacher Email(s)",
    "Directorate",
    "Category Summary",
    "Group Summary",
    "Individual Summary",
    "Group Student Count",
    "Individual Student Count",
    "Total Students",
    "Group Cost Total",
    "Individual Cost Total",
    "Total School Cost"
  ]];

  const principalIssues = [];
  const teacherEmailInvalid = [];
  const danceDoubleUp = [];
  const directorates = {};

  Object.keys(schools).sort().forEach(key => {
    const record = schools[key];
    const master = schoolMaster[key] || {};
    const principal = chooseBestPrincipal(record, master.email);

    const directorate =
      master.directorate ||
      record.directorate ||
      "No Directorate Found";

    const totalStudents =
      record.groupStudentCount + record.individualStudentCount;

    const totalCost =
      record.groupCostTotal + record.individualCostTotal;

    const teacherEmails = uniqueList(record.teacherEmails).join("\n");

    summaryOutput.push([
      master.code || "",
      record.schoolName,
      master.email || "",
      buildParticipationCategories(record),
      buildParticipationDetails(record),
      principal.first || "",
      principal.last || "",
      principal.email || "",
      teacherEmails,
      directorate,
      buildCategorySummary(record.categoryCounts),
      record.groups.join("\n\n"),
      buildIndividualSummary(record.individualCategories),
      record.groupStudentCount,
      record.individualStudentCount,
      totalStudents,
      record.groupCostTotal,
      record.individualCostTotal,
      totalCost
    ]);

    principalIssues.push(principal.issue);
    teacherEmailInvalid.push(hasInvalidDetEmail(teacherEmails));
    danceDoubleUp.push(
      record.hasFeaturedDanceIndividual &&
      record.hasSecondaryCombinedDance
    );

    if (!directorates[directorate]) directorates[directorate] = [];

    directorates[directorate].push({
      schoolName: record.schoolName,
      totalStudents
    });
  });

  summarySheet
    .getRange(1, 1, summaryOutput.length, summaryOutput[0].length)
    .setValues(summaryOutput);

  summarySheet.getRange(1, 1, 1, summaryOutput[0].length)
    .setFontWeight("bold")
    .setBackground("#00ff80");

  summarySheet.getRange(2, 4, Math.max(summaryOutput.length - 1, 1), 10)
    .setWrap(true);

  for (let i = 0; i < principalIssues.length; i++) {
    if (principalIssues[i]) {
      summarySheet.getRange(i + 2, 6, 1, 3).setBackground("#fce5cd");
    }

    if (teacherEmailInvalid[i]) {
      summarySheet.getRange(i + 2, 9).setBackground("#f4cccc");
    }

    if (danceDoubleUp[i]) {
      summarySheet.getRange(i + 2, 2).setBackground("#ff66cc");
    }
  }

  summarySheet.autoResizeColumns(1, summaryOutput[0].length);
  summarySheet.setFrozenRows(1);

  const directorateOutput = [[
    "Directorate",
    "Schools",
    "Number of Schools",
    "Total Students"
  ]];

  Object.keys(directorates).sort().forEach(directorate => {
    const schoolsList = directorates[directorate].sort((a, b) =>
      a.schoolName.localeCompare(b.schoolName)
    );

    const totalStudents = schoolsList.reduce(
      (sum, item) => sum + item.totalStudents,
      0
    );

    directorateOutput.push([
      directorate,
      schoolsList
        .map(item => `${item.schoolName} (${formatStudentCount(item.totalStudents)})`)
        .join("\n"),
      schoolsList.length,
      totalStudents
    ]);
  });

  directorateSheet
    .getRange(1, 1, directorateOutput.length, directorateOutput[0].length)
    .setValues(directorateOutput);

  directorateSheet.getRange(1, 1, 1, directorateOutput[0].length)
    .setFontWeight("bold")
    .setBackground("#00ff80");

  directorateSheet.getRange(2, 2, Math.max(directorateOutput.length - 1, 1), 1)
    .setWrap(true);

  directorateSheet.autoResizeColumns(1, directorateOutput[0].length);
  directorateSheet.setFrozenRows(1);

  highlightNonDETEmailsOnGroups();
}

function buildGroupSummaryBlock(
  category,
  count,
  costPerStudent,
  totalCost,
  teacherEmailText,
  teacherFirst,
  teacherLast,
  groupName
) {
  const clean = cleanCategory(category);
  const teacherName = getTeacherName(teacherEmailText, teacherFirst, teacherLast);

  let output = `${clean}\n`;

  if (groupName) {
    output += `  • Group name: ${groupName}\n`;
  }

  output += `  • ${formatStudentCount(count)}\n`;

  if (teacherName) {
    output += `  • Contact teacher: ${teacherName}\n`;
  }

  if (costPerStudent) {
    output += `  • $${costPerStudent} per student\n`;
  }

  output += `  • Total $${totalCost}`;

  return output;
}

function getTeacherName(teacherEmailText, teacherFirst, teacherLast) {
  let teacherName = `${teacherFirst || ""} ${teacherLast || ""}`.trim();

  if (teacherName) return teacherName;

  const emails = extractEmails(teacherEmailText);

  if (!emails.length) return "";

  const names = emails
    .map(email => {
      const name = nameFromDetEmail(email);
      return `${name.first} ${name.last}`.trim();
    })
    .filter(Boolean);

  return uniqueList(names).join(", ");
}


////***********PART 2************////


function addPrincipalCandidate(record, first, last, emailText) {
  const emails = extractEmails(emailText);
  const firstClean = first ? first.toString().trim() : "";
  const lastClean = last ? last.toString().trim() : "";

  if (emails.length === 0) {
    if (!firstClean && !lastClean) return;

    record.principalCandidates.push({
      first: firstClean,
      last: lastClean,
      email: ""
    });
    return;
  }

  emails.forEach(email => {
    const inferred = nameFromDetEmail(email);

    record.principalCandidates.push({
      first: inferred.first || firstClean,
      last: inferred.last || lastClean,
      email
    });
  });
}

function chooseBestPrincipal(record, schoolEmail) {
  const candidates = record.principalCandidates || [];

  if (!candidates.length) {
    return {
      first: "",
      last: "",
      email: schoolEmail || "",
      issue: false
    };
  }

  const unique = [];
  const seen = {};

  candidates.forEach(c => {
    const key = `${c.first}|${c.last}|${c.email}`.toLowerCase();

    if (seen[key]) return;

    seen[key] = true;
    unique.push(c);
  });

  const personalEmails = unique.filter(c =>
    c.email &&
    c.email.toLowerCase().endsWith("@det.nsw.edu.au") &&
    !isSchoolEmail(c.email)
  );

  const schoolEmails = unique.filter(c =>
    c.email &&
    isSchoolEmail(c.email)
  );

  let chosen =
    personalEmails[0] ||
    schoolEmails[0] ||
    unique[0];

  return {
    first: chosen.first || "",
    last: chosen.last || "",
    email: chosen.email || schoolEmail || "",
    issue: unique.length > 1
  };
}

function addTeacherEmail(record, emailText) {
  const emails = extractEmails(emailText);

  emails.forEach(email => {
    const key = email.toLowerCase();

    if (record.teacherEmailKeys[key]) return;

    record.teacherEmailKeys[key] = true;
    record.teacherEmails.push(email);
  });
}

function addGroupDetail(record, category, count, teacherEmail, teacherFirst, teacherLast) {
  const teacherName = getTeacherName(
    teacherEmail,
    teacherFirst,
    teacherLast
  );

  record.groupDetailLines.push(
    `${cleanCategory(category)} (${formatStudentCount(count)})` +
    (teacherName ? ` - ${teacherName}` : "")
  );
}

function buildParticipationCategories(record) {
  const groups = Object.keys(record.groupCategories).sort();
  const individuals = Object.keys(record.individualCategoryNames).sort();

  let output = "";

  if (groups.length) {
    output += "Groups:\n" + groups.join("\n");
  }

  if (individuals.length) {
    if (output) output += "\n\n";

    output += "Individuals:\n" + individuals.join("\n");
  }

  return output;
}

function buildParticipationDetails(record) {
  let output = "";

  if (record.individualDetailLines.length) {
    output += "Individual Students:\n";
    output += uniqueList(record.individualDetailLines)
      .sort()
      .join("\n");
  }

  if (record.groupDetailLines.length) {
    if (output) output += "\n\n";

    output += "School Groups:\n";
    output += uniqueList(record.groupDetailLines)
      .sort()
      .join("\n");
  }

  return output;
}

function buildIndividualSummary(categories) {
  return Object.keys(categories)
    .sort()
    .map(category => {
      const students = categories[category];

      return `${category} (${formatStudentCount(students.length)})\n${students.join("\n")}`;
    })
    .join("\n\n");
}

function buildCategorySummary(categoryCounts) {
  return Object.keys(categoryCounts)
    .sort()
    .map(category =>
      `${category} (${formatStudentCount(categoryCounts[category])})`
    )
    .join("\n");
}

function addCategoryCount(record, category, count) {
  const clean = cleanCategory(category);

  if (!record.categoryCounts[clean]) {
    record.categoryCounts[clean] = 0;
  }

  record.categoryCounts[clean] += count;
}

function getColumnByHeader(headers, possibleNames, fallbackIndex) {
  const normalisedHeaders = headers.map(h =>
    h
      ? h.toString().trim().toLowerCase().replace(/\s+/g, " ")
      : ""
  );

  for (let i = 0; i < possibleNames.length; i++) {
    const target = possibleNames[i]
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    const found = normalisedHeaders.indexOf(target);

    if (found !== -1) return found;
  }

  return fallbackIndex;
}

function getValue(row, col) {
  return col >= 0 ? row[col] : "";
}

function formatStudentCount(count) {
  return count === 1
    ? "1 student"
    : `${count} students`;
}

function extractEmails(value) {
  if (!value) return [];

  const matches = value
    .toString()
    .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);

  return uniqueList(matches || []);
}

function uniqueList(values) {
  const seen = {};
  const output = [];

  values.forEach(value => {
    if (!value) return;

    const clean = value.toString().trim();
    const key = clean.toLowerCase();

    if (seen[key]) return;

    seen[key] = true;
    output.push(clean);
  });

  return output;
}

function splitFullName(name) {
  if (!name) {
    return {
      first: "",
      last: ""
    };
  }

  const parts = name.toString().trim().split(/\s+/);

  return {
    first: parts[0] || "",
    last: parts.slice(1).join(" ")
  };
}

function looksLikeSchoolName(name) {
  const value = name.toString().toLowerCase();

  return (
    value.includes("school") ||
    value.includes("college") ||
    value.includes("campus") ||
    value.includes("conservatorium")
  );
}

function correctSchoolName(name) {
  if (!name) return "";

  const cleaned = name.toString().trim();
  const lower = cleaned.toLowerCase();

  if (
    lower === "newtown high school" ||
    lower === "newtown high school of the performing arts" ||
    lower === "newtown school of performing arts" ||
    lower === "newtown high school of performing arts"
  ) {
    return "Newtown School of the Performing Arts";
  }

  return cleaned;
}

function cleanCategory(value) {
  return value
    .toString()
    .replace(/^https?:\/\/\S+\s*/i, "")
    .trim();
}

function normaliseName(name) {
  return name
    ? name.toString().trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function hasInvalidDetEmail(emailText) {
  const emails = extractEmails(emailText);

  return emails.some(email =>
    !email.toLowerCase().endsWith("@det.nsw.edu.au")
  );
}

function createSchoolRecord(schoolName) {
  return {
    schoolName,
    groups: [],
    groupCategories: {},
    individualCategoryNames: {},
    individualCategories: {},
    individualDetailLines: [],
    groupDetailLines: [],
    categoryCounts: {},
    principalCandidates: [],
    teacherEmails: [],
    teacherEmailKeys: {},
    directorate: "",
    groupStudentCount: 0,
    individualStudentCount: 0,
    groupCostTotal: 0,
    individualCostTotal: 0,
    hasFeaturedDanceIndividual: false,
    hasSecondaryCombinedDance: false
  };
}
function nameFromDetEmail(email) {
  if (!email) return { first: "", last: "" };

  if (isSchoolEmail(email)) return { first: "", last: "" };

  const local = email.toString().split("@")[0];

  const cleaned = local
    .replace(/[0-9]+$/g, "")
    .replace(/[._-]+/g, " ")
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);

  return {
    first: titleCase(parts[0] || ""),
    last: titleCase(parts.slice(1).join(" "))
  };
}

function titleCase(value) {
  return value
    ? value.toString().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    : "";
}

function isSchoolEmail(email) {
  if (!email) return false;

  const local = email.toString().split("@")[0].toLowerCase();

  return (
    local.includes(".school") ||
    local.includes("-p.school") ||
    local.includes("-h.school") ||
    local.includes("-s.school")
  );
}

function highlightNonDETEmailsOnGroups() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GROUPS(YES)");
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const columnsToCheck = [
    18, // R
    29, // AC
    34, // AH
    39  // AM
  ];

  const brightPink = "#ff00ff";
  const white = "#ffffff";

  columnsToCheck.forEach(col => {
    const range = sheet.getRange(2, col, lastRow - 1, 1);
    const values = range.getValues();

    const backgrounds = values.map(row => {
      const cellValue = row[0];

      if (!cellValue) return [white];

      const emails = extractEmails(cellValue);

      const invalid =
        emails.length === 0 ||
        emails.some(email => !email.toLowerCase().endsWith("@det.nsw.edu.au"));

      return [invalid ? brightPink : white];
    });

    range.setBackgrounds(backgrounds);
  });
}

function generateSchoolMapExport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const summarySheet = ss.getSheetByName("School Summary");
  const masterSheet = ss.getSheetByName("Schools Master Dataset");

  if (!summarySheet || !masterSheet) {
    SpreadsheetApp.getUi().alert("Please generate School Summary first.");
    return;
  }

  const summaryData = summarySheet.getDataRange().getValues();
  const masterData = masterSheet.getDataRange().getValues();

  const masterLookup = {};

  for (let i = 1; i < masterData.length; i++) {
    const row = masterData[i];

    const schoolCode = row[0];
    const schoolName = row[2];
    const suburb = row[4];
    const postcode = row[5];
    const lga = row[26];
    const directorate = row[31];
    const remoteness = row[39];
    const latitude = row[40];
    const longitude = row[41];
    const sa4 = row[42];

    if (!schoolName) continue;

    const item = {
      schoolCode,
      suburb,
      postcode,
      lga,
      directorate,
      remoteness,
      latitude,
      longitude,
      sa4
    };

    masterLookup[normaliseName(schoolName)] = item;

    if (schoolCode) {
      masterLookup[`code:${schoolCode}`] = item;
    }
  }

  const output = [[
    "School Code",
    "School Name",
    "School Email",
    "Directorate",
    "Total Students",
    "Group Students",
    "Individual Students",
    "Participation Categories",
    "Suburb",
    "Postcode",
    "LGA",
    "SA4",
    "ASGS Remoteness",
    "Latitude",
    "Longitude",
    "Map Label",
    "Map Description",
    "Google Maps Link"
  ]];

  for (let i = 1; i < summaryData.length; i++) {
    const row = summaryData[i];

    const schoolCode = row[0];
    const schoolName = row[1];
    const schoolEmail = row[2];
    const participationCategories = row[3];
    const directorateFromSummary = row[9];
    const groupStudents = row[13];
    const individualStudents = row[14];
    const totalStudents = row[15];

    if (!schoolName) continue;

    const master =
      masterLookup[`code:${schoolCode}`] ||
      masterLookup[normaliseName(schoolName)] ||
      {};

    const latitude = master.latitude || "";
    const longitude = master.longitude || "";

    if (!latitude || !longitude) continue;

    const directorate = master.directorate || directorateFromSummary || "";

    const mapLabel = `${schoolName} — ${formatStudentCount(totalStudents)}`;

    const mapDescription =
      `School: ${schoolName}\n` +
      `School Code: ${schoolCode || ""}\n` +
      `Directorate: ${directorate}\n` +
      `Total Students: ${totalStudents || 0}\n` +
      `Group Students: ${groupStudents || 0}\n` +
      `Individual Students: ${individualStudents || 0}\n\n` +
      `${participationCategories || ""}`;

    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

    output.push([
      schoolCode || master.schoolCode || "",
      schoolName || "",
      schoolEmail || "",
      directorate || "",
      totalStudents || "",
      groupStudents || "",
      individualStudents || "",
      participationCategories || "",
      master.suburb || "",
      master.postcode || "",
      master.lga || "",
      master.sa4 || "",
      master.remoteness || "",
      latitude,
      longitude,
      mapLabel,
      mapDescription,
      mapsLink
    ]);
  }

  const sheetName = "School Map Export";
  let exportSheet = ss.getSheetByName(sheetName);
  if (!exportSheet) exportSheet = ss.insertSheet(sheetName);
  exportSheet.clear();

  exportSheet
    .getRange(1, 1, output.length, output[0].length)
    .setValues(output);

  exportSheet.getRange(1, 1, 1, output[0].length)
    .setFontWeight("bold")
    .setBackground("#00ff80");

  exportSheet.getRange(2, 8, Math.max(output.length - 1, 1), 1)
    .setWrap(true);

  exportSheet.getRange(2, 17, Math.max(output.length - 1, 1), 1)
    .setWrap(true);

  exportSheet.autoResizeColumns(1, output[0].length);
  exportSheet.setFrozenRows(1);

  SpreadsheetApp.getUi().alert(
    `School Map Export created with ${output.length - 1} schools.`
  );
}

function exportSchoolSummaryToExcel() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName("School Summary");

  if (!sourceSheet) {
    SpreadsheetApp.getUi().alert("School Summary sheet not found.");
    return;
  }

  const values = sourceSheet.getDataRange().getValues();

  const tempSS = SpreadsheetApp.create("School Summary Mail Merge Export");
  const tempSheet = tempSS.getSheets()[0];
  tempSheet.setName("School Summary");

  tempSheet
    .getRange(1, 1, values.length, values[0].length)
    .setValues(values);

  tempSheet.getRange(1, 1, 1, values[0].length)
    .setFontWeight("bold")
    .setBackground("#00ff80");

  tempSheet.setFrozenRows(1);
  tempSheet.autoResizeColumns(1, values[0].length);

  if (tempSheet.getFilter()) {
    tempSheet.getFilter().remove();
  }

  const exportUrl =
    "https://docs.google.com/spreadsheets/d/" +
    tempSS.getId() +
    "/export?format=xlsx";

  const token = ScriptApp.getOAuthToken();

  const response = UrlFetchApp.fetch(exportUrl, {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const blob = response.getBlob().setName("School Summary Mail Merge.xlsx");
  const file = DriveApp.createFile(blob);

  DriveApp.getFileById(tempSS.getId()).setTrashed(true);

  SpreadsheetApp.getUi().alert(
    "Excel export created successfully.\n\n" + file.getUrl()
  );
}