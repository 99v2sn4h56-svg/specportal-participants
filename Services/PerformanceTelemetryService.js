/** PII-free, bounded performance samples for later p50/p95 calculation. */
const PerformanceTelemetryService = (() => {
  const CACHE_KEY = "SC_PERFORMANCE_SAMPLES_V1";
  const CACHE_SECONDS = 6 * 60 * 60;
  const MAX_SAMPLES = 240;
  const ALLOWED_DETAIL_KEYS = new Set(["cache", "records", "payloadBytes", "sourceRows", "projection", "route", "status", "reason", "lockWaitMs", "module", "trigger", "phase", "isStale", "requests"]);

  function record(name, durationMs, detail) {
    const sample = {
      name: safeName_(name),
      durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
      at: new Date().toISOString(),
      detail: safeDetail_(detail)
    };
    try { Logger.log("SC_PERF " + JSON.stringify(sample)); } catch (_) {}
    try {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(1)) return sample;
      try {
        const cache = CacheService.getScriptCache();
        const samples = read_();
        samples.push(sample);
        cache.put(CACHE_KEY, JSON.stringify(samples.slice(-MAX_SAMPLES)), CACHE_SECONDS);
      } finally { lock.releaseLock(); }
    } catch (_) {}
    return sample;
  }

  function measure(name, callback, detail) {
    const started = Date.now();
    try { return callback(); }
    finally { record(name, Date.now() - started, detail); }
  }

  function getSummary() {
    const grouped = read_().reduce((output, sample) => {
      if (!output[sample.name]) output[sample.name] = [];
      output[sample.name].push(Number(sample.durationMs) || 0);
      return output;
    }, {});
    return Object.keys(grouped).sort().map(name => {
      const values = grouped[name].sort((a, b) => a - b);
      return { name, samples: values.length, p50Ms: percentile_(values, 0.50), p95Ms: percentile_(values, 0.95), maxMs: values[values.length - 1] || 0 };
    });
  }

  function clear() { CacheService.getScriptCache().remove(CACHE_KEY); }
  function read_() { try { const value = JSON.parse(CacheService.getScriptCache().get(CACHE_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
  function percentile_(values, percentile) { if (!values.length) return 0; return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentile) - 1))]; }
  function safeName_(value) { return String(value || "unknown").toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 80); }
  function safeDetail_(detail) { const source = detail && typeof detail === "object" ? detail : {}; return Object.keys(source).reduce((output, key) => { if (ALLOWED_DETAIL_KEYS.has(key)) output[key] = typeof source[key] === "number" || typeof source[key] === "boolean" ? source[key] : String(source[key] || "").slice(0, 80); return output; }, {}); }

  return { record, measure, getSummary, clear };
})();
