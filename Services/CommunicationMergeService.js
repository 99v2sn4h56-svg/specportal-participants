/** Deterministic, non-executable communication merge engine. */
const CommunicationMergeService = (() => {
  const FIELDS = Object.freeze([
    "Participant.FirstName", "Participant.FullName", "School.Name", "Teacher.FirstName",
    "Teacher.FullName", "Item.Name", "Category.Name", "Segment.Name", "Group.Name",
    "Staff.FirstName", "Staff.FullName", "Sender.DisplayName"
  ]);
  const TOKEN = /{{\s*([A-Za-z][A-Za-z0-9.]*)\s*}}/g;

  function render(template, mergeData, options) {
    const html = !(options && options.plainText), values = mergeData || {}, unresolved = [];
    const source = html ? sanitizeHtml(String(template || "")) : String(template || "");
    const output = source.replace(TOKEN, (match, field) => {
      if (!FIELDS.includes(field)) { unresolved.push(field); return match; }
      const value = path_(values, field);
      if (value === undefined || value === null || value === "") { unresolved.push(field); return match; }
      return html ? escapeHtml(String(value)) : String(value);
    });
    return { output, unresolved: Array.from(new Set(unresolved)), fields: extractFields(template) };
  }
  function extractFields(template) { const fields = [], text = String(template || ""); let match; TOKEN.lastIndex = 0; while ((match = TOKEN.exec(text))) fields.push(match[1]); TOKEN.lastIndex = 0; return Array.from(new Set(fields)); }
  function path_(value, path) { return String(path || "").split(".").reduce((current, key) => current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined, value); }
  function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
  function sanitizeHtml(value) {
    return String(value || "")
      .replace(/<\s*(script|iframe|object|embed|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*(script|iframe|object|embed|style)[^>]*\/?>/gi, "")
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
  }
  function plainTextFromHtml(value) { return String(value || "").replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim(); }
  function getFields() { return FIELDS.slice(); }
  return { render, extractFields, escapeHtml, sanitizeHtml, plainTextFromHtml, getFields };
})();
