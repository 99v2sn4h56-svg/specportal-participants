/** Small bounded persistence adapter for workflow platform state. */
const PlatformStoreService = (() => {
  const PREFIX = "SPEC_PLATFORM_V1_";
  const MAX_PROPERTY_CHARS = 8000;

  // list()/listLarge() are read on every DashboardService.getContext() call
  // (3+ collections each) with no caching at all, meaning every cache miss
  // for the (separately cached) Dashboard projection paid for a fresh
  // PropertiesService round trip per collection. Cached here, script-wide
  // (this is shared workflow state, not per-user data -- callers like
  // TaskService/NotificationService filter to the current user afterwards).
  // put()/update() read the current list via the uncached loader_() inside
  // their existing lock, never through this cache, so a write is always
  // based on the true current state -- then explicitly invalidate the
  // cache entry so the next read reflects the write immediately.
  function list(collection) {
    return PerformanceCacheService.getOrLoad(cacheKey_(collection), 30, () => loadList_(collection));
  }

  function loadList_(collection) {
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
      let records = loadList_(collection).filter(item => item.id !== safe.id);
      records.unshift(safe);
      records = records.slice(0, maxRecords || 100);
      let json = JSON.stringify(records);
      while (json.length > MAX_PROPERTY_CHARS && records.length > 1) {
        records.pop();
        json = JSON.stringify(records);
      }
      PropertiesService.getScriptProperties().setProperty(key_(collection), json);
      PerformanceCacheService.remove(cacheKey_(collection));
      return safe;
    } finally { lock.releaseLock(); }
  }

  function update(collection, id, changes, maxRecords) {
    // Reads via the uncached loader, not list() -- merging onto a cached
    // (up to 30s stale) "current" here would silently drop any change
    // written by someone else in between, since put() below replaces the
    // whole record.
    const current = loadList_(collection).find(item => item.id === id);
    if (!current) throw new Error(`${collection} record ${id} was not found.`);
    return put(collection, Object.assign({}, current, safeData(changes), { id }), maxRecords);
  }

  /**
   * Chunked variant for bounded platform modules whose relationship records can
   * legitimately exceed one Script Property. It keeps the same lock, ID and
   * sanitisation contract as put(), while avoiding a second storage pattern.
   *
   * Deliberately NOT cached, unlike list() above: EventWorkflowService.js has
   * ~11 call sites that read "current" via listLarge()/find_(), merge changes
   * themselves, and call putLarge() directly -- bypassing updateLarge()'s
   * fresh-read guarantee entirely. Caching listLarge() would turn a 30-second
   * window into a real lost-update bug for concurrent event edits (e.g. one
   * editor's risk-field update silently reverted by a second editor's
   * communications-field update, if the second editor's "current" read was
   * cached from before the first write). The original performance finding
   * this was addressing (DashboardService calling PlatformStoreService 3+
   * times per rebuild) only ever goes through list(), not listLarge().
   */
  function listLarge(collection) {
    const properties = PropertiesService.getScriptProperties();
    const base = largeKey_(collection);
    const count = Number(properties.getProperty(base + "__chunks") || 0);
    if (!count) return [];
    try {
      const raw = Array.from({ length: count }, (_, index) => properties.getProperty(base + "__" + index) || "").join("");
      const value = JSON.parse(raw || "[]");
      return Array.isArray(value) ? value : [];
    } catch (err) { return []; }
  }

  function putLarge(collection, record, maxRecords) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const safe = safeData(record, 0, 500);
      let records = listLarge(collection).filter(item => item.id !== safe.id);
      records.unshift(safe);
      records = records.slice(0, maxRecords || 2000);
      writeLarge_(collection, records);
      return safe;
    } finally { lock.releaseLock(); }
  }

  function updateLarge(collection, id, changes, maxRecords) {
    const current = listLarge(collection).find(item => item.id === id);
    if (!current) throw new Error(`${collection} record ${id} was not found.`);
    return putLarge(collection, Object.assign({}, current, safeData(changes, 0, 500), { id }), maxRecords);
  }

  function removeLarge(collection, id) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const records = listLarge(collection).filter(item => item.id !== id);
      writeLarge_(collection, records);
      return true;
    } finally { lock.releaseLock(); }
  }

  function writeLarge_(collection, records) {
    const properties = PropertiesService.getScriptProperties();
    const base = largeKey_(collection), raw = JSON.stringify(records || []), size = 7500, chunks = [];
    for (let offset = 0; offset < raw.length; offset += size) chunks.push(raw.slice(offset, offset + size));
    const previous = Number(properties.getProperty(base + "__chunks") || 0), updates = {};
    chunks.forEach((chunk, index) => { updates[base + "__" + index] = chunk; });
    updates[base + "__chunks"] = String(chunks.length);
    properties.setProperties(updates, false);
    for (let index = chunks.length; index < previous; index++) properties.deleteProperty(base + "__" + index);
  }

  function safeData(value, depth, arrayLimit) {
    const level = depth || 0;
    const maxArray = Number(arrayLimit) || 50;
    if (level > 5) return "[truncated]";
    if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.slice(0, maxArray).map(item => safeData(item, level + 1, maxArray));
    if (typeof value !== "object") return String(value);
    const output = {};
    Object.keys(value).slice(0, 50).forEach(key => {
      if (/secret|token|password|medical|support.?plan|parent|mobile|headshot|photo/i.test(key)) output[key] = "[redacted]";
      else output[key] = safeData(value[key], level + 1, maxArray);
    });
    return output;
  }

  function createId(prefix) { return `${prefix}-${Utilities.getUuid().replace(/-/g, "").slice(0, 20).toUpperCase()}`; }
  function key_(collection) { return PREFIX + String(collection || "records").toUpperCase(); }
  function largeKey_(collection) { return key_(collection) + "_CHUNKED"; }
  function cacheKey_(collection) { return "platformStore:" + key_(collection); }
  return { list, put, update, listLarge, putLarge, updateLarge, removeLarge, safeData, createId };
})();
