# ADR-002: Keep Apps Script cache as L1, add owned warm projections and durable fallback

- **Status:** Proposed
- **Date:** 16 July 2026

## Context

`PerformanceCacheService` provides compressed, generation-published, leased, stale-aware Script/User cache projections. It is materially safer than plain single-entry `CacheService`, but CacheService remains best effort and size/quota constrained. Cold participant and Timeline builds are expensive and have previously caused timeouts and rebuild-busy errors.

The audit initially described “migrating away from Apps Script caching.” An immediate removal would be high risk and would not by itself provide a replacement runtime.

## Decision

Do not remove Apps Script cache now. Treat it explicitly as an L1 acceleration layer:

- canonical services own each cache key exactly once;
- shared participant/Dashboard/filter and active Attendance projections are warmed on owned schedules;
- domain revision values make invalidation deterministic;
- a small durable safe snapshot is used when cache is evicted or rebuilding;
- source spreadsheets remain authoritative during Sprints 1–2;
- durable read models replace selected L1 loaders progressively in Sprint 3, while L1 may remain.

## Alternatives considered

- **Cache on every service boundary:** rejected because overlapping ownership produces nested work and unclear invalidation.
- **No cache; query Sheets every time:** rejected due to latency, quotas, and concurrency.
- **Immediate Redis:** rejected because Apps Script cannot use it as a natural low-latency dependency and no external runtime is yet approved.
- **Rely solely on longer TTLs:** rejected because eviction and stale correctness remain.

## Consequences

- Warmers consume controlled quota and need monitoring/uninstall ownership.
- Revision keys reduce deletion bookkeeping but old entries persist until eviction.
- Durable snapshots must contain only safe bounded projections.
- This decision supports an evolutionary backend migration without changing UI contracts.

## Acceptance

- >=95% of business-hours Dashboard/participant first-page requests use cache or safe snapshot.
- visible `CACHE_REBUILD_BUSY` rate <0.1%.
- no duplicate canonical cache publication on a single miss.
- warmer failures and last success are visible in diagnostics.

