/** Server-side search foundation returning navigation-safe entity references. */
const PlatformSearchService = (() => {
  function search(query, options) {
    const text = EntityModelService.normaliseKey(query);
    const limit = Math.min(Number(options && options.limit) || 50, 100);
    if (text.length < 2) return [];
    const results = [];
    ParticipantService.getAll().forEach(item => add_(results, text, "participant", item.id, item.name, [item.school, item.item, item.category, item.teacherName]));
    ParticipantService.getActiveSchoolsData(ParticipantService.getAll(), ParticipantService.getGroups())
      .forEach(item => add_(results, text, "school", item.id, item.schoolName, [item.directorate]));
    ParticipantService.getGroups().forEach(item => add_(results, text, "group", item.id, item.groupName || item.item, [item.school, item.category, item.teacherName]));
    StaffService.getAll().forEach(item => add_(results, text, "staff", item.id, item.name || item.email, [item.department, item.role]));
    TimelineService.getCalendarData().events.forEach(item => add_(results, text, "timeline", item.id, item.title, [item.date, item.venue, item.area, item.eventType]));
    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
  }
  function add_(results, query, type, id, title, fields) {
    const haystack = EntityModelService.normaliseKey([title].concat(fields || []).join(" "));
    if (!haystack.includes(query)) return;
    results.push({ entityType: type, id, title: String(title || ""), meta: (fields || []).filter(Boolean).join(" · "), score: haystack === query ? 100 : haystack.startsWith(query) ? 75 : 30 });
  }
  return { search };
})();
