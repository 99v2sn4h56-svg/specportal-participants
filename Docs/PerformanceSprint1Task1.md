# Performance Sprint 1 — Task 1 Measurement Gate

**ADR:** ADR-001  
**Status:** Remediated locally; production benchmark pending  
**Date:** 16 July 2026  
**Task 2:** Not started

## Scope

Task 1 measures six canonical user journeys without changing their business behaviour:

- Dashboard bootstrap
- Participant search
- Participant Passport
- Event loading
- Communications loading
- Forms loading

The quality-gate remediation preserves the original timing coverage while replacing unsafe validation, persistence, delivery and summary behaviour.

## V3 telemetry contract

`PerformanceTelemetryService` publishes `spec-central-performance-diagnostics-v3` with sample schema `sc-perf-v3`.

- Browser metric names and every browser-supplied dimension are strict server-side enums.
- Arbitrary strings and malformed event, batch or correlation IDs are rejected.
- Journey and legacy operational samples use separate V3 cache keys.
- Browser batches perform one validation pass, lock attempt, cache read, merge, serialisation and cache write.
- The cache ceiling is 72 KiB, below the Apps Script 100 KB per-key limit.
- Event IDs and recent batch IDs provide retry deduplication.
- Each sample includes build, environment, source, schema, event, batch and correlation context.
- Diagnostics expose evictions, drops, lock contention and cache-write failures.
- Successful latency percentiles are grouped by journey, source, phase, route and projection. Failures are reported separately.

Current browser call sites do not provide participant IDs, names, emails, phone numbers, school identifiers, search text, form content, event IDs or communication content. The server now rejects rather than sanitises unrecognised browser values.

## Browser delivery

The browser retains a batch until the server acknowledges a successful write. Delivery uses:

- one in-flight batch;
- a maximum 100-sample queue;
- three conservative attempts;
- requeue-by-retention on ordinary RPC failure;
- event and batch deduplication;
- explicit browser dropped-sample accounting;
- route-independent scheduling;
- best-effort flush on visibility change and unload.

Browser termination can still prevent delivery because Apps Script RPC does not provide a guaranteed unload transport. Ordinary RPC failures no longer discard a batch immediately.

## Storage ownership

| Store | Owner | Contents | Bound |
|---|---|---|---:|
| `SC_PERF_JOURNEYS_V3` | `PerformanceTelemetryService` | Six canonical client/server journeys | 120 samples and 72 KiB |
| `SC_PERF_LEGACY_V3` | `PerformanceTelemetryService` | Strictly registered operational metrics | 80 samples and 72 KiB |
| `SC_PERF_DEGRADED_V3` Script Property | `PerformanceTelemetryService` | Lock-drop and write-failure counters that cannot safely be written to a contended cache | Small counter object |

Script Cache remains best effort and is not the durable telemetry destination. `SC_PERF_BATCH` execution logs remain the longer-lived record. Full Cloud Logging operation still requires an approved standard Google Cloud project.

## Correctness changes

| Failed review finding | Remediation |
|---|---|
| Browser PII could enter allowed fields | Exact metric and dimension enums; invalid samples are rejected |
| Batch called single-record persistence repeatedly | Dedicated `recordClientBatch()` performs one storage cycle |
| Samples removed before acknowledgement | Queue remains intact until successful acknowledgement |
| Dashboard-dependent flushing | Shared scheduler runs for every direct route |
| Cache could exceed 100 KB | 72 KiB hard ceiling plus count and per-sample bounds |
| Silent lock/write failure | Structured acknowledgement and visible degraded counters |
| Failures mixed into percentiles | Successful p50/p95 and failure rate are separate |
| Event and Dashboard phases combined | Phase, route and projection are part of the summary key |
| Search retries reset timing | Original `performance.now()` value is passed through recursive retries |
| No identifiers or deployment context | Compact event/batch/correlation IDs plus build/environment/source/schema |

## Technical debt removed

- Removed unused `PerformanceTelemetryService.measure()`.
- Removed the duplicate `getSummary()` cache read from the diagnostics gateway.
- Removed permissive unknown-journey behaviour.
- Replaced V1 cache keys carrying a V2 schema with matching V3 names.
- Moved non-journey browser timings to the existing local performance buffer so they cannot crowd the central measurement gate.
- Isolated legacy server metrics from journey retention.
- Replaced source-presence-only assertions with server batch tests and executable browser delivery simulations.

## Validation

### Verified locally

- JavaScript syntax for modified server and test files.
- Browser parsing for all six affected HTML modules.
- `git diff --check`.
- `Tests/PerformanceTelemetryServiceNodeTests.cjs`:
  - strict PII and free-text rejection;
  - unknown metric/journey and malformed ID rejection;
  - 1, 20, maximum and partially invalid batches;
  - one lock/read/write per successful batch;
  - cache bounds and eviction;
  - write failure and lock contention;
  - degraded counters;
  - event and batch deduplication;
  - success/failure and phase grouping;
  - return and original-exception preservation;
  - direct-route delivery, acknowledgement, retry, retry exhaustion and queue overflow.
- `runPerformancePackageTests()` was extended with Apps Script integration assertions but has not been executed remotely because this local version has not been pushed or deployed.

### Mocked benchmark

`Tests/PerformanceTelemetryBenchmark.cjs` is explicitly local and mocked. It excludes real Apps Script services and RPC latency. The `.cjs` test files are intentionally excluded from Apps Script uploads by file type.

| Operation | p50 | p95 |
|---|---:|---:|
| Single server sample | 1.698 ms | 2.097 ms |
| Single-sample browser batch | 1.825 ms | 2.239 ms |
| 20-sample browser batch | 1.933 ms | 2.187 ms |
| Near-capacity diagnostics | 0.091 ms | 0.110 ms |
| Simulated lock-contention acknowledgement | 0.010 ms | 0.017 ms |

These values validate algorithmic bounds only and are not production performance claims.

## Remaining production validation

No production-representative Apps Script benchmark can be run without pushing or deploying, which was explicitly excluded from this task. Before Task 1 receives final production approval:

1. deploy to a reviewed non-production version;
2. run telemetry-on versus telemetry-off tests for single samples, 20-sample batches, near-capacity diagnostics and concurrent requests;
3. confirm <25 ms p95 server overhead and >=95% expected sample acknowledgement;
4. run `runPerformancePackageTests()` in Apps Script;
5. verify Cloud Logging retention and access under the approved Google Cloud project.

Task 2 must not begin until this production validation passes.
