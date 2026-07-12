/** Shared relationship and impact queries across canonical platform entities. */
const RelationshipService = (() => {
  const MODEL = [
    { from: "Participant", relation: "belongsTo", to: "School", via: "schoolId" },
    { from: "Participant", relation: "performs", to: "Item", via: "itemId" },
    { from: "Participant", relation: "belongsTo", to: "Category", via: "categoryId" },
    { from: "Participant", relation: "appearsIn", to: "Rehearsal", resolver: "participantMatchesEvent" },
    { from: "Teacher", relation: "belongsTo", to: "School", via: "schoolId" },
    { from: "Teacher", relation: "owns", to: "Group", via: "teacherId" },
    { from: "Group", relation: "belongsTo", to: "Segment", via: "segmentId" },
    { from: "Group", relation: "contains", to: "Participant", resolver: "group assignment" },
    { from: "TimelineEvent", relation: "occursAt", to: "Venue", via: "venueId" },
    { from: "Rehearsal", relation: "creates", to: "AttendanceSession", resolver: "date/name/location compatibility match" },
    { from: "AttendanceSession", relation: "records", to: "AttendanceRecord", via: "sessionId" },
    { from: "Production", relation: "contains", to: "Segment", via: "productionId" }
  ];

  function getModel() { return MODEL.map(item => Object.assign({}, item)); }
  function participantMatchesEvent(participant, event) {
    if (!participant || !event || event.eventType === "Operational Event") return false;
    const participantGroups = [participant.category, participant.discipline, participant.subDiscipline, participant.item]
      .map(EntityModelService.normaliseKey).filter(Boolean);
    const eventGroups = (event.categories || []).concat(event.studentGroups || [])
      .map(EntityModelService.normaliseKey).filter(Boolean);
    const categoryMatch = participantGroups.some(value => eventGroups.includes(value));
    const schoolMatch = (event.schoolGroups || []).map(EntityModelService.normaliseKey)
      .includes(EntityModelService.normaliseKey(participant.school));
    const identities = [participant.applicationId, participant.studentId, participant.studentEmail,
      participant.name, [participant.name, participant.school].filter(Boolean).join(" ")]
      .map(EntityModelService.normaliseKey).filter(Boolean);
    const individualMatch = (event.individualStudents || []).map(EntityModelService.normaliseKey)
      .some(value => identities.includes(value));
    return categoryMatch || schoolMatch || individualMatch;
  }

  function getRehearsalsForParticipant(studentKey) {
    const participant = ParticipantService.getByStudentKey(studentKey);
    if (!participant) return [];
    return TimelineService.getTimelineEvents({ rehearsalsOnly: true })
      .filter(event => participantMatchesEvent(participant, event));
  }

  function getAffectedParticipants(eventId) {
    const event = findTimelineEvent_(eventId);
    return event ? ParticipantService.getAll().filter(participant => participantMatchesEvent(participant, event)) : [];
  }

  function getAffectedParticipantsWithReasons(eventId) {
    const event = findTimelineEvent_(eventId);
    if (!event) return { participants: [], unresolvedSelections: [] };
    const all = ParticipantService.getAll();
    const selections = (event.individualStudents || []).map(EntityModelService.normaliseKey).filter(Boolean);
    const nameCounts = {};
    all.forEach(participant => {
      const key = EntityModelService.normaliseKey(participant.name || [participant.firstName, participant.lastName].filter(Boolean).join(" "));
      if (key) nameCounts[key] = (nameCounts[key] || 0) + 1;
    });
    const unresolvedSelections = selections.filter(selection => nameCounts[selection] > 1)
      .map(selection => "The selection '" + selection + "' matches more than one participant; use an ID, email, or name plus school.");
    const participants = all.map(participant => {
      const reasons = [];
      const values = [participant.category, participant.discipline, participant.subDiscipline, participant.item].map(EntityModelService.normaliseKey).filter(Boolean);
      const categoryGroups = (event.categories || []).concat(event.studentGroups || []).map(EntityModelService.normaliseKey).filter(Boolean);
      if (values.some(value => categoryGroups.includes(value))) reasons.push("Category or student group");
      if ((event.schoolGroups || []).map(EntityModelService.normaliseKey).includes(EntityModelService.normaliseKey(participant.school))) reasons.push("School group");
      const name = EntityModelService.normaliseKey(participant.name || [participant.firstName, participant.lastName].filter(Boolean).join(" "));
      const strongIdentities = [participant.applicationId, participant.studentId, participant.studentEmail, [participant.name, participant.school].filter(Boolean).join(" ")].map(EntityModelService.normaliseKey).filter(Boolean);
      if (selections.some(selection => strongIdentities.includes(selection) || (selection === name && nameCounts[name] === 1))) reasons.push("Individual student");
      return Object.assign({}, participant, { matchReasons: reasons });
    }).filter(participant => participant.matchReasons.length);
    return { participants, unresolvedSelections };
  }

  function getSchoolsForSegment(segment) {
    const key = EntityModelService.normaliseKey(segment);
    const names = ParticipantService.getGroups().filter(group => EntityModelService.normaliseKey(group.segment) === key)
      .map(group => group.school).filter(Boolean);
    return ParticipantService.getActiveSchoolsData(ParticipantService.getAll(), ParticipantService.getGroups())
      .filter(school => names.map(EntityModelService.normaliseKey).includes(EntityModelService.normaliseKey(school.schoolName)));
  }

  function getTeachersForDate(dateKey) {
    const participants = uniqueParticipants_(TimelineService.getTimelineEvents({ rehearsalsOnly: true })
      .filter(event => event.dateKey === dateKey).flatMap(event => getAffectedParticipants(event.id)));
    const teachers = {};
    participants.forEach(participant => {
      const key = EntityModelService.normaliseKey(participant.teacherEmail || participant.teacherName);
      if (key) teachers[key] = { id: EntityModelService.stableId("TCH", key), name: participant.teacherName || "", email: participant.teacherEmail || "", school: participant.school || "" };
    });
    return Object.values(teachers);
  }

  function getParticipantsAtVenue(venue, dateKey) {
    const venueKey = EntityModelService.normaliseKey(venue);
    const events = TimelineService.getTimelineEvents({ rehearsalsOnly: true }).filter(event =>
      EntityModelService.normaliseKey(event.venue) === venueKey && (!dateKey || event.dateKey === dateKey));
    return uniqueParticipants_(events.flatMap(event => getAffectedParticipants(event.id)));
  }

  function linkAttendanceSessions(events) {
    let sessions = [];
    try {
      const response = AttendanceService.getEvents();
      sessions = response && response.ok && Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      return events || [];
    }
    return (events || []).map(event => {
      if (event.eventType !== "Rehearsal") return event;
      const session = sessions.find(item => attendanceMatchesEvent_(item, event));
      return Object.assign({}, event, { attendanceSession: session ? { id: session.id, sessionId: session.sessionId, sheetName: session.sheetName, studentCount: session.studentCount } : null });
    });
  }

  function attendanceMatchesEvent_(session, event) {
    if (session.dateKey && event.dateKey && session.dateKey !== event.dateKey) return false;
    const sessionName = EntityModelService.normaliseKey(session.eventName);
    const eventName = EntityModelService.normaliseKey(event.title);
    if (!sessionName || !eventName || sessionName !== eventName) return false;
    const sessionLocation = EntityModelService.normaliseKey(session.location);
    const eventLocation = EntityModelService.normaliseKey(event.venue);
    return !sessionLocation || !eventLocation || sessionLocation === eventLocation;
  }

  function findTimelineEvent_(eventId) {
    const target = String(eventId || "");
    return TimelineService.getTimelineEvents().find(event => event.id === target || (event.legacyIds || []).includes(target)) || null;
  }

  function uniqueParticipants_(participants) {
    const byId = {};
    (participants || []).forEach(participant => { if (participant.id) byId[participant.id] = participant; });
    return Object.values(byId);
  }

  return { getModel, participantMatchesEvent, getRehearsalsForParticipant, getAffectedParticipants, getAffectedParticipantsWithReasons, getSchoolsForSegment, getTeachersForDate, getParticipantsAtVenue, linkAttendanceSessions };
})();
