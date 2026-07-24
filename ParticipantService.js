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
    NAME: "Student Name",
    APPLICATION_ID: "Application ID",
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

/**
 * Returns every participant as an array of objects.
 */
ParticipantService.getAll = function () {
  const requestStarted = Date.now();
  const loadFromSheet_ = () => {

  const sheet = this.getIndividualsSheet();

  const data = stringifyRows_(sheet.getDataRange().getValues());

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
    name: getFirstIndex([this.FIELDS.NAME, "Name"]),
    applicationId: getFirstIndex([this.FIELDS.APPLICATION_ID, "Application Id", "Application"]),
    school: getFirstIndex([this.FIELDS.SCHOOL, "School"]),
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
    studentId: getFirstIndex([this.FIELDS.STUDENT_ID, this.FIELDS.SRN]),
    srn: getIndex(this.FIELDS.SRN),
    photoId: getFirstIndex(["PhotoID", "Photo ID", "Photo Id", "Drive Photo ID", "Headshot ID"]),
    photoUrl: getFirstIndex(["Photo URL", "PhotoURL", "Headshot URL", "HeadshotURL", "Image URL"]),
    region: getFirstIndex(["Region", "School Region"]),
    directorate: getFirstIndex(["Directorate"]),
    gender: getFirstIndex(["Gender", "Student Gender"]),
    notes: getFirstIndex(["Notes", "Participant Notes", "Application Notes"]),
    lote: getFirstIndex(["LOTE", "Language Other Than English"]),
    aboriginal: getFirstIndex(["Aboriginal", "Aboriginal Student", "Aboriginality"]),
    torresStraitIslander: getFirstIndex(["Torres Strait Islander", "TSI"]),
    eald: getFirstIndex(["EAL/D", "EALD"]),
    supportAdjustments: getFirstIndex(["Support Adjustments", "Adjustments Required"]),
    supportPlan: getFirstIndex(["Support Plan", "Support Plan ID", "Support Plan URL"]),
    medicalAlert: getFirstIndex(["Medical Alert", "Medical", "Medical Information"]),
    firstTime: getFirstIndex(["First Time", "First Time Participant", "First Time at Spec"]),
    returningStudent: getFirstIndex(["Returning Student", "Returning Participant"]),
    featuredPerformer: getFirstIndex(["Featured Performer", "Featured"]),
    supervisingTeacherRequired: getFirstIndex(["Supervising Teacher Required", "Teacher Required"]),
    applicationStatus: getFirstIndex(["Application Status", "Status", "Acceptance Status"]),
    participationType: getFirstIndex(["Participation Type", "Participant Type", "Entry Type"]),
    segment: getFirstIndex(["Segment", "Production Segment"]),
    staffAllocation: getFirstIndex(["Staff Allocation", "Assigned Staff", "Allocated Staff"]),
    schoolGroup: getFirstIndex(["School Group", "Group Name"]),
    outstandingForms: getFirstIndex(["Outstanding Forms", "Forms Outstanding"]),
    attendanceStatus: getFirstIndex(["Attendance Status", "Latest Attendance Status"]),
    lastUpdated: getFirstIndex(["Last Updated", "Updated At", "Modified"])
  };
  const getCell = (row, index) => index >= 0 ? row[index] : "";
  const hasIndicator = value => {
    const text = String(value || "").trim().toLowerCase();
    return !!text && !["no", "n", "false", "none", "not required", "0"].includes(text);
  };
  const normaliseGender = value => {
    const text = String(value || "").trim().toLowerCase();
    if (["male", "m", "boy"].includes(text)) return "Male";
    if (["female", "f", "girl"].includes(text)) return "Female";
    return "N/A";
  };

  return data.map(row => {

   const participant = {

  firstName: getCell(row, indexes.firstName),
  lastName: getCell(row, indexes.lastName),
  name: getCell(row, indexes.name),
  applicationId: getCell(row, indexes.applicationId),

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
  photoUrl: getCell(row, indexes.photoUrl),

  region: getCell(row, indexes.region) || getCell(row, indexes.directorate),
  directorate: getCell(row, indexes.directorate),
  gender: normaliseGender(getCell(row, indexes.gender)),
  notes: getCell(row, indexes.notes),
  lote: getCell(row, indexes.lote),
  aboriginal: hasIndicator(getCell(row, indexes.aboriginal)),
  torresStraitIslander: hasIndicator(getCell(row, indexes.torresStraitIslander)),
  eald: hasIndicator(getCell(row, indexes.eald)),
  hasSupportAdjustments: hasIndicator(getCell(row, indexes.supportAdjustments)),
  hasSupportPlan: hasIndicator(getCell(row, indexes.supportPlan)),
  hasMedicalAlert: hasIndicator(getCell(row, indexes.medicalAlert)),
  firstTime: hasIndicator(getCell(row, indexes.firstTime)),
  returningStudent: hasIndicator(getCell(row, indexes.returningStudent)),
  featuredPerformer: hasIndicator(getCell(row, indexes.featuredPerformer)),
  supervisingTeacherRequired: hasIndicator(getCell(row, indexes.supervisingTeacherRequired)),
  applicationStatus: getCell(row, indexes.applicationStatus),
  participationType: getCell(row, indexes.participationType),
  segment: getCell(row, indexes.segment),
  staffAllocation: getCell(row, indexes.staffAllocation),
  schoolGroup: getCell(row, indexes.schoolGroup),
  outstandingForms: hasIndicator(getCell(row, indexes.outstandingForms)),
  attendanceStatus: getCell(row, indexes.attendanceStatus),
  lastUpdated: getCell(row, indexes.lastUpdated)

};

    participant.name = participant.name || [participant.firstName, participant.lastName].filter(Boolean).join(" ");
    participant.studentKey = this.makeStudentKey(participant);

    return EntityModelService.participant(participant);

  }).filter(participant => String(participant.firstName || participant.lastName || participant.name || "").trim());
  };
  // The lease-based cache throws CACHE_REBUILD_BUSY under contention instead
  // of blocking, so every synchronous caller (participant detail, headshots,
  // filters, groups) that doesn't itself have stale-while-revalidate handling
  // would otherwise surface a hard error to the user. This is the single
  // shared read every one of those paths goes through, so falling back to an
  // uncached direct sheet read here (rather than in each caller separately)
  // fixes all of them at once.
  let result;
  try {
    // Stale-while-revalidate, not a blocking rebuild: on a cold/expired
    // cache with concurrent requests, the blocking form (getOrLoadDetailed)
    // makes every "losing" request poll for up to ~10s waiting on the
    // winner, then fall back to its OWN full uncached sheet read if the
    // winner hasn't finished -- a thundering herd where several requests
    // each independently pay this read's full cost, some after already
    // burning ~10s polling first. This is the same fix already applied to
    // getDetail()/getGroups() projections; getAll() -- the single most
    // depended-on read in the whole app -- had never been migrated to it.
    result = PerformanceCacheService.getOrLoadStaleWhileRevalidate("participants:all", 5 * 60, 30 * 60, () => loadWithEmptyGuard_("participants:all", loadFromSheet_));
  } catch (error) {
    if (!/CACHE_REBUILD_BUSY/.test(String(error && error.message || ""))) throw error;
    result = { value: loadFromSheet_(), meta: { cache: "busy-direct-fallback" } };
  }
  PerformanceTelemetryService.record("participants.dataset.request", Date.now() - requestStarted, { cache: result.meta.cache, records: (result.value || []).length, sourceRows: (result.value || []).length, projection: "canonical-participants" });
  return result.value;

};

/**
 * Matches Attendance.makeStudentKey_ exactly. Both projects read these values
 * from the Participants workbook, so this is the canonical cross-project key.
 */
ParticipantService.makeStudentKey = function (participant) {
  return EntityModelService.participant(participant).studentKey;
};

ParticipantService.hasStudentKey = function (studentKey) {
  const target = String(studentKey || "").trim();
  if (!target) return false;
  return this.getAll().some(participant => participant.studentKey === target);
};

ParticipantService.getByStudentKey = function (studentKey) {
  const target = String(studentKey || "").trim();
  if (!target) return null;
  return this.getAll().find(participant => participant.studentKey === target) || null;
};
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
  const loadFromSheet_ = () => {
  const sheet = this.getGroupsSheet();
  if (!sheet) return [];

  const values = stringifyRows_(sheet.getDataRange().getValues());
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
  const groupIdIndex = getIndex(["Group ID", "Group Id"]);
  // Preferred names use the "(1)"/"(2)" scheme applied to GROUPS(YES) --
  // older candidates are kept as fallbacks in case a sheet still has the
  // pre-rename headers.
  const teacherEmailIndex = getIndex(["Contact teacher email (1)", "Teacher Email", "Contact teacher's email", "Teacher email (DoE)", "All Teacher Emails"]);
  const classroomIndex = getIndex(["Google Classroom", "Classroom"]);
  const teacherFirstIndex = getIndex(["Contact teacher first name (1)", "Contact teacher's first name", "Teacher first name", "Teacher First Name"]);
  const teacherLastIndex = getIndex(["Contact teacher surname (1)", "Contact teacher's surname", "Teacher surname", "Teacher Last Name"]);
  const teacherMobileIndex = getIndex(["Contact teacher mobile (1)", "Contact teacher's mobile number", "Teacher mobile", "Teacher Mobile", "Teacher phone"]);
  const teacherRoleIndex = getIndex(["Contact teacher role (1)", "Contact teacher's role at the school", "Teacher role at school", "Teacher role", "Role at school"]);
  const teacherAlumniIndex = getIndex(["Alumni (1)", "Are you a Spec Alumni?", "Spec Alumni", "Alumni"]);
  const teacherAlumniRoleIndex = getIndex(["Alumni experience (1)", "If you selected \"yes\", can you please tell us when and what role? You can also share a memory if you like.", "Spec Alumni Role", "Spec Alumni Roles", "Alumni Role"]);
  const teacherTaughtBeforeIndex = getIndex(["Teacher before (1)"]);
  const teacherFirstTimeIndex = getIndex(["1st Time", "First Time", "First time"]);
  const secondTeacherFirstIndex = getIndex(["Contact teacher first name (2)", "2nd teacher first name", "2nd Teacher First Name", "Second teacher first name"]);
  const secondTeacherLastIndex = getIndex(["Contact teacher surname (2)", "2nd teachers surname", "2nd Teacher Surname", "Second teacher surname"]);
  const secondTeacherEmailIndex = getIndex(["Contact teacher email (2)", "2nd teacher email", "2nd Teacher Email", "Second teacher email"]);
  const secondTeacherMobileIndex = getIndex(["Contact teacher mobile (2)", "2nd teacher mobile", "2nd Teacher Mobile", "Second teacher mobile"]);
  const secondTeacherRoleIndex = getIndex(["Contact teacher role (2)", "2nd teacher role at school", "2nd Teacher Role at School", "Second teacher role at school"]);
  const secondTeacherAlumniIndex = getIndex(["Alumni (2)", "Are you a Spec Alumni? 2", "2nd teacher Spec Alumni", "Second teacher Spec Alumni"]);
  const secondTeacherAlumniRoleIndex = getIndex(["Alumni experience (2)", "2nd teacher Spec Alumni Role", "Second teacher Spec Alumni Role", "2nd teacher alumni role"]);
  const secondTeacherTaughtBeforeIndex = getIndex(["Teacher before (2)"]);
  const schoolEmailIndex = getIndex(["School email address", "School Email"]);
  const schoolPhoneIndex = getIndex(["School phone", "School Phone"]);
  const principalFirstIndex = getIndex(["Principal's first name", "Principal first name"]);
  const principalLastIndex = getIndex(["Principal's surname", "Principal surname"]);
  const principalEmailIndex = getIndex(["Principal's email", "Principal email"]);

  return values.slice(1)
    .filter(row => row.some(cell => cell !== "" && cell !== null))
    .map(row => EntityModelService.group({
      groupId: row[groupIdIndex] || "",
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
      teacherTaughtBefore: row[teacherTaughtBeforeIndex] || "",
      teacherFirstTime: row[teacherFirstTimeIndex] || "",
      secondTeacherName: [row[secondTeacherFirstIndex], row[secondTeacherLastIndex]].filter(Boolean).join(" "),
      secondTeacherEmail: row[secondTeacherEmailIndex] || "",
      secondTeacherMobile: row[secondTeacherMobileIndex] || "",
      secondTeacherRole: row[secondTeacherRoleIndex] || "",
      secondTeacherContactType: "Second contact",
      secondTeacherIsSpecAlumni: row[secondTeacherAlumniIndex] || "",
      secondTeacherSpecRoles: row[secondTeacherAlumniRoleIndex] || "",
      secondTeacherTaughtBefore: row[secondTeacherTaughtBeforeIndex] || "",
      schoolEmail: row[schoolEmailIndex] || "",
      schoolPhone: row[schoolPhoneIndex] || "",
      principalName: [row[principalFirstIndex], row[principalLastIndex]].filter(Boolean).join(" "),
      principalEmail: row[principalEmailIndex] || ""
    }));
  };
  try {
    // Same thundering-herd fix as getAll() above -- see that comment.
    return PerformanceCacheService.getOrLoadStaleWhileRevalidate("participants:groups", 5 * 60, 30 * 60, () => loadWithEmptyGuard_("participants:groups", loadFromSheet_)).value;
  } catch (error) {
    if (!/CACHE_REBUILD_BUSY/.test(String(error && error.message || ""))) throw error;
    return loadFromSheet_();
  }
};

/**
 * Returns the schools master data used by Spec Portal.
 */
ParticipantService.getSchoolsMasterData = function () {
  const loadFromSheet_ = () => {
    const sheet = this.getSchoolsMasterSheet();
    if (!sheet) return [];

    const values = stringifyRows_(sheet.getDataRange().getValues());
    if (values.length < 2) return [];

    return values.slice(1)
      .filter(row => row.some(cell => cell !== "" && cell !== null))
      .map(row => EntityModelService.school({
        code: row[0] || "",
        schoolName: row[2] || "",
        schoolEmail: row[7] || "",
        directorate: row[31] || ""
      }))
      .filter(school => school.schoolName);
  };
  try {
    // Same thundering-herd fix as getAll() above -- see that comment.
    return PerformanceCacheService.getOrLoadStaleWhileRevalidate("participants:schools", 5 * 60, 30 * 60, () => loadWithEmptyGuard_("participants:schools", loadFromSheet_)).value;
  } catch (error) {
    if (!/CACHE_REBUILD_BUSY/.test(String(error && error.message || ""))) throw error;
    return loadFromSheet_();
  }
};

// getValues() (raw types) is much cheaper than getDisplayValues() (Sheets
// has to compute rendered formatting per cell) but returns numbers/dates as
// actual JS types instead of strings. Every field-extraction line in this
// file already assumes string cells (String(value||"") coercions,
// header.indexOf-style comparisons, strict === filter matching on the
// client for fields like "year"), so normalising the whole raw grid to
// strings once, right after the fast read, keeps every downstream line
// unchanged while still getting the read-time win. Numbers stringify
// identically to how a plain (unformatted) display value would read
// (String(7) === "7"); only cells with meaningful custom number/date
// formatting would look different, and none of the fields read via
// getAll()/getGroups()/getSchoolsMasterData() are treated as
// display-formatted numbers or dates by any downstream consumer.
function stringifyCell_(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function stringifyRows_(rows) {
  return rows.map(row => row.map(stringifyCell_));
}

// A fresh sheet read coming back with 0 rows while a cached non-empty
// result already exists is almost always a transient failure (a Sheets API
// hiccup under contention, a race during a concurrent rebuild), not a
// genuine "everyone was just deleted" event -- but stale-while-revalidate
// has no concept of "this result looks wrong, don't publish it": whatever
// a build returns gets cached and served until something explicitly
// invalidates it. This is what let a single bad empty read get stuck
// serving "0 School Groups" indefinitely until adminRefreshParticipantData()
// cleared it by hand. Guards the three base reads by checking the existing
// cached value (via peek(), which never triggers a rebuild) before trusting
// a fresh empty one -- explicit cache clears (which remove the entry
// outright, so peek() finds nothing) still take effect immediately.
function loadWithEmptyGuard_(cacheKey, loadFn) {
  const loaded = loadFn();
  if (!Array.isArray(loaded) || loaded.length > 0) return loaded;
  const previous = PerformanceCacheService.peek(cacheKey);
  const previousValue = previous && previous.__projectionCache ? previous.value : previous;
  if (Array.isArray(previousValue) && previousValue.length > 0) {
    Logger.log(`ParticipantService: fresh read for "${cacheKey}" returned 0 rows while a cached result with ${previousValue.length} already exists -- serving the cached data instead of overwriting it with what's likely a transient read failure.`);
    return previousValue;
  }
  return loaded;
}

function normaliseSchoolNameKey_(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function parseParticipantCount_(value) {
  const number = Number(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : 0;
}

function getGroupStudentCount_(group) {
  const accepted = String(group && group.acceptedCount || "").trim();
  const allocated = String(group && (group.allocatedCount || group.count) || "").trim();
  return parseParticipantCount_(accepted || allocated);
}

function hasNotAcceptedAllocationCount_(group) {
  const accepted = String(group && group.acceptedCount || "").trim();
  const allocated = String(group && (group.allocatedCount || group.count) || "").trim();
  return !accepted && parseParticipantCount_(allocated) > 0;
}

/**
 * Returns only schools that appear in live individual or group records.
 * Master data is used only to enrich those active schools.
 */
ParticipantService.getActiveSchoolsData = function (participants, groups) {
  const activeSchools = new Map();

  const addSchool = schoolName => {
    const name = String(schoolName || "").trim().replace(/\s+/g, " ");
    const key = normaliseSchoolNameKey_(name);
    if (key && !activeSchools.has(key)) {
      activeSchools.set(key, name);
    }
  };

  (participants || []).forEach(participant => addSchool(participant.school));
  (groups || []).forEach(group => addSchool(group.school));

  if (!activeSchools.size) return [];

  const masterByName = new Map();
  this.getSchoolsMasterData().forEach(school => {
    const key = normaliseSchoolNameKey_(school.schoolName);
    if (key) masterByName.set(key, school);
  });

  return Array.from(activeSchools.entries())
    .map(([key, schoolName]) => {
      const master = masterByName.get(key) || {};
      return EntityModelService.school({
        code: master.code || "",
        schoolName: master.schoolName || schoolName,
        schoolEmail: master.schoolEmail || "",
        directorate: master.directorate || ""
      });
    })
    .sort((a, b) => String(a.schoolName || "").localeCompare(String(b.schoolName || "")));
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

  // Principal/school contact details live per-group-application on
  // GROUPS(YES) (a school can have several group entries) -- take the
  // first non-blank value found across this school's groups.
  const firstNonBlank_ = field => { const hit = groups.find(g => String(g[field] || "").trim()); return hit ? hit[field] : ""; };
  const groupCategoryMap = new Map();
  groups.forEach(g => {
    const category = String(g.category || "").trim();
    if (!category) return;
    if (!groupCategoryMap.has(category)) groupCategoryMap.set(category, { name: category, count: 0, items: new Set() });
    const record = groupCategoryMap.get(category);
    record.count++;
    if (g.item) record.items.add(g.item);
  });

  return {
    schoolName: target,
    master,
    principalName: firstNonBlank_("principalName"),
    principalEmail: firstNonBlank_("principalEmail"),
    schoolEmail: firstNonBlank_("schoolEmail") || (master && master.schoolEmail) || "",
    schoolPhone: firstNonBlank_("schoolPhone"),
    groups,
    groupCount: groups.length,
    groupCategories: Array.from(groupCategoryMap.values()).map(c => ({ name: c.name, count: c.count, items: Array.from(c.items).sort() })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    participantCount: participants.length + groups.reduce((total, group) => total + getGroupStudentCount_(group), 0),
    participantCountNote: groups.some(hasNotAcceptedAllocationCount_) ? "Includes not accepted yet allocations" : "",
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
  const participants = this.getAll();
  const groups = this.getGroups();

  return {
    participants,
    groups,
    schools: this.getActiveSchoolsData(participants, groups),
    // Headshots are resolved lazily through the authenticated asset service.
    // No storage references or redundant photo maps enter the portal payload.
    photos: {}
  };
};

/**
 * Returns the lightweight discipline totals used by the dashboard.
 * The full participant payload remains lazy and is not sent to the browser.
 */
ParticipantService.getProductionOverview = function (participants) {
  const categories = {};
  (participants || this.getAll()).forEach(participant => {
    if (!String(participant.firstName || "").trim() && !String(participant.lastName || "").trim()) return;
    const source = [].concat(participant.categories || [], participant.discipline || participant.category || []).join(",");
    const seen = {};
    String(source).split(/[,;\n|]+/).map(value => value.trim()).filter(Boolean).forEach(name => {
      const key = name.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      categories[key] = categories[key] || { name, participants: 0 };
      categories[key].participants++;
    });
  });
  return Object.keys(categories).map(key => categories[key]);
};
