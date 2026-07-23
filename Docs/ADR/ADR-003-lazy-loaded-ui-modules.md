# ADR-003: Lazy-load selected large UI modules

- **Status:** Proposed, subject to HtmlService feasibility spike
- **Date:** 16 July 2026

## Context

`SpecCentral.html` includes approximately 687,723 raw bytes of styles, runtime, feature modules, and route templates. Dashboard users receive Form Builder, Communications, Participant profiles/editor, Staff, Operations, and other routes before using them. The concatenated source is approximately 137 KB gzipped locally, so network transfer alone may not dominate; parse/compile, Apps Script template generation, mobile performance, and growth remain concerns.

## Decision

After server hot paths are fixed, lazy-load only the largest noncritical modules:

1. Form Builder;
2. Communications;
3. Participant Profiles/editor logic;
4. Administration if its measured size warrants it.

Keep the shell, permissions, request layer, utilities, Dashboard, navigation, and small route frames in the initial response. Load a module once on route intent/entry, register it idempotently, and cache it in memory.

If an Apps Script fragment feasibility spike cannot meet reliability and first-route targets, retain static includes until a compiled/static frontend is approved rather than building a fragile loader.

## Alternatives considered

- **Split every component:** rejected as excessive complexity and request overhead.
- **Immediate React rewrite:** rejected; framework migration is not required for route loading.
- **Leave shell monolithic indefinitely:** rejected because feature growth will continue increasing parse and maintenance cost.

## Consequences

- First entry to a deferred module adds a bounded loading request.
- Module initialization and listeners must be idempotent.
- A static-include feature flag is required for rollback.
- Route source delivery becomes another endpoint to secure/version/cache.

## Acceptance

- raw initial UI source <=450 KB and approximate compressed source <=90 KB.
- Dashboard works with all deferred modules unavailable.
- deferred route first load p95 <2.5 s and repeat navigation p95 <200 ms.
- no duplicate listener registration after repeated navigation.

