// Node-only mocked benchmark; intentionally not an Apps Script file.
"use strict";

const { performance } = require("perf_hooks");
const { runtime, metric, validDetail, batch } = require("./PerformanceTelemetryServiceNodeTests.cjs");

function percentile(values, value) { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * value) - 1))] || 0; }
function measure(iterations, callback) {
  const values = [];
  for (let index = 0; index < iterations; index++) { const started = performance.now(); callback(index); values.push(performance.now() - started); }
  return { iterations, p50Ms: Number(percentile(values, 0.50).toFixed(3)), p95Ms: Number(percentile(values, 0.95).toFixed(3)), maxMs: Number(Math.max.apply(null, values).toFixed(3)) };
}

const rt = runtime(), service = rt.service;
const telemetryOff = measure(1000, () => ({ ok: true }));
const singleServer = measure(200, () => service.measureJourney("forms-loading", () => true, validDetail("forms-loading")));
const singleClient = measure(200, () => batch(service, [metric("journey.forms-loading", validDetail("forms-loading"))]));
const twenty = measure(100, () => batch(service, Array.from({ length: 20 }, () => metric("journey.participant-search", validDetail("participant-search")))));
for (let index = 0; index < 7; index++) batch(service, Array.from({ length: 20 }, () => metric("journey.event-loading", validDetail("event-loading"))));
const diagnostics = measure(200, () => service.getDiagnostics());
rt.controls.lockAvailable = false;
const contention = measure(100, () => batch(service, [metric("journey.forms-loading", validDetail("forms-loading"))]));
rt.controls.lockAvailable = true;

console.log(JSON.stringify({
  benchmarkType: "mocked-local-only",
  warning: "Excludes real Apps Script Logger, LockService, CacheService, PropertiesService and RPC latency.",
  telemetryOff,
  singleServerSample: singleServer,
  singleSampleClientBatch: singleClient,
  twentySampleClientBatch: twenty,
  nearCapacityDiagnostics: diagnostics,
  simulatedLockContention: contention,
  operations: rt.operations,
  diagnosticsState: service.getDiagnostics()
}, null, 2));
