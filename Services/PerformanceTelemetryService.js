/**
 * PII-safe, bounded performance diagnostics.
 *
 * Browser input is untrusted. Only canonical metric names and enumerated
 * dimensions are accepted. Journey samples are isolated from legacy operational
 * metrics so high-frequency cache telemetry cannot evict the measurement gate.
 */
const PerformanceTelemetryService = (() => {
  const SCHEMA = "sc-perf-v3";
  const CONTRACT = "spec-central-performance-diagnostics-v3";
  const JOURNEY_CACHE_KEY = "SC_PERF_JOURNEYS_V3";
  const LEGACY_CACHE_KEY = "SC_PERF_LEGACY_V3";
  const DEGRADED_PROPERTY_KEY = "SC_PERF_DEGRADED_V3";
  const CACHE_SECONDS = 6 * 60 * 60;
  const MAX_BATCH_SIZE = 20;
  const MAX_JOURNEY_SAMPLES = 120;
  const MAX_LEGACY_SAMPLES = 80;
  const MAX_SERIALIZED_BYTES = 72 * 1024;
  const MAX_SAMPLE_PAYLOAD_BYTES = 60 * 1024;
  const MAX_SAMPLE_BYTES = 640;
  const LOCK_WAIT_MS = 100;

  const REQUIRED_JOURNEYS = Object.freeze([
    { id: "dashboard-bootstrap", label: "Dashboard bootstrap" },
    { id: "participant-search", label: "Participant search" },
    { id: "participant-passport", label: "Participant passport" },
    { id: "event-loading", label: "Event loading" },
    { id: "communications-loading", label: "Communications loading" },
    { id: "forms-loading", label: "Forms loading" }
  ]);
  const JOURNEY_IDS = new Set(REQUIRED_JOURNEYS.map(item => item.id));
  const CLIENT_METRICS = new Set(REQUIRED_JOURNEYS.map(item => "journey." + item.id));
  const LEGACY_METRICS = new Set([
    "attendance.active.request", "cache.epoch.advanced", "cache.rebuild.busy", "cache.stale-refresh-failed",
    "dashboard.participant-summary.rebuild", "dashboard.projection.server", "participants.dataset.request",
    "participants.detail.request", "participants.filters.request", "participants.groups.request", "participants.list.request",
    "participants.list.transform", "participants.page.request", "projections.warm", "projections.warm.shared",
    "startup.bootstrap.server", "startup.identity.server", "startup.permission-resolution.server", "startup.staff-lookup.server"
  ]);
  const CACHE_METRICS = new Set([
    "cache.hit", "cache.hit-after-lock", "cache.hit-after-refresh", "cache.hit-after-wait", "cache.hit-fresh", "cache.hit-stale",
    "cache.miss-published", "cache.miss-published-nested", "cache.miss-uncached", "cache.refreshed", "cache.rebuild.busy",
    "cache.stale-refresh-busy", "cache.stale-refresh-failed", "cache.stale-refresh-unpublished"
  ]);
  const DIMENSIONS = Object.freeze({
    route: new Set(["dashboard", "participants", "search", "calendar", "operations", "communications", "forms", "other"]),
    phase: new Set(["bootstrap", "dashboard", "platform-search", "page", "legacy-local", "detail", "calendar", "landing", "workspace", "other"]),
    module: new Set(["participants", "attendance", "dashboard", "calendar", "operations", "communications", "forms", "other"]),
    projection: new Set([
      "bootstrap", "dashboard", "dashboard-v2", "platform-search", "participant-list", "participant-list-v2", "participant-list-page",
      "participant-list-page-v2", "participant-filter-v1", "participant-groups-v1", "participant-detail", "participant-detail-v2",
      "canonical-participants", "startup-projections-v2", "shared-projections-v2", "calendar", "event-manager", "event-workspace",
      "communications-workspace", "forms-workspace", "attendance-active-v1", "other"
    ]),
    reason: new Set(["request-failed", "cache-rebuild-busy", "authentication-required", "permission-required", "timeout", "validation", "internal-error", "other"]),
    outcome: new Set(["success", "failure"]),
    environment: new Set(["development", "test", "staging", "production", "unknown"]),
    source: new Set(["client", "server"]),
    status: new Set(["completed", "failed", "matched", "duplicate", "unmatched", "resolved", "active", "unknown", "other"]),
    cache: new Set([
      "hit", "hit-after-lock", "hit-after-refresh", "hit-after-wait", "hit-fresh", "hit-stale", "miss", "miss-published",
      "miss-published-nested", "miss-uncached", "refreshed", "script", "user", "durable-snapshot", "client-memory",
      "stale-refresh-busy", "stale-refresh-failed", "stale-refresh-unpublished", "unknown", "other"
    ]),
    trigger: new Set(["idle", "intent", "route", "refresh", "other"])
  });
  const NUMERIC_DETAILS = new Set(["records", "payloadBytes", "sourceRows", "lockWaitMs", "requests"]);
  const BOOLEAN_DETAILS = new Set(["isStale", "cacheHit"]);
  const DIMENSION_DETAILS = new Set(["route", "phase", "module", "projection", "reason", "outcome", "status", "cache", "trigger"]);
  const ID_PATTERN = /^[a-z][a-z0-9]{11,31}$/;

  /** Trusted server-only metric support retained for existing synchronous instrumentation. */
  function record(name, durationMs, detail) {
    const metric = normaliseLegacyMetric_(name);
    if (!metric) return null;
    const context = deploymentContext_();
    const eventId = compactId_("s");
    const sample = buildSample_({
      metric,
      durationMs,
      detail: detail || {},
      eventId,
      correlationId: eventId,
      batchId: compactId_("b"),
      source: "server",
      context
    }, false, "legacy");
    if (!sample) return null;
    const acknowledgement = persist_(LEGACY_CACHE_KEY, [sample], MAX_LEGACY_SAMPLES, sample.batchId, "legacy");
    return Object.assign({}, sample, { acknowledgement });
  }

  /** Times one registered server journey without changing its return/error contract. */
  function measureJourney(name, callback, detail) {
    const journey = requireJourney_(name);
    const started = Date.now();
    try {
      const value = callback();
      recordJourney_(journey, Date.now() - started, Object.assign({}, detail || {}, { status: "completed", outcome: "success" }));
      return value;
    } catch (error) {
      recordJourney_(journey, Date.now() - started, Object.assign({}, detail || {}, { status: "failed", outcome: "failure", reason: classifyReason_(error) }));
      throw error;
    }
  }

  function recordJourney_(journey, durationMs, detail) {
    const context = deploymentContext_();
    const eventId = compactId_("s");
    const sample = buildSample_({
      metric: "server.journey." + journey,
      journey,
      durationMs,
      detail: detail || {},
      eventId,
      correlationId: eventId,
      batchId: compactId_("b"),
      source: "server",
      context
    }, false, "journey");
    if (!sample) return null;
    persist_(JOURNEY_CACHE_KEY, [sample], MAX_JOURNEY_SAMPLES, sample.batchId, "journey");
    return sample;
  }

  /**
   * Validates and persists an untrusted browser batch in one storage cycle.
   * Unknown metrics, dimensions, identifiers and free text are rejected.
   */
  function recordClientBatch(items, suppliedBatchId) {
    const input = Array.isArray(items) ? items : [];
    const providedBatchId = String(suppliedBatchId || "");
    const batchId = providedBatchId || compactId_("b");
    if (!validId_(batchId, "b")) {
      const invalid = acknowledgement_(compactId_("b"), input.length);
      invalid.rejectedSampleCount = input.length;
      invalid.reason = "invalid-batch-id";
      return invalid;
    }
    const context = deploymentContext_();
    const acknowledgement = acknowledgement_(batchId, input.length);
    const accepted = [];

    input.slice(0, MAX_BATCH_SIZE).forEach(item => {
      const metricName = String(item && item.name || "");
      if (!CLIENT_METRICS.has(metricName)) { acknowledgement.rejectedSampleCount++; return; }
      const journey = metricName.slice("journey.".length);
      if (!JOURNEY_IDS.has(journey)) { acknowledgement.rejectedSampleCount++; return; }
      const eventId = String(item && item.eventId || "");
      const correlationId = String(item && item.correlationId || eventId);
      if (!validId_(eventId, "c") || !validId_(correlationId, "c")) { acknowledgement.rejectedSampleCount++; return; }
      const sample = buildSample_({
        metric: "client." + metricName,
        journey,
        durationMs: item && item.durationMs,
        detail: item && item.detail || {},
        eventId,
        correlationId,
        batchId,
        source: "client",
        context
      }, true, "journey");
      if (!sample) acknowledgement.rejectedSampleCount++;
      else accepted.push(sample);
    });
    acknowledgement.droppedSampleCount += Math.max(0, input.length - MAX_BATCH_SIZE);
    if (!accepted.length) return acknowledgement;

    const persisted = persist_(JOURNEY_CACHE_KEY, accepted, MAX_JOURNEY_SAMPLES, batchId, "journey", {
      rejectedSampleCount: acknowledgement.rejectedSampleCount,
      droppedSampleCount: acknowledgement.droppedSampleCount
    });
    acknowledgement.acceptedSampleCount = persisted.acceptedSampleCount;
    acknowledgement.rejectedSampleCount = persisted.rejectedSampleCount;
    acknowledgement.droppedSampleCount = persisted.droppedSampleCount;
    acknowledgement.evictedSampleCount = persisted.evictedSampleCount;
    acknowledgement.writeSuccess = persisted.writeSuccess;
    acknowledgement.degraded = persisted.degraded;
    acknowledgement.reason = persisted.reason;
    acknowledgement.operations = persisted.operations;
    acknowledgement.acceptedEventIds = persisted.acceptedEventIds;
    return acknowledgement;
  }

  function persist_(cacheKey, incoming, maxSamples, batchId, family, initialCounters) {
    const acknowledgement = acknowledgement_(batchId, incoming.length);
    acknowledgement.rejectedSampleCount = Math.max(0, Number(initialCounters && initialCounters.rejectedSampleCount) || 0);
    acknowledgement.droppedSampleCount = Math.max(0, Number(initialCounters && initialCounters.droppedSampleCount) || 0);
    acknowledgement.operations.lockAttempts = 1;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      acknowledgement.droppedSampleCount += incoming.length;
      acknowledgement.reason = "lock-contention";
      acknowledgement.degraded = true;
      incrementDegraded_({ lockDropCount: incoming.length, droppedSampleCount: acknowledgement.droppedSampleCount });
      logBatch_(batchId, incoming, acknowledgement, family);
      return acknowledgement;
    }

    try {
      const cache = CacheService.getScriptCache();
      acknowledgement.operations.cacheReads = 1;
      const envelope = readEnvelope_(cache, cacheKey);
      if (envelope.recentBatchIds.includes(batchId)) {
        acknowledgement.droppedSampleCount += incoming.length;
        acknowledgement.writeSuccess = true;
        acknowledgement.reason = "duplicate-batch";
        acknowledgement.acceptedEventIds = incoming.map(sample => sample.eventId);
        logBatch_(batchId, [], acknowledgement, family);
        return acknowledgement;
      }
      const existingEventIds = new Set(envelope.samples.map(sample => sample.eventId));
      const unique = incoming.filter(sample => {
        if (existingEventIds.has(sample.eventId)) { acknowledgement.droppedSampleCount++; return false; }
        existingEventIds.add(sample.eventId);
        return true;
      });
      envelope.samples = envelope.samples.concat(unique);
      envelope.stats.acceptedSampleCount += unique.length;
      envelope.stats.droppedSampleCount += acknowledgement.droppedSampleCount;
      envelope.stats.rejectedSampleCount += acknowledgement.rejectedSampleCount;
      envelope.recentBatchIds = envelope.recentBatchIds.filter(id => id !== batchId).concat(batchId).slice(-40);

      while (envelope.samples.length > maxSamples) { envelope.samples.shift(); acknowledgement.evictedSampleCount++; }
      let samplePayloadBytes = envelope.samples.reduce((total, sample) => total + byteLength_(JSON.stringify(sample)) + 1, 0);
      while (samplePayloadBytes > MAX_SAMPLE_PAYLOAD_BYTES && envelope.samples.length) {
        samplePayloadBytes -= byteLength_(JSON.stringify(envelope.samples.shift())) + 1;
        acknowledgement.evictedSampleCount++;
      }
      envelope.stats.evictedSampleCount += acknowledgement.evictedSampleCount;
      envelope.updatedAt = new Date().toISOString();

      const serialised = JSON.stringify(envelope);
      if (byteLength_(serialised) > MAX_SERIALIZED_BYTES) {
        acknowledgement.droppedSampleCount += unique.length;
        acknowledgement.reason = "size-limit";
        acknowledgement.degraded = true;
        incrementDegraded_({ writeFailureCount: 1, droppedSampleCount: acknowledgement.droppedSampleCount });
        logBatch_(batchId, incoming, acknowledgement, family);
        return acknowledgement;
      }

      try {
        acknowledgement.operations.cacheWrites = 1;
        cache.put(cacheKey, serialised, CACHE_SECONDS);
        acknowledgement.acceptedSampleCount = unique.length;
        acknowledgement.acceptedEventIds = unique.map(sample => sample.eventId);
        acknowledgement.writeSuccess = true;
        acknowledgement.serializedBytes = byteLength_(serialised);
      } catch (error) {
        acknowledgement.droppedSampleCount += unique.length;
        acknowledgement.reason = "cache-write-failed";
        acknowledgement.degraded = true;
        incrementDegraded_({ writeFailureCount: 1, droppedSampleCount: acknowledgement.droppedSampleCount });
      }
      logBatch_(batchId, incoming, acknowledgement, family);
      return acknowledgement;
    } finally {
      lock.releaseLock();
    }
  }

  function getDiagnostics() {
    const cache = CacheService.getScriptCache();
    const journeyEnvelope = readEnvelope_(cache, JOURNEY_CACHE_KEY);
    const legacyEnvelope = readEnvelope_(cache, LEGACY_CACHE_KEY);
    const summary = summarise_(journeyEnvelope.samples);
    const degraded = degradedState_();
    const counters = mergeCounters_(journeyEnvelope.stats, legacyEnvelope.stats, degraded);
    const isDegraded = counters.lockDropCount > 0 || counters.writeFailureCount > 0 || counters.droppedSampleCount > 0;
    return {
      contract: CONTRACT,
      schemaVersion: SCHEMA,
      centralLogger: "SC_PERF_BATCH structured execution log plus bounded Script Cache",
      retentionSeconds: CACHE_SECONDS,
      safeSerializedBytes: MAX_SERIALIZED_BYTES,
      journeySampleCount: journeyEnvelope.samples.length,
      legacySampleCount: legacyEnvelope.samples.length,
      sampleCount: journeyEnvelope.samples.length + legacyEnvelope.samples.length,
      requiredJourneys: REQUIRED_JOURNEYS.map(item => Object.assign({}, item)),
      coverage: REQUIRED_JOURNEYS.map(item => ({
        id: item.id,
        label: item.label,
        operations: summary.filter(row => row.journey === item.id)
      })),
      summary,
      counters,
      degraded: isDegraded,
      degradedReasons: [
        counters.lockDropCount ? "lock-contention" : "",
        counters.writeFailureCount ? "cache-write-failure" : "",
        counters.droppedSampleCount ? "dropped-samples" : ""
      ].filter(Boolean),
      recent: journeyEnvelope.samples.slice(-30).reverse()
    };
  }

  function summarise_(samples) {
    const groups = {};
    (samples || []).forEach(sample => {
      const detail = sample.detail || {};
      const key = [sample.source, sample.journey, detail.phase || "other", detail.route || "other", detail.projection || "other"].join("|");
      if (!groups[key]) groups[key] = {
        key,
        name: sample.name,
        source: sample.source,
        journey: sample.journey,
        phase: detail.phase || "other",
        route: detail.route || "other",
        projection: detail.projection || "other",
        successfulDurations: [],
        failureCount: 0
      };
      if (detail.outcome === "success") groups[key].successfulDurations.push(Number(sample.durationMs) || 0);
      else groups[key].failureCount++;
    });
    return Object.keys(groups).sort().map(key => {
      const group = groups[key], values = group.successfulDurations.sort((a, b) => a - b);
      const total = values.length + group.failureCount;
      return {
        key: group.key,
        name: group.name,
        source: group.source,
        journey: group.journey,
        phase: group.phase,
        route: group.route,
        projection: group.projection,
        successCount: values.length,
        failureCount: group.failureCount,
        failureRate: total ? Math.round((group.failureCount / total) * 1000) / 10 : 0,
        p50Ms: percentile_(values, 0.50),
        p95Ms: percentile_(values, 0.95),
        maxMs: values[values.length - 1] || 0
      };
    });
  }

  function buildSample_(input, strict, family) {
    const detail = validateDetail_(input.detail, strict, input.journey);
    if (!detail) return null;
    const sample = {
      schemaVersion: SCHEMA,
      eventId: input.eventId,
      batchId: input.batchId,
      correlationId: input.correlationId,
      name: input.metric,
      journey: input.journey || "",
      source: input.source,
      durationMs: Math.min(10 * 60 * 1000, Math.max(0, Math.round(Number(input.durationMs) || 0))),
      at: new Date().toISOString(),
      build: input.context.build,
      environment: input.context.environment,
      detail
    };
    if (byteLength_(JSON.stringify(sample)) > MAX_SAMPLE_BYTES) return null;
    if (family === "journey" && (!sample.journey || !JOURNEY_IDS.has(sample.journey))) return null;
    return sample;
  }

  function validateDetail_(detail, strict, journey) {
    const source = detail && typeof detail === "object" && !Array.isArray(detail) ? detail : {};
    const output = {};
    for (const key of Object.keys(source)) {
      if (key === "journey") {
        if (!JOURNEY_IDS.has(String(source[key])) || String(source[key]) !== journey) return null;
        continue;
      }
      if (NUMERIC_DETAILS.has(key)) {
        const value = Number(source[key]);
        if (!Number.isFinite(value) || value < 0) { if (strict) return null; else continue; }
        output[key] = Math.min(100000000, Math.round(value));
        continue;
      }
      if (BOOLEAN_DETAILS.has(key)) {
        if (typeof source[key] !== "boolean") { if (strict) return null; else continue; }
        output[key] = source[key];
        continue;
      }
      if (DIMENSION_DETAILS.has(key)) {
        const value = String(source[key] || "").toLowerCase();
        const allowed = DIMENSIONS[key];
        if (!allowed || !allowed.has(value)) { if (strict) return null; output[key] = allowed && allowed.has("other") ? "other" : "unknown"; }
        else output[key] = value;
        continue;
      }
      if (strict) return null;
    }
    if (journey) {
      output.phase = output.phase || defaultPhase_(journey, output.route, output.projection);
      output.route = output.route || defaultRoute_(journey);
      output.projection = output.projection || defaultProjection_(journey, output.phase);
      output.status = output.status || "completed";
      output.outcome = output.outcome || (output.status === "failed" ? "failure" : "success");
    }
    return output;
  }

  function readEnvelope_(cache, key) {
    try {
      const parsed = JSON.parse(cache.get(key) || "null");
      if (parsed && parsed.schemaVersion === SCHEMA && Array.isArray(parsed.samples)) {
        parsed.stats = Object.assign(emptyCounters_(), parsed.stats || {});
        parsed.recentBatchIds = Array.isArray(parsed.recentBatchIds) ? parsed.recentBatchIds : [];
        return parsed;
      }
    } catch (_) {}
    return { schemaVersion: SCHEMA, samples: [], recentBatchIds: [], stats: emptyCounters_(), updatedAt: "" };
  }

  function acknowledgement_(batchId, received) {
    return {
      schemaVersion: SCHEMA,
      batchId,
      receivedSampleCount: Math.max(0, Number(received) || 0),
      acceptedSampleCount: 0,
      rejectedSampleCount: 0,
      droppedSampleCount: 0,
      evictedSampleCount: 0,
      writeSuccess: false,
      degraded: false,
      reason: "",
      acceptedEventIds: [],
      operations: { validationPasses: 1, lockAttempts: 0, cacheReads: 0, cacheWrites: 0 }
    };
  }

  function emptyCounters_() { return { acceptedSampleCount: 0, rejectedSampleCount: 0, droppedSampleCount: 0, evictedSampleCount: 0, lockDropCount: 0, writeFailureCount: 0 }; }
  function mergeCounters_(journey, legacy, degraded) { const result = emptyCounters_(); [journey, legacy, degraded].forEach(source => Object.keys(result).forEach(key => result[key] += Math.max(0, Number(source && source[key]) || 0))); return result; }
  function incrementDegraded_(changes) {
    try {
      const properties = PropertiesService.getScriptProperties();
      const state = JSON.parse(properties.getProperty(DEGRADED_PROPERTY_KEY) || "{}");
      Object.keys(changes || {}).forEach(key => state[key] = Math.max(0, Number(state[key]) || 0) + Math.max(0, Number(changes[key]) || 0));
      properties.setProperty(DEGRADED_PROPERTY_KEY, JSON.stringify(state));
    } catch (_) {}
  }
  function degradedState_() { try { return Object.assign(emptyCounters_(), JSON.parse(PropertiesService.getScriptProperties().getProperty(DEGRADED_PROPERTY_KEY) || "{}")); } catch (_) { return emptyCounters_(); } }
  function clear() { const cache = CacheService.getScriptCache(); cache.removeAll([JOURNEY_CACHE_KEY, LEGACY_CACHE_KEY]); try { PropertiesService.getScriptProperties().deleteProperty(DEGRADED_PROPERTY_KEY); } catch (_) {} }

  function deploymentContext_() {
    try {
      const config = PlatformControlService.getConfig();
      const environment = String(config.environment || "unknown").toLowerCase();
      return { environment: DIMENSIONS.environment.has(environment) ? environment : "unknown", build: safeBuild_(config.buildVersion) };
    } catch (_) { return { environment: "unknown", build: "unknown" }; }
  }
  function safeBuild_(value) { const build = String(value || "unknown").toLowerCase(); return /^[a-z0-9][a-z0-9._-]{0,31}$/.test(build) ? build : "unknown"; }
  function requireJourney_(value) { const journey = String(value || ""); if (!JOURNEY_IDS.has(journey)) throw new Error("UNKNOWN_TELEMETRY_JOURNEY"); return journey; }
  function validId_(value, prefix) { const text = String(value || ""); return ID_PATTERN.test(text) && text.charAt(0) === prefix; }
  function compactId_(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }
  function byteLength_(value) { try { return Utilities.newBlob(String(value || "")).getBytes().length; } catch (_) { return unescape(encodeURIComponent(String(value || ""))).length; } }
  function percentile_(values, percentile) { if (!values.length) return 0; return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentile) - 1))]; }
  function normaliseLegacyMetric_(name) { const metric = String(name || "").toLowerCase(); return LEGACY_METRICS.has(metric) || CACHE_METRICS.has(metric) ? metric : ""; }
  function classifyReason_(error) {
    const value = String(error && (error.code || error.name || error.message) || "").toLowerCase();
    if (value.indexOf("cache_rebuild_busy") >= 0) return "cache-rebuild-busy";
    if (value.indexOf("auth") >= 0) return "authentication-required";
    if (value.indexOf("permission") >= 0 || value.indexOf("required") >= 0) return "permission-required";
    if (value.indexOf("timeout") >= 0 || value.indexOf("timed out") >= 0) return "timeout";
    if (value.indexOf("valid") >= 0) return "validation";
    return "internal-error";
  }
  function defaultRoute_(journey) { return ({ "dashboard-bootstrap": "dashboard", "participant-search": "search", "participant-passport": "participants", "event-loading": "operations", "communications-loading": "communications", "forms-loading": "forms" })[journey] || "other"; }
  function defaultPhase_(journey, route, projection) {
    if (journey === "dashboard-bootstrap") return projection === "bootstrap" ? "bootstrap" : "dashboard";
    if (journey === "participant-search") return projection === "platform-search" ? "platform-search" : "page";
    if (journey === "participant-passport") return "detail";
    if (journey === "event-loading") return route === "calendar" ? "calendar" : projection === "event-workspace" ? "workspace" : "landing";
    return "workspace";
  }
  function defaultProjection_(journey, phase) { return ({ "dashboard-bootstrap": phase === "bootstrap" ? "bootstrap" : "dashboard", "participant-search": phase === "platform-search" ? "platform-search" : "participant-list-page", "participant-passport": "participant-detail", "event-loading": phase === "calendar" ? "calendar" : phase === "workspace" ? "event-workspace" : "event-manager", "communications-loading": "communications-workspace", "forms-loading": "forms-workspace" })[journey] || "other"; }
  function logBatch_(batchId, samples, acknowledgement, family) { try { Logger.log("SC_PERF_BATCH " + JSON.stringify({ schemaVersion: SCHEMA, batchId, family, samples, acknowledgement })); } catch (_) {} }

  return {
    record,
    measureJourney,
    recordClientBatch,
    getDiagnostics,
    clear,
    getContract: () => ({ version: CONTRACT, schemaVersion: SCHEMA, requiredJourneys: REQUIRED_JOURNEYS.map(item => item.id), acceptedClientMetrics: Array.from(CLIENT_METRICS), maxBatchSize: MAX_BATCH_SIZE, safeSerializedBytes: MAX_SERIALIZED_BYTES })
  };
})();
