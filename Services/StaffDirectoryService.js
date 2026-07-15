/**
 * Read-only Staff Directory and Contact Centre projection.
 *
 * Canonical Staff records come from StaffService's cached merge of Staff List,
 * SpecCentral access and Staff Event Allocation. Sensitive administrative
 * fields are projected only after the current user's capabilities are checked.
 */
const StaffDirectoryService = (() => {
  function getDirectoryData() {
    const user = requireViewer_();
    const canonical = StaffService.getAll();
    const headshots = HeadshotAssetService.getMetadataMany("staff", canonical);
    const staff = canonical.map(item => directoryRecord_(item, headshots[stableId_(item)]));
    return {
      source: "Staff Production Team · Staff List + SpecCentral",
      generatedAt: new Date().toISOString(),
      staff,
      facets: facets_(staff),
      summary: summary_(staff),
      permissions: { canView: true, canViewAdministration: AuthorizationService.hasCapability(user, "Administration.View"), canEdit: false }
    };
  }

  function getProfile(id) {
    const user = requireViewer_();
    const staff = findStaff_(id);
    if (!staff) throw new Error("Staff profile was not found.");
    const admin = AuthorizationService.hasCapability(user, "Administration.View");
    const events = staffEvents_(staff);
    const assignedEvents = mergeAssignedEvents_(events, staff.eventAllocations || []);
    const tasks = staffTasks_(staff);
    const headshot = HeadshotAssetService.getMetadataMany("staff", [staff])[stableId_(staff)] || {};
    const result = Object.assign(directoryRecord_(staff, headshot), {
      preferredName: staff.preferredName || "",
      firstName: staff.firstName || "",
      lastName: staff.lastName || "",
      organisation: staff.organisation || "",
      experience: staff.experience || staff.alumniExperience || "",
      supervisor: staff.supervisor || "",
      notes: staff.notes || "",
      availability: staff.availability || "",
      roleDescription: staff.roleDescription || "",
      alumni: staff.alumni || "",
      employmentType: staff.employmentType || staff.employment || staff.typeOfWork || "",
      productionRoles: unique_(staff.productionRoles || [staff.productionRole]),
      teams: unique_(staff.teams || staff.departments || [staff.department]),
      categoryResponsibilities: unique_(staff.categoryResponsibilities || staff.assignedItems),
      assignedGroups: unique_(staff.assignedGroups),
      assignedEvents,
      timelineEvents: events,
      eventAllocations: staff.eventAllocations || [],
      currentProjects: tasks,
      activity: [],
      communications: [],
      relationshipStatus: {
        events: events.length ? "Connected" : "No matching Timeline allocation",
        projects: tasks.length ? "Connected" : "No matching project task",
        communications: "Ready for future integration"
      }
    });
    if (admin) {
      const directPermissions = StaffService.getPermissions(staff.email, staff);
      const grants = AuthorizationService.resolveGrants(Object.assign({}, staff, { permissions: directPermissions }));
      const effectivePermissions = unique_(grants.map(grant => grant.capability));
      result.administration = {
        effectivePermissions,
        capabilities: effectivePermissions,
        directPermissions: unique_(directPermissions),
        inheritedPermissions: unique_(AuthorizationService.getRoleCapabilities(staff.specCentralRole || staff.role)),
        inheritedRole: staff.specCentralRole || staff.role || "No Access",
        assignedRoles: unique_([staff.specCentralRole, staff.role]),
        categoryScope: staff.scope && staff.scope.type === "category" ? staff.scope.values || [] : [],
        departmentScope: staff.scope && staff.scope.type === "department" ? staff.scope.values || [] : [],
        scope: staff.scope || { type: "production", values: [] },
        emergencyContact: Object.assign({}, staff.emergencyContact || {}),
        audit: AuditService.list(100).filter(entry => entry.entity && entry.entity.type === "StaffMember" && [staff.id, staff.staffId, staff.email].includes(entry.entity.id))
      };
    }
    return { generatedAt: new Date().toISOString(), source: staff.source || "Staff Production Team spreadsheet", profile: result };
  }

  function directoryRecord_(staff, headshot) {
    const displayName = normaliseDisplayName_(staff.displayName || staff.name || "Staff member", staff.preferredName || "");
    return {
      id: stableId_(staff), staffId: staff.staffId || "", entityType: "StaffMember",
      name: displayName, displayName,
      preferredName: staff.preferredName || "", hasPhoto: !!(headshot && headshot.hasPhoto), assetKey: headshot && headshot.assetKey || "", assetVersion: headshot && headshot.assetVersion || "", email: staff.email || staff.primaryEmail || "", phone: staff.mobile || "", mobile: staff.mobile || "",
      department: staff.department || staff.team || "", departments: unique_(staff.departments || [staff.department]), team: staff.team || staff.department || "", teams: unique_(staff.teams || [staff.team, staff.department]),
      role: staff.productionRole || "", productionRole: staff.productionRole || "", productionRoles: unique_(staff.productionRoles || [staff.productionRole]),
      employment: staff.employment || staff.typeOfWork || "", employmentType: staff.employmentType || staff.employment || staff.typeOfWork || "",
      school: staff.school || "", organisation: staff.organisation || "", status: staff.status || "Active",
      specCentralRole: staff.specCentralRole || "No Access", specCentralAccess: !!staff.specCentralAccess, accessStatus: staff.accessStatus || (staff.specCentralAccess ? "Enabled" : "No Access"),
      permissionLevel: staff.specCentralAccess ? staff.specCentralRole || "Custom" : "No Access",
      categoryResponsibilities: unique_(staff.categoryResponsibilities || staff.assignedItems), badges: badges_(staff), incompleteProfile: !(staff.email || staff.primaryEmail) || !(staff.productionRole || staff.role) || !(staff.department || staff.team), source: staff.source || "Staff Production Team spreadsheet"
    };
  }

  function staffEvents_(staff) {
    const identities = unique_([staff.staffId, staff.email, staff.primaryEmail, staff.name, staff.displayName].concat(staff.allocatedEvents || [])).map(EntityModelService.normaliseKey);
    if (!identities.length) return [];
    return safe_(() => TimelineService.getTimelineEvents().filter(event => {
      const values = [].concat(event.staff || [], event.id || [], event.eventId || [], event.title || [], event.event || []).map(EntityModelService.normaliseKey);
      return identities.some(identity => values.includes(identity));
    }).map(event => ({ id: event.id || event.eventId || "", title: event.title || event.event || "Event", date: event.date || "", dateKey: event.dateKey || "", start: event.start || "", finish: event.finish || "", venue: event.venue || "", area: event.area || "", eventType: event.eventType || "Event", status: event.status || "" })), []);
  }

  function mergeAssignedEvents_(timelineEvents, allocations) {
    const merged = {};
    const add = event => {
      const value = Object.assign({}, event || {});
      value.title = value.title || value.event || "Event";
      value.time = value.time || [value.start, value.finish].filter(Boolean).join(" – ");
      value.venue = value.venue || value.location || "";
      const key = [value.title, value.date, value.venue].map(EntityModelService.normaliseKey).join("|");
      if (!key.replace(/\|/g, "")) return;
      merged[key] = Object.assign({}, merged[key] || {}, value);
    };
    (allocations || []).forEach(allocation => add({
      title: allocation.event || "Event",
      date: allocation.date || "",
      time: allocation.time || "",
      venue: allocation.location || "",
      role: allocation.role || "",
      department: allocation.department || "",
      eventType: "Staff allocation"
    }));
    (timelineEvents || []).forEach(add);
    return Object.keys(merged).map(key => merged[key]).sort((a, b) => {
      const aDate = Date.parse(a.dateKey || a.date || "") || Number.MAX_SAFE_INTEGER;
      const bDate = Date.parse(b.dateKey || b.date || "") || Number.MAX_SAFE_INTEGER;
      return aDate - bDate || String(a.title || "").localeCompare(String(b.title || ""));
    });
  }

  function staffTasks_(staff) {
    const identities = unique_([staff.email, staff.name, staff.displayName, staff.staffId]).map(EntityModelService.normaliseKey);
    return safe_(() => TaskService.list().filter(task => identities.includes(EntityModelService.normaliseKey(task.assignedUser))).map(task => ({ id: task.id, title: task.title, status: task.status, priority: task.priority, dueDate: task.dueDate, relatedEvent: task.relatedEvent || "", module: task.module || "Operations" })), []);
  }

  function findStaff_(id) { const target = String(id || "").trim().toLowerCase(); return StaffService.getAll().find(staff => [staff.id, staff.staffId, staff.email, staff.primaryEmail].map(value => String(value || "").trim().toLowerCase()).includes(target)) || null; }
  function stableId_(staff) { return String(staff && (staff.staffId || staff.email || staff.primaryEmail || staff.id) || "").trim(); }
  function facets_(staff) { const facet = key => unique_(staff.flatMap(record => record[key] || [])).sort(); return { departments: facet("departments"), roles: facet("productionRoles"), teams: facet("teams"), employment: facet("employmentType"), staffTypes: unique_(staff.flatMap(record => [].concat(record.productionRoles || [], record.employmentType || [], record.employment || []))).sort(), statuses: facet("status"), access: facet("accessStatus"), permissionLevels: facet("permissionLevel"), categories: facet("categoryResponsibilities"), incompleteProfiles: staff.filter(record => record.incompleteProfile).length }; }
  function summary_(staff) { return { total: staff.length, active: staff.filter(item => /^active$/i.test(item.status)).length, departments: new Set(staff.flatMap(item => item.departments || []).filter(Boolean)).size, enabledUsers: staff.filter(item => item.specCentralAccess).length, contactable: staff.filter(item => item.email || item.phone).length }; }
  function badges_(staff) { return unique_([staff.specCentralAccess ? staff.specCentralRole : "No Access", staff.status, staff.employment || staff.typeOfWork].filter(Boolean)); }
  function normaliseDisplayName_(value, preferred) { const tokens = String(value || "").trim().split(/\s+/); const preferredKey = String(preferred || "").trim().toLowerCase(); if (tokens.length > 2 && tokens[0].toLowerCase() === tokens[tokens.length - 1].toLowerCase() && (!preferredKey || tokens[0].toLowerCase() === preferredKey)) tokens.pop(); return tokens.join(" "); }
  function requireViewer_() { const user = UserContextService.getCurrent(); if (!AuthorizationService.hasCapability(user, "Operations.View")) throw new Error("Operations.View is required."); return user; }
  function unique_(values) { return Array.from(new Set([].concat(values || []).map(value => String(value || "").trim()).filter(Boolean))); }
  function safe_(callback, fallback) { try { return callback(); } catch (err) { return fallback; } }
  return { getDirectoryData, getProfile };
})();
