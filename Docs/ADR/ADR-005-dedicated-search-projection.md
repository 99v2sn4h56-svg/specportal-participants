# ADR-005: Replace global-search fan-out with a dedicated projection

- **Status:** Proposed
- **Date:** 16 July 2026

## Context

`PlatformSearchService.search()` can retrieve and scan Participants, Groups, Timeline, Staff, Show Run, and Attendance for one query. Warm caches mask some cost, but a cold source or broad invalidation can make a keystroke trigger expensive unrelated adapters. The browser expects command-palette responsiveness and permission-safe navigation references.

## Decision

Build one compact, revision-keyed, permission-safe search projection containing navigation metadata only. Search queries consult this projection and return at most 50–100 ranked references. Entity updates/sync advance the search revision; the shared warmer rebuilds the projection.

At the current scale, use a cached in-memory projection. When PostgreSQL exists, replace its loader with a materialized search table using full-text/trigram indexes. Do not introduce Elasticsearch/OpenSearch until PostgreSQL search fails measured relevance or latency targets.

## Alternatives considered

- **Continue source fan-out:** rejected because latency and failure domain expand with every module.
- **Search only browser-held participants:** rejected because results are incomplete and require full collection transfer.
- **External search platform now:** rejected as premature operational complexity.

## Consequences

- Search results may be briefly stale until revision rebuild.
- Projection construction must rigorously exclude restricted/PII fields.
- Ranking becomes one testable contract instead of multiple client/server providers.

## Acceptance

- one search projection/query per remote search.
- zero Timeline/Attendance/Staff source-adapter calls per keystroke.
- warm p95 <400 ms; cold p95 <2 s; response <50 KB.
- scope/permission regression tests cover every indexed entity type.

