/** Server-side search foundation returning navigation-safe entity references. */
const PlatformSearchService = (() => {
  function search(query, options) {
    const text = EntityModelService.normaliseKey(query);
    const limit = Math.min(Number(options && options.limit) || 50, 100);
    if (text.length < 2) return [];
    const results = [];
    const user = UserContextService.getCurrent();
    const canViewParticipants = UserContextService.hasCapability("Participants.View");
    const canViewCalendar = UserContextService.hasCapability("Calendar.View");
    const canViewAttendance = UserContextService.hasCapability("Attendance.View");
    const canViewStaff = UserContextService.hasCapability("Operations.View");
    // ParticipantService.getAll()/getGroups() already cache themselves
    // (stale-while-revalidate, under these exact same "participants:all" /
    // "participants:groups" keys). Wrapping them in a second, independent
    // PerformanceCacheService.getOrLoad(...) call under the identical key
    // string was a real bug, not just redundant work: both writers hash to
    // the same physical cache slot, but store different shapes -- a plain
    // array here vs. ParticipantService's SWR envelope object. Whichever
    // format was already cached (almost always the SWR envelope, since
    // ParticipantService's own callers run far more often) got returned
    // as-is, so filterParticipantsForUser_/filterGroupsForUser_ below would
    // call .filter() on a non-array envelope and throw. Calling these
    // directly uses ParticipantService's own correct caching instead.
    const participants = canViewParticipants ? filterParticipantsForUser_(ParticipantService.getAll(), user) : [];
    const groups = canViewParticipants ? filterGroupsForUser_(ParticipantService.getGroups(), user) : [];
    const timeline = canViewCalendar ? filterEventsForUser_(TimelineService.getCalendarData().events || [], user) : [];
    participants.forEach(item => add_(results, text, "participant", item.id, item.name, [item.school, item.item, item.category, item.teacherName]));
    ParticipantService.getActiveSchoolsData(participants, groups)
      .forEach(item => add_(results, text, "school", item.id, item.schoolName, [item.directorate]));
    groups.forEach(item => add_(results, text, "group", item.id, item.groupName || item.item, [item.school, item.category, item.teacherName]));
    if (canViewStaff) StaffService.getAll().forEach(item => add_(results, text, "staff", item.id, item.displayName || item.name || item.email, [item.preferredName, item.email, item.mobile, item.staffId, item.department, item.productionRole, item.specCentralRole, item.employment, item.school, item.organisation, (item.teams || []).join(" "), (item.categoryResponsibilities || []).join(" ")]));
    timeline.forEach(item => add_(results, text, item.eventType === "Rehearsal" ? "rehearsal" : "event", item.id, item.title, [item.date, item.venue, item.area, item.eventType, (item.staff || []).join(" ")]));
    if (canViewStaff) try { ShowRunService.getItems().forEach(item => add_(results, text, "item", item.id, item.title, [item.itemNumber, item.segment, item.artist, item.duration, item.cast])); } catch (err) {}
    uniqueBy_(participants.map(item => ({ id: EntityModelService.stableId("TCH", item.teacherEmail || item.teacherName), title: item.teacherName || item.teacherEmail, meta: [item.teacherEmail, item.school].filter(Boolean) })), "id")
      .forEach(item => add_(results, text, "teacher", item.id, item.title, item.meta));
    uniqueBy_(timeline.map(item => ({ id: item.venueId || EntityModelService.stableId("VEN", item.venue), title: item.venue, meta: [item.area] })), "id")
      .forEach(item => add_(results, text, "venue", item.id, item.title, item.meta));
    if (canViewAttendance) try {
      const response = AttendanceService.getEvents();
      const sessions = response && response.ok && Array.isArray(response.data) ? response.data : [];
      sessions.forEach(item => add_(results, text, "attendance", item.sessionId || item.id, item.eventName, [item.date, item.time, item.location, item.studentCount + " students"]));
    } catch (err) {}
    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
  }
  function uniqueBy_(items, key) { const seen = {}; return items.filter(item => item.title && item[key] && !seen[item[key]] && (seen[item[key]] = true)); }
  function add_(results, query, type, id, title, fields) {
    const haystack = EntityModelService.normaliseKey([title].concat(fields || []).join(" "));
    if (!haystack.includes(query)) return;
    results.push({ entityType: type, id, title: String(title || ""), meta: (fields || []).filter(Boolean).join(" · "), score: haystack === query ? 100 : haystack.startsWith(query) ? 75 : 30 });
  }
  return { search };
})();
