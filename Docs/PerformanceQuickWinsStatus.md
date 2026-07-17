# SpecCentral performance — quick-wins status (read-only pass)

Date: 17 July 2026 (overnight autonomous session)
Sources read in full: `Docs/SpecCentralPerformanceScalabilityAudit.md`, `Docs/SpecCentralPerformanceImplementationRoadmap.md`, `Docs/WholePlatformStatusPerformanceReview.md`, `Docs/OptimisationStatusAndNextSteps.md`, `Docs/PerformanceSprint1Task1.md`, `Docs/ADR/ADR-001-performance-measurement-gate.md`, `Docs/FirstPerformancePackage.md`, plus direct reading of `Services/PerformanceCacheService.js`, `Services/PerformanceTelemetryService.js`, `Tests/PerformanceTelemetryBenchmark.cjs`, and `SpecPortal.js`.

**This phase is read-only analysis. No trigger was installed, no code was changed, no benchmark was run against a live environment.**

## Trigger state — confirmed directly, not just from the docs

`installSpecCentralProjectionWarmer()` — `SpecPortal.js:518-525`. Requires `Settings.Admin`. Deletes any existing triggers for `warmSpecCentralSharedProjections`/`warmSpecCentralActiveAttendanceProjection`, then installs two time-based triggers (10 min / 5 min).

**Confirmed by direct `grep` this session: this function has exactly one match in the entire codebase — its own definition.** No `onOpen()`, no menu item, no setup script, nothing else calls it. Combined with the fact that no code anywhere reports current live trigger state (the only other `ScriptApp.getProjectTriggers()` call sites all filter-and-delete rather than list/report), this is consistent with every source document's own claim: **the warmer is not installed.**

**What cannot be confirmed without live execution**: whether someone installed it manually via the Apps Script editor at some point outside of what's in this repository. There is no stored flag, property, or doc recording installation status — `OptimisationStatusAndNextSteps.md` says this plainly and I have no better answer tonight. This needs one live check (`ScriptApp.getProjectTriggers()`, run once from the editor) to close out for certain.

## No real benchmarks exist anywhere — confirmed, not assumed

Every one of the four main documents explicitly and repeatedly declines to invent production numbers:
- `SpecCentralPerformanceScalabilityAudit.md`: "No production p50/p95 number is therefore invented in this report" (blocked on no linked GCP project for `clasp logs`).
- `WholePlatformStatusPerformanceReview.md` / `FirstPerformancePackage.md`: local implementation claims only — "Live before/after milliseconds require a reviewed non-production deployment... intentionally not claimed here."
- `PerformanceSprint1Task1.md` / ADR-001: only a **mocked** Node benchmark exists (`Tests/PerformanceTelemetryBenchmark.cjs`, no real Apps Script services involved) — explicitly labelled `benchmarkType: "mocked-local-only"`.

**I am following the same discipline tonight.** I do not have headless script execution for this project (the same `clasp run` OAuth-scope limitation documented for Attendance applies equally here — verified by inspecting `Participants/appsscript.json`, which has no `executionApi` block and no attached standard GCP project, same as Attendance was before that was fixed). Installing the projection warmer in a staging copy tonight would not itself produce a benchmark — there is no way to observe its effect without either live execution or your Run-button routine, and doing it without immediate follow-up verification would just leave an untested trigger running unattended. **I chose not to install it tonight**, in favor of leaving a precise, ready-to-execute checklist for when you're back (below) — this is a 5-minute task with your help, not a multi-hour one.

## Quick-win priority list (extracted verbatim from the existing docs, with references — not something I invented tonight)

All three docs converge on the same #1, independently:
1. **Install the already-written projection warmers** — `OptimisationStatusAndNextSteps.md`'s "Consolidated priority list" calls this out explicitly: *"the single highest ratio of impact to effort... not running."* Zero new code required.
2. **Complete Participant remote/server-side pagination** — named P0 in the Scalability Audit, the Implementation Roadmap's ROI table, and the Optimisation Status doc. (This is Phase 4 of tonight's work — see `ParticipantPaginationAudit.md`.)
3. **Fix the nested `participants:all` cache-ownership bug** and **build a dedicated search projection** — both P0 in the Roadmap's top-10.
4. Lower priority (P1+): render telemetry in a diagnostics UI, consolidate bootstrap with the Dashboard call, route-load Form Builder/Communications/Profiles/Admin modules, raise the Staff cache TTL, a typed cache-invalidation registry, limited-concurrency idle preloads.

## Ready-to-execute checklist for your next session (5–10 minutes, needs your Run-button)

1. Open the Participants Apps Script editor, run `ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction())` (wrap in a throwaway logger function, same pattern used for Attendance staging tonight) to get the real, current trigger list once and for all.
2. If the two warmer triggers aren't present, decide whether to run `installSpecCentralProjectionWarmer()` against **production** (this is a production-changing action requiring your explicit approval — I have not done this, and per tonight's authority I'm not authorized to).
3. Once installed (production or a staging copy), wait one warm cycle (10 minutes) and re-check `PerformanceTelemetryService.getDiagnostics()` for real hit/miss/latency data — this is the first point at which a genuine, non-mocked number becomes possible.

## What this phase did NOT do, and why
- Did not install any trigger, staging or production — no way to observe results without live execution, so doing so wouldn't have produced the benchmark data the task asked for; better to leave it for a session where you can drive the Run-button verification immediately after.
- Did not benchmark cold/warm bootstrap or projection generation — same reason; no live execution path tonight.
- Did not modify `SpecPortal.js`, `PerformanceCacheService.js`, or `PerformanceTelemetryService.js` — this phase was read-only per its own instructions ("Verify... read-only").
