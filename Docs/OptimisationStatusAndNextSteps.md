# SpecCentral Optimisation — Current Status and Next Steps

**Prepared:** 17 July 2026
**Purpose:** answer "what should we optimise for speed and for handling large amounts of data" with the *current, verified* state of the repository — not a fresh audit from zero.

## Read this first

You already have three excellent, very recent internal audits covering exactly this question, in far more depth than is useful to repeat here:

- `Docs/SpecCentralPerformanceScalabilityAudit.md` (16 July) — the deep technical audit: evidence, findings, a scorecard (54/100 overall enterprise readiness), and performance budgets.
- `Docs/SpecCentralPerformanceImplementationRoadmap.md` (16 July) — a critical reassessment of that audit into a sequenced, ROI-ranked delivery plan (Sprint 0–3), with 10 fully specified engineering tasks (PERF-001 through PERF-010).
- `Docs/WholePlatformStatusPerformanceReview.md` (15 July) — the whole-platform view across SpecCentral, Attendance, and TAU Central, including the headshot/Drive-reliability problem and a phased storage-evolution plan (Option A/B/C).

I read all three in full, then spent my time independently verifying their central technical claims against the actual code rather than re-deriving the same analysis. **They hold up.** This document is the thin layer on top: confirmation of what's real, what's changed since 16 July, one thing they didn't flag, and a single consolidated priority list mapped to your two questions (loading speed, large-data longevity).

## What I independently verified against the code

| Claim in the existing docs | Verified against | Result |
|---|---|---|
| `BootstrapService.getContext()` is genuinely participant-free | `Services/BootstrapService.js` | Confirmed. The file header itself states the boundary rule ("must never read ParticipantService..."), and the code matches — no participant/headshot calls anywhere in it. |
| `PerformanceCacheService` has generation-based atomic publication, leases, and stale-while-revalidate | `Services/PerformanceCacheService.js` | Confirmed. This is a genuinely well-built piece of engineering for what it is — chunked gzip storage, immutable generations with the active pointer written last, single-flight lease acquisition via `LockService`, previous-generation fallback on a failed rebuild. Better than the median hand-rolled Apps Script cache layer. |
| Participant list/page/filters/detail projections exist with real server-side pagination and stale-while-revalidate | `Services/ParticipantProjectionService.js` | Confirmed — `getPage()`, `getFilters()`, `getDetail()` are real, bounded, cached, and instrumented. `warm()`/`warmShared()` (the projection-warmer functions the roadmap calls for) exist and are implemented. |
| ~12 direct `google.script.run` call sites remain under `Portal` (bypassing the request wrapper) | Repo-wide grep | Now **13**, across `Search.html`, `SpecCentralApp.html`, `SpecCentralFormBuilder.html`, `SpecCentralProfiles.html`. Essentially unchanged — this is still open. |
| Shared projection warmer triggers exist in code but were not installed as of 15–16 July | `SpecPortal.js:522-523` (`ScriptApp.newTrigger("warmSpecCentralSharedProjections").timeBased().everyMinutes(10)`, and the 5-minute Attendance one) | The installer code is real and correct. **I cannot verify from the repository whether it has actually been run** — that's live Apps Script trigger state, invisible from a git checkout. Treat this as still open until you (or a deployment step) explicitly calls the installer once. |

## One thing not called out in the existing docs

The scalability audit's "immediate spreadsheet improvements" and the platform review's "priority examples" for full-sheet reads both focus on Participants, Timeline, and Attendance. A repo-wide grep for `getDataRange()` (the unbounded full-sheet read pattern they're warning about) shows it's also still used, unbounded, in:

- `Services/ShowRunService.js` — full sheet read on every canonical fetch (`sheet.getDataRange().getDisplayValues()`), no visible cache guard at the point I checked.
- `Services/RehearsalService.js`, `Services/StaffService.js`, `Services/StaffAccessService.js`, `Services/StaffProfileService.js`, `Services/StableIdMigrationService.js`.

Staff is already flagged in the scalability audit (5-minute cache, "short relative to source volatility and read cost"). Show Run and Rehearsals are not mentioned by name anywhere in the three docs. Worth adding to whatever backlog tracks PERF-002-style work — same fix pattern (bounded ranges, cache ownership, read-once-per-request) applies.

## Consolidated priority list

This maps the existing roadmap's Sprint 0/1 items (which remain correct — I'm not overriding them) onto your two stated goals, in the order I'd actually do them.

### For faster activity and loading speed

1. **Install the projection warmers that already exist in code** (`SpecPortal.js:522-523`). This is the single highest ratio of impact to effort in the entire backlog — the code is written, tested per the docs, and not running. One authorised call turns most business-hours cold-start failures into warm hits.
2. **Finish Participant remote pagination** (roadmap task PERF-002) — stop the remaining workflows (browse, export, some profile paths) from silently upgrading to the complete participant list. The server-side piece (`getPage`) is done; the remaining work is entirely in removing client call sites that still reach for the full list.
3. **Collapse the two serial startup calls into one** (PERF-007, Bootstrap + minimal Dashboard). `BootstrapService` is already clean and small — this is a genuinely contained piece of work now that its boundary is proven correct.
4. **Replace global search's fan-out** (PERF-003) — one query can currently cold-load Participants, Groups, Timeline, Staff, Show Run, and Attendance. This is your biggest single latency and cache-stampede risk after the two items above.
5. **Route-load Form Builder, Communications, and Profiles** (PERF-008) — real but second-order once 1–4 land; the 687 KB shell compresses to ~137 KB, so it's not your dominant cost, just worth doing once the server-side paths are fast.

### For longevity / large-data handling

1. **Do not let `PlatformStoreService` (Script Properties-backed JSON collections) keep growing.** The scalability audit calls this "critical capacity mismatch" — records capped near 8,000 characters, tasks capped at 100, audit at 120, and every write rewrites the whole collection under a lock. This is the one finding in all three documents I'd treat as a hard ceiling rather than a tuning problem: it will eventually just stop working, not degrade gracefully. Move tasks, audit, workflow, form response, and communications data out of Properties before volume forces the issue.
2. **Add the Attendance transaction/revision model** (PERF-009 / the platform review's §4) — today, a live roll re-reads the entire event sheet every ~20 seconds, and student history scans every event sheet in the Event Index. At current headcounts this is tolerable; at 100,000 attendance records it isn't. This is independent of, and complements, the identity/permission fixes already made to the Attendance project this session.
3. **Fix `ShowRunService`/`RehearsalService`/`StaffService` unbounded reads** (the gap I found above) before they become as painful as Participants/Timeline already were.
4. **Treat the PostgreSQL pilot as a Sprint-3 decision, not a Sprint-1 one** — both existing docs agree on this and I agree with their reasoning: migrating before the interactive-path fixes above just relocates the same overfetching problem onto a database instead of fixing it. Pilot one domain (Attendance transactions is the strongest candidate per both docs) only after Sprint 1 measurements show it's still the bottleneck.
5. **Headshots**: the platform review's root-cause finding is solid and worth prioritising on its own track — Attendance bypasses SpecCentral's secure image service entirely and still emits raw `drive.google.com/thumbnail` URLs, which is a genuine cross-browser reliability problem (works in your Chrome session, silently fails in Safari/incognito/phone), not just a performance one. This is also unrelated to but adjacent to the check-in security work already done — worth doing before headshots are added to any public-facing surface.

## What I'd explicitly *not* do right now

Both existing docs already say this clearly and I agree: no React rewrite, no GraphQL, no WebSockets, no Kubernetes/microservices, no full PostgreSQL migration, no distributed cache. All of those solve problems you don't have yet and would add operational overhead you'd be carrying alone. The current architecture (vanilla JS shell + Apps Script services + a genuinely well-designed cache layer) is a reasonable foundation for the *next* stage of growth, not something to discard.

## Recommended next action

Given everything above, the highest-leverage next step is small and reversible: **run the projection warmer installer once** and confirm (via the diagnostics `portalGetPerformanceDiagnostics()` already returns) that warm hits start showing up. That single action validates or invalidates a large share of the roadmap's Sprint 1 assumptions before you commit engineering time to anything else on this list.
