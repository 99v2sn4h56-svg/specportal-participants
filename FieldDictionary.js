/**
 * Canonical field dictionary for acceptance imports.
 *
 * The dictionary maps incoming column headings to canonical fields. At runtime
 * ImportService resolves each canonical field to the real destination sheet
 * header, so differently worded uploads do not create new spreadsheet columns.
 */

const ImportFieldDictionary = (() => {
  const common = {
    applicationId: {
      label: "Application ID",
      aliases: ["Application ID", "ApplicationId", "Application Id", "Submission ID", "Response ID", "Entry ID", "Form ID"]
    },
    schoolCode: {
      label: "School Code",
      aliases: ["School Code", "Code", "School ID", "School Number"]
    },
    school: {
      label: "Current School",
      aliases: ["Current School", "School", "School Name", "Name of School", "Organisation", "Educational Establishment"]
    },
    item: {
      label: "Item",
      aliases: ["Item", "Performance Item", "Act", "Routine", "Piece"]
    },
    category: {
      label: "Category",
      aliases: ["Category", "Category Acceptance", "Category Selection", "Discipline Category", "Ensemble", "Accepted Category"]
    },
    discipline: {
      label: "Discipline",
      aliases: ["Discipline", "Stream", "Program Area"]
    },
    subDiscipline: {
      label: "Sub-Discipline",
      aliases: ["Sub-Discipline", "Sub Discipline", "Subdiscipline", "Category Detail", "Successful Category", "Accepted Sub-Discipline"]
    },
    teacherFirstName: {
      label: "Teacher First Name",
      aliases: ["Teacher First Name", "Teacher Given Name", "Supervising Teacher First Name", "Teacher Name - First Name"]
    },
    teacherLastName: {
      label: "Teacher Last Name",
      aliases: ["Teacher Last Name", "Teacher Surname", "Teacher Family Name", "Supervising Teacher Surname", "Teacher Name - Last Name"]
    },
    teacherName: {
      label: "Teacher Name",
      aliases: ["Teacher Name", "Supervising Teacher", "Contact Teacher"]
    },
    teacherEmail: {
      label: "Teacher Email",
      aliases: ["Teacher Email", "Teacher Email (DET)", "Teacher Email (DoE)", "Teacher Email Address", "Teacher DoE Email", "Teacher DET Email", "2nd Teacher Email", "Second Teacher Email"]
    },
    teacherMobile: {
      label: "Teacher Mobile",
      aliases: ["Teacher Mobile", "Teacher Phone", "Teacher Phone Number", "Teacher Contact Number"]
    },
    principalFirstName: {
      label: "Principal First Name",
      aliases: ["Principal First Name", "Principal Given Name", "Principal Name - First Name"]
    },
    principalLastName: {
      label: "Principal Last Name",
      aliases: ["Principal Last Name", "Principal Surname", "Principal Family Name", "Principal Name - Last Name"]
    },
    principalEmail: {
      label: "Principal Email",
      aliases: ["Principal Email", "Principal Email Address"]
    },
    directorate: {
      label: "Directorate",
      aliases: ["Directorate", "Network", "Operational Directorate"]
    },
    cost: {
      label: "Cost",
      aliases: ["Cost", "Cost Per Student", "Fee", "Student Fee", "Participation Fee"]
    },
    accepted: {
      label: "Accepted?",
      aliases: ["Accepted?", "Accepted", "Status", "Offer Status"]
    },
    notes: {
      label: "Notes",
      aliases: ["Notes", "Comments", "Additional Notes", "Original Notes"]
    }
  };

  const individual = Object.assign({}, common, {
    studentId: {
      label: "Student ID",
      aliases: ["Student ID", "Student Number", "StudentId"]
    },
    srn: {
      label: "SRN",
      aliases: ["SRN", "Student Registration Number"]
    },
    firstName: {
      label: "Student First Name",
      aliases: ["Student First Name", "Student Given Name", "First Name", "Given Name", "Student Name First Name"]
    },
    lastName: {
      label: "Student Last Name",
      aliases: ["Student Last Name", "Student Surname", "Last Name", "Surname", "Family Name", "Student Name Last Name"]
    },
    fullName: {
      label: "Student Name",
      aliases: ["Student Name", "Full Name", "Student Full Name", "Name"]
    },
    dob: {
      label: "Date of Birth",
      aliases: ["Date of Birth", "DOB", "Birth Date", "Student DOB"]
    },
    year: {
      label: "Student Year",
      aliases: ["Student Year", "Year", "Year Group", "School Year", "Current Year", "Student School Year"]
    },
    studentEmail: {
      label: "Student Email",
      aliases: ["Student Email", "Student Email Address"]
    },
    studentMobile: {
      label: "Student Mobile",
      aliases: ["Student Mobile", "Student Phone", "Student Mobile Phone", "Mobile"]
    },
    parentName: {
      label: "Parent Name",
      aliases: ["Parent Name", "Parent/Carer Name", "Primary Parent Name", "Caregiver Name"]
    },
    parentEmail: {
      label: "Parent Email",
      aliases: ["Parent Email", "Parent/Carer Email", "Primary Parent Email", "Parent Email Address", "Caregiver Email"]
    },
    parentPhone: {
      label: "Parent Phone",
      aliases: ["Parent Phone", "Parent Mobile", "Parent/Carer Phone", "Primary Parent Phone"]
    }
  });

  const group = Object.assign({}, common, {
    groupName: {
      label: "Group Name",
      aliases: ["Group Name", "Ensemble Name", "Choir Name", "Dance Group Name", "School Group Name"]
    },
    studentCount: {
      label: "Student Count",
      aliases: ["Student Count", "Count", "Number of Students", "No Students", "No. Students", "Students", "Allocation", "Number Allocated", "Total Students"]
    },
    boys: {
      label: "Boys",
      aliases: ["Boys", "Male Students", "Number of Boys"]
    },
    aboriginal: {
      label: "Aboriginal Students",
      aliases: ["Aboriginal Students", "Aboriginal", "First Nations Students", "Aboriginal and Torres Strait Islander"]
    },
    adjustments: {
      label: "Adjustments",
      aliases: ["Adjustments", "Additional Learning Needs", "Access Requirements", "Disability Adjustments"]
    },
    classroom: {
      label: "Classroom",
      aliases: ["Classroom", "Room", "Roll Class"]
    }
  });

  function get(type) {
    return type === "group" ? group : individual;
  }

  function normaliseHeading(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildAliasMap(type) {
    const fields = get(type);
    const map = {};

    Object.keys(fields).forEach(key => {
      const field = fields[key];
      [field.label].concat(field.aliases || []).forEach(alias => {
        map[normaliseHeading(alias)] = key;
      });
    });

    return map;
  }

  return {
    get,
    buildAliasMap,
    normaliseHeading
  };
})();
