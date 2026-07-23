// Node-only telemetry quality-gate tests; intentionally not an Apps Script file.
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function runtime() {
  const cacheValues = new Map();
  const propertyValues = new Map();
  const operations = { cacheReads: 0, cacheWrites: 0, lockAttempts: 0, logs: 0 };
  const controls = { lockAvailable: true, failWrites: false };
  const cache = {
    get(key) { operations.cacheReads++; return cacheValues.has(key) ? cacheValues.get(key) : null; },
    put(key, value) { operations.cacheWrites++; if (controls.failWrites) throw new Error("CACHE_WRITE_FAILED"); cacheValues.set(key, value); },
    removeAll(keys) { keys.forEach(key => cacheValues.delete(key)); }
  };
  const properties = {
    getProperty(key) { return propertyValues.has(key) ? propertyValues.get(key) : null; },
    setProperty(key, value) { propertyValues.set(key, value); },
    deleteProperty(key) { propertyValues.delete(key); }
  };
  const context = {
    console,
    Date,
    Math,
    JSON,
    Set,
    Object,
    Array,
    Number,
    String,
    Error,
    unescape,
    encodeURIComponent,
    Logger: { log() { operations.logs++; } },
    CacheService: { getScriptCache() { return cache; } },
    LockService: { getScriptLock() { return { tryLock() { operations.lockAttempts++; return controls.lockAvailable; }, releaseLock() {} }; } },
    PropertiesService: { getScriptProperties() { return properties; } },
    PlatformControlService: { getConfig() { return { environment: "test", buildVersion: "quality-gate" }; } },
    Utilities: { newBlob(value) { return { getBytes() { return Array.from(Buffer.from(String(value || ""), "utf8")); } }; } }
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "../Services/PerformanceTelemetryService.js"), "utf8");
  vm.runInContext(source + "\n;globalThis.__telemetry = PerformanceTelemetryService;", context);
  return {
    service: context.__telemetry,
    operations,
    controls,
    cacheValues,
    resetOperations() { Object.keys(operations).forEach(key => operations[key] = 0); }
  };
}

let sequence = 0;
function id(prefix) { sequence++; return prefix + sequence.toString(36).padStart(12, "0"); }
function metric(name, detail, overrides) {
  const eventId = id("c");
  return Object.assign({ name, durationMs: 125, detail: detail || {}, eventId, correlationId: eventId }, overrides || {});
}
function validDetail(journey, overrides) {
  const defaults = {
    "dashboard-bootstrap": { route: "dashboard", phase: "dashboard", projection: "dashboard", status: "completed", outcome: "success" },
    "participant-search": { route: "participants", phase: "page", projection: "participant-list-page", status: "completed", outcome: "success" },
    "participant-passport": { route: "participants", phase: "detail", projection: "participant-detail", status: "completed", outcome: "success" },
    "event-loading": { route: "operations", phase: "landing", projection: "event-manager", status: "completed", outcome: "success" },
    "communications-loading": { route: "communications", phase: "workspace", projection: "communications-workspace", status: "completed", outcome: "success" },
    "forms-loading": { route: "forms", phase: "workspace", projection: "forms-workspace", status: "completed", outcome: "success" }
  };
  return Object.assign({}, defaults[journey], overrides || {});
}
function batch(service, samples, batchId) { return service.recordClientBatch(samples, batchId || id("b")); }

function browserRuntime(deliveryPlan) {
  const timers = [], plan = (deliveryPlan || []).slice(), sends = [];
  const runner = {
    success: null,
    failure: null,
    withSuccessHandler(handler) { this.success = handler; return this; },
    withFailureHandler(handler) { this.failure = handler; return this; },
    portalRecordClientPerformanceBatch(metrics, batchId) {
      sends.push({ metrics, batchId });
      const result = plan.length ? plan.shift() : "success";
      if (result === "failure") this.failure(new Error("RPC_FAILED"));
      else this.success({ writeSuccess: true, acceptedSampleCount: metrics.length, rejectedSampleCount: 0, droppedSampleCount: 0, batchId });
    }
  };
  const context = {
    window: {},
    document: { getElementById() { return null; } },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    google: { script: { run: runner } },
    performance: { now() { return 1000; } },
    Date,
    Math,
    Set,
    Promise,
    console,
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {}
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "../Portal/App/SpecCentralApp.html"), "utf8").match(/<script[^>]*>([\s\S]*?)<\/script>/i)[1];
  vm.runInContext(source, context);
  context.App = context.window.App;
  context.App.recordPerformance = function () { return 0; };
  return { App: context.App, timers, sends, runNextTimer() { const callback = timers.shift(); if (callback) callback(); } };
}

function run() {
  const rt = runtime(), service = rt.service;
  const valid = metric("journey.forms-loading", validDetail("forms-loading"));
  rt.resetOperations();
  const one = batch(service, [valid]);
  assert.strictEqual(one.writeSuccess, true);
  assert.strictEqual(one.acceptedSampleCount, 1);
  assert.strictEqual(JSON.stringify(one.operations), JSON.stringify({ validationPasses: 1, lockAttempts: 1, cacheReads: 1, cacheWrites: 1 }));
  assert.strictEqual(rt.operations.lockAttempts, 1);
  assert.strictEqual(rt.operations.cacheReads, 1);
  assert.strictEqual(rt.operations.cacheWrites, 1);

  rt.resetOperations();
  const twenty = Array.from({ length: 20 }, () => metric("journey.participant-search", validDetail("participant-search")));
  const twentyAck = batch(service, twenty);
  assert.strictEqual(twentyAck.acceptedSampleCount, 20);
  assert.strictEqual(rt.operations.lockAttempts, 1);
  assert.strictEqual(rt.operations.cacheReads, 1);
  assert.strictEqual(rt.operations.cacheWrites, 1);

  const invalidMetric = batch(service, [metric("journey.private@example.invalid", validDetail("forms-loading"))]);
  assert.strictEqual(invalidMetric.rejectedSampleCount, 1);
  const unknownJourney = batch(service, [metric("journey.unknown", validDetail("forms-loading"))]);
  assert.strictEqual(unknownJourney.rejectedSampleCount, 1);
  assert.throws(() => service.measureJourney("unknown", () => true), /UNKNOWN_TELEMETRY_JOURNEY/);

  const pii = "private.person@example.invalid";
  ["route", "phase", "module", "projection", "reason", "outcome", "status", "cache", "trigger", "environment", "source", "journey", "freeText"].forEach(field => {
    const detail = validDetail("forms-loading");
    detail[field] = pii;
    const ack = batch(service, [metric("journey.forms-loading", detail)]);
    assert.strictEqual(ack.rejectedSampleCount, 1, "PII field should be rejected: " + field);
  });
  const malformedEvent = metric("journey.forms-loading", validDetail("forms-loading"), { eventId: "bad", correlationId: "bad" });
  assert.strictEqual(batch(service, [malformedEvent]).rejectedSampleCount, 1);
  const malformedBatch = service.recordClientBatch([metric("journey.forms-loading", validDetail("forms-loading"))], "bad");
  assert.strictEqual(malformedBatch.rejectedSampleCount, 1);

  const partial = batch(service, [metric("journey.forms-loading", validDetail("forms-loading")), metric("unknown", {})]);
  assert.strictEqual(partial.acceptedSampleCount, 1);
  assert.strictEqual(partial.rejectedSampleCount, 1);
  const oversized = batch(service, Array.from({ length: 25 }, () => metric("journey.forms-loading", validDetail("forms-loading"))));
  assert.strictEqual(oversized.acceptedSampleCount, 20);
  assert.strictEqual(oversized.droppedSampleCount, 5);

  const duplicateMetric = metric("journey.forms-loading", validDetail("forms-loading"));
  const duplicateBatchId = id("b");
  assert.strictEqual(batch(service, [duplicateMetric], duplicateBatchId).acceptedSampleCount, 1);
  rt.resetOperations();
  const duplicate = batch(service, [duplicateMetric], duplicateBatchId);
  assert.strictEqual(duplicate.writeSuccess, true);
  assert.strictEqual(duplicate.reason, "duplicate-batch");
  assert.strictEqual(duplicate.droppedSampleCount, 1);
  assert.strictEqual(rt.operations.cacheWrites, 0);

  for (let index = 0; index < 7; index++) batch(service, Array.from({ length: 20 }, () => metric("journey.participant-search", validDetail("participant-search"))));
  const bounded = service.getDiagnostics();
  assert.ok(bounded.journeySampleCount <= 120);
  assert.ok(bounded.counters.evictedSampleCount > 0);
  assert.ok(bounded.safeSerializedBytes <= 72 * 1024);
  const journeyEnvelope = JSON.parse(rt.cacheValues.get("SC_PERF_JOURNEYS_V3"));
  const storedBytes = Buffer.byteLength(JSON.stringify(journeyEnvelope));
  assert.ok(storedBytes >= 30 * 1024, "boundary test should exercise a realistically populated cache");
  assert.ok(storedBytes <= bounded.safeSerializedBytes);

  rt.controls.lockAvailable = false;
  const lockDrop = batch(service, [metric("journey.forms-loading", validDetail("forms-loading"))]);
  assert.strictEqual(lockDrop.writeSuccess, false);
  assert.strictEqual(lockDrop.reason, "lock-contention");
  rt.controls.lockAvailable = true;
  assert.ok(service.getDiagnostics().counters.lockDropCount >= 1);

  rt.controls.failWrites = true;
  const writeFailure = batch(service, [metric("journey.forms-loading", validDetail("forms-loading"))]);
  assert.strictEqual(writeFailure.writeSuccess, false);
  assert.strictEqual(writeFailure.reason, "cache-write-failed");
  rt.controls.failWrites = false;
  assert.ok(service.getDiagnostics().counters.writeFailureCount >= 1);
  assert.strictEqual(service.getDiagnostics().degraded, true);

  batch(service, [
    metric("journey.event-loading", validDetail("event-loading", { phase: "landing", projection: "event-manager", outcome: "success", status: "completed" })),
    metric("journey.event-loading", validDetail("event-loading", { phase: "workspace", projection: "event-workspace", outcome: "failure", status: "failed", reason: "request-failed" })),
    metric("journey.dashboard-bootstrap", validDetail("dashboard-bootstrap", { phase: "bootstrap", projection: "bootstrap" })),
    metric("journey.dashboard-bootstrap", validDetail("dashboard-bootstrap", { phase: "dashboard", projection: "dashboard" }))
  ]);
  const summary = service.getDiagnostics().summary;
  const eventLanding = summary.find(row => row.journey === "event-loading" && row.phase === "landing" && row.source === "client");
  const eventWorkspace = summary.find(row => row.journey === "event-loading" && row.phase === "workspace" && row.source === "client");
  assert.ok(eventLanding.successCount >= 1 && eventLanding.failureCount === 0);
  assert.ok(eventWorkspace.failureCount >= 1 && eventWorkspace.successCount === 0 && eventWorkspace.p95Ms === 0);
  assert.ok(summary.some(row => row.journey === "dashboard-bootstrap" && row.phase === "bootstrap"));
  assert.ok(summary.some(row => row.journey === "dashboard-bootstrap" && row.phase === "dashboard"));

  const returned = service.measureJourney("forms-loading", () => ({ ok: true }), { route: "forms", phase: "workspace", projection: "forms-workspace" });
  assert.strictEqual(returned.ok, true);
  const original = new Error("failure"); original.code = "CACHE_REBUILD_BUSY";
  assert.throws(() => service.measureJourney("participant-search", () => { throw original; }, { route: "search", phase: "platform-search", projection: "platform-search" }), error => error === original);
  assert.ok(service.getDiagnostics().recent.every(sample => sample.build === "quality-gate" && sample.environment === "test" && sample.schemaVersion === "sc-perf-v3" && /^[cs][a-z0-9]{11,31}$/.test(sample.eventId)));

  const appSource = fs.readFileSync(path.join(__dirname, "../Portal/App/SpecCentralApp.html"), "utf8");
  const performanceSource = fs.readFileSync(path.join(__dirname, "../Portal/App/SpecCentralPerformance.html"), "utf8");
  assert.ok(appSource.includes("withSuccessHandler(complete).withFailureHandler(retry)"));
  assert.ok(appSource.includes("performanceInFlightBatch"));
  assert.ok(appSource.includes("performanceDroppedSamples"));
  assert.ok(appSource.includes("App.scheduleClientPerformanceFlush(250)"));
  assert.ok(!/\(!App\.state\.dashboardUsableRecorded\s*&&\s*!force\)/.test(appSource));
  assert.ok(appSource.includes("App.loadParticipantExplorerPage(true, attempt + 1, started)"));
  assert.ok(performanceSource.includes('visibilityState === "hidden"'));

  const direct = browserRuntime(["success"]);
  direct.App.state.currentPage = "formBuilder";
  direct.App.state.dashboardUsableRecorded = false;
  direct.App.recordClientPerformance("journey.forms-loading", 900, validDetail("forms-loading"));
  assert.strictEqual(direct.timers.length, 1, "direct route should schedule without Dashboard");
  direct.runNextTimer();
  assert.strictEqual(direct.sends.length, 1);
  assert.strictEqual(direct.App.state.pendingPerformanceMetrics.length, 0);

  const retrying = browserRuntime(["failure", "success"]);
  retrying.App.recordClientPerformance("journey.forms-loading", 900, validDetail("forms-loading"));
  retrying.runNextTimer();
  assert.strictEqual(retrying.App.state.pendingPerformanceMetrics.length, 1, "failed RPC remains queued");
  retrying.runNextTimer();
  assert.strictEqual(retrying.App.state.pendingPerformanceMetrics.length, 0, "acknowledged retry clears queue");
  assert.strictEqual(retrying.sends.length, 2);

  const exhausted = browserRuntime(["failure", "failure", "failure"]);
  exhausted.App.recordClientPerformance("journey.forms-loading", 900, validDetail("forms-loading"));
  exhausted.runNextTimer(); exhausted.runNextTimer(); exhausted.runNextTimer();
  assert.strictEqual(exhausted.App.state.pendingPerformanceMetrics.length, 0);
  assert.strictEqual(exhausted.App.state.performanceDroppedSamples, 1);
  assert.strictEqual(exhausted.sends.length, 3);

  const overflow = browserRuntime([]);
  overflow.App.state.performanceMaxQueue = 2;
  overflow.App.recordClientPerformance("journey.forms-loading", 900, validDetail("forms-loading"));
  overflow.App.recordClientPerformance("journey.forms-loading", 900, validDetail("forms-loading"));
  overflow.App.recordClientPerformance("journey.forms-loading", 900, validDetail("forms-loading"));
  assert.strictEqual(overflow.App.state.pendingPerformanceMetrics.length, 2);
  assert.strictEqual(overflow.App.state.performanceDroppedSamples, 1);

  console.log(JSON.stringify({
    status: "passed",
    assertions: "privacy, batching, bounds, degraded counters, dedupe, grouping, return/error parity, browser delivery source",
    journeySamples: service.getDiagnostics().journeySampleCount,
    counters: service.getDiagnostics().counters
  }, null, 2));
}

module.exports = { runtime, metric, validDetail, batch, browserRuntime };
if (require.main === module) run();
