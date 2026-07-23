# ADR-001: Require a performance measurement gate

- **Status:** Accepted; V3 implemented locally, production validation pending
- **Date:** 16 July 2026
- **Decision owners:** SpecCentral product and engineering leads

## Context

SpecCentral records client/server timings through `PerformanceTelemetryService`. The V3 implementation uses separate size-bounded Script Cache envelopes for canonical journeys and legacy operational metrics, and the administrator UI displays phase-specific successful percentiles, failure rates and degraded-storage counters. Script Cache remains best effort. `clasp logs` cannot currently query production execution logs because the Apps Script project has no linked standard GCP project ID.

Several recent defects were visible as 30-second timeouts and `CACHE_REBUILD_BUSY`, but current cold/warm p50 and p95 values are unknown. Large changes made without a baseline could improve code structure without improving user journeys.

## Decision

Performance work beyond low-risk correctness fixes must pass a measurement gate:

1. approved durable retention for PII-free timing samples;
2. versioned build, route, cache outcome, cold/warm, duration, payload, and source-scan dimensions;
3. at least 30 cold and 30 warm samples per priority journey/browser class;
4. before/after comparison against a declared target;
5. rollback if the target is missed or error rate regresses.

Telemetry must be failure-isolated and must not become part of the critical request transaction.

## Alternatives considered

- **Rely on anecdotal screenshots:** rejected because it cannot distinguish cold start, cache eviction, network, rendering, or source-read latency.
- **Use Script Cache summaries only:** retained as an immediate convenience, rejected as the durable system because samples are evictable and too short-lived.
- **Deploy broad optimisations first:** rejected because ROI cannot be established.

## Consequences

- Sprint 0 adds little direct speed but prevents low-value optimisation.
- A GCP/logging or approved metric destination requires governance.
- Performance regressions become release decisions rather than subjective reports.

## Acceptance

- >=95% of expected journey samples are retained for 30 days.
- p50/p95/max can be filtered by build, route, cache state, and device/browser class.
- telemetry overhead is <25 ms p95 server-side and does not block UI rendering.
