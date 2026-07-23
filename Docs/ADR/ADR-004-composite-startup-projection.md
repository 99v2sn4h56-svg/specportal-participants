# ADR-004: Combine Bootstrap with only the minimal Dashboard projection

- **Status:** Proposed
- **Date:** 16 July 2026

## Context

The current startup performs a lightweight Bootstrap RPC and then a Dashboard/config RPC serially. The Bootstrap correctly excludes participants and headshots. Dashboard now uses cache-only Timeline and participant summaries, but still requires a second Apps Script execution before the page is considered usable.

Blind API batching could recreate the former oversized Dashboard problem.

## Decision

Create a versioned composite startup response containing:

- authenticated identity and permission/module flags;
- platform/build/cache revisions;
- an optional, failure-isolated, contract-limited Dashboard projection containing only above-the-fold data.

It must exclude participant records, complete Timeline/events, Staff directory, Attendance events, forms/responses, communication audiences, and headshots. Dashboard degradation must not prevent the authenticated shell from loading. Preserve the two-call sequence behind a feature flag until production comparison is complete.

## Alternatives considered

- **Keep two serial calls:** reliable but leaves avoidable latency.
- **Run both concurrently:** duplicates identity/permission work and may render unauthorized content before bootstrap validation if designed poorly.
- **Include all likely route data:** rejected due to payload, source scans, permissions, and cache contention.

## Consequences

- Bootstrap contract becomes slightly larger and must be tightly budgeted.
- Dashboard services need a fast/failure-isolated projection.
- One Apps Script cold start/RPC boundary is removed from the primary journey.

## Acceptance

- one blocking RPC before Dashboard usable.
- composite payload <50 KB.
- no participant/headshot or complete event records in contract tests.
- warm Dashboard p95 <2.0 s, target <1.5 s.
- shell still loads if the optional Dashboard projection fails.

