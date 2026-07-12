/** Small bounded persistence adapter for workflow platform state. */
const PlatformStoreService = (() => {
  const PREFIX = "SPEC_PLATFORM_V1_";
  const MAX_PROPERTY_CHARS = 8000;

  function list(collection) {
    const raw = PropertiesService.getScriptProperties().getProperty(key_(collection));
    if (!raw) return [];
    try { const value = JSON.parse(raw); return Array.isArray(value) ? value : []; }
    catch (err) { return []; }
  }

  function put(collection, record, maxRecords) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const safe = safeData(record);
      let records = list(collection).filter(item => item.id !== safe.id);
      records.unshift(safe);
      records = records.slice(0, maxRecords || 100);
      let json = JSON.stringify(records);
      while (json.length > MAX_PROPERTY_CHARS && records.length > 1) {
        records.pop();
        json = JSON.stringify(records);
      }
      PropertiesService.getScriptProperties().setProperty(key_(collection), json);
      return safe;
    } finally { lock.releaseLock(); }
  }

  function update(collection, id, changes, maxRecords) {
    const current = list(collection).find(item => item.id === id);
    if (!current) throw new Error(`${collection} record ${id} was not found.`);
    return put(collection, Object.assign({}, current, safeData(changes), { id }), maxRecords);
  }

  function safeData(value, depth) {
    const level = depth || 0;
    if (level > 5) return "[truncated]";
    if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.slice(0, 50).map(item => safeData(item, level + 1));
    if (typeof value !== "object") return String(value);
    const output = {};
    Object.keys(value).slice(0, 50).forEach(key => {
      if (/secret|token|password|medical|support.?plan|parent|mobile|headshot|photo/i.test(key)) output[key] = "[redacted]";
      else output[key] = safeData(value[key], level + 1);
    });
    return output;
  }

  function createId(prefix) { return `${prefix}-${Utilities.getUuid().replace(/-/g, "").slice(0, 20).toUpperCase()}`; }
  function key_(collection) { return PREFIX + String(collection || "records").toUpperCase(); }
  return { list, put, update, safeData, createId };
})();
