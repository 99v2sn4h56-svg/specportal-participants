/**
 * Capability-based authorization foundation.
 * Roles collect capabilities; scopes are carried with grants for future
 * enforcement without changing the permission contract.
 */
const AuthorizationService = (() => {
  const CAPABILITIES = [
    "Participants.View", "Participants.Edit", "Attendance.View", "Attendance.Mark",
    "Calendar.View", "Calendar.Operational.View", "Calendar.Edit", "Timeline.Edit",
    "Reports.Export", "Communications.Send", "Settings.Admin", "Operations.View",
    "Operations.Admin", "Users.Manage", "Permissions.Manage", "Workflow.Run", "Workflow.Admin", "Jobs.Run", "Notifications.View"
  ];

  const ROLES = {
    "System Administrator": CAPABILITIES.slice(),
    "Executive": ["Participants.View", "Attendance.View", "Calendar.View", "Calendar.Operational.View", "Reports.Export", "Operations.View"],
    "Operations Manager": ["Participants.View", "Participants.Edit", "Attendance.View", "Attendance.Mark", "Calendar.View", "Calendar.Operational.View", "Calendar.Edit", "Timeline.Edit", "Reports.Export", "Communications.Send", "Operations.View", "Operations.Admin", "Workflow.Run", "Workflow.Admin", "Jobs.Run", "Notifications.View"],
    "Department Manager": ["Participants.View", "Participants.Edit", "Attendance.View", "Attendance.Mark", "Calendar.View", "Calendar.Operational.View", "Reports.Export", "Operations.View"],
    "Production Team Leader": ["Participants.View", "Attendance.View", "Attendance.Mark", "Calendar.View", "Calendar.Operational.View"],
    "Production Team Member": ["Participants.View", "Attendance.View", "Attendance.Mark", "Calendar.View"],
    "Teacher": ["Participants.View", "Attendance.View", "Calendar.View"],
    "Volunteer": ["Attendance.View", "Attendance.Mark", "Calendar.View"]
  };

  const LEGACY = {
    "dashboard.view": "Calendar.View",
    "participants.view": "Participants.View",
    "participants.edit": "Participants.Edit",
    "attendance.view": "Attendance.View",
    "attendance.mark": "Attendance.Mark",
    "calendar.view": "Calendar.View",
    "calendar.edit": "Calendar.Edit",
    "rehearsals.view": "Calendar.View",
    "operations.view": "Operations.View",
    "operations.users.manage": "Users.Manage",
    "operations.permissions.manage": "Permissions.Manage",
    "settings.view": "Settings.Admin",
    "settings.admin": "Settings.Admin"
  };

  function normaliseCapability(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const legacy = LEGACY[text.toLowerCase()];
    if (legacy) return legacy;
    return CAPABILITIES.find(capability => capability.toLowerCase() === text.toLowerCase()) || text;
  }

  function getRoleCapabilities(role) {
    const target = String(role || "").trim().toLowerCase();
    const name = Object.keys(ROLES).find(item => item.toLowerCase() === target);
    return name ? ROLES[name].slice() : [];
  }

  function resolveGrants(user) {
    const record = user || {};
    const capabilities = getRoleCapabilities(record.role)
      .concat(record.permissions || [], record.access || [])
      .map(normaliseCapability)
      .filter(Boolean);
    return Array.from(new Set(capabilities)).map(capability => ({
      capability,
      scope: record.scope || { type: "production", values: [] }
    }));
  }

  function hasCapability(user, capability, context) {
    const target = normaliseCapability(capability);
    return resolveGrants(user).some(grant =>
      grant.capability === target && scopeAllows_(grant.scope, context)
    );
  }

  function scopeAllows_(scope, context) {
    if (!scope || !scope.type || scope.type === "production") return true;
    if (!context) return true; // Scope contract exists; enforcement follows per module.
    const values = (scope.values || []).map(value => String(value).toLowerCase());
    return values.includes(String(context[scope.type] || "").toLowerCase());
  }

  function getModel() {
    return { capabilities: CAPABILITIES.slice(), roles: Object.assign({}, ROLES) };
  }

  return { normaliseCapability, getRoleCapabilities, resolveGrants, hasCapability, getModel };
})();
