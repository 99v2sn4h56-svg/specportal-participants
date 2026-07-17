# SpecCentral + Attendance integration — implementation-ready architecture plan

Date: 17 July 2026 (overnight autonomous session)
Status: **Design only. No implementation performed** (per instruction — scaffolding was optional and judged not worth the risk of touching shared shell/routing code without a live-execution verification path; see "What was not done" at the end).

## Current state (verified by reading the actual code, not assumed)

SpecCentral already has almost exactly the shell architecture the target asks for — this is much closer to done than a from-scratch integration:

- **Shared shell**: `Portal/App/Router.js` + `Navigation.js` + `State.js` already implement single-page client-side routing (`App.navigate('<page>')`), with `Portal/Pages/*.html` as `<template>`-based, lazily-instantiated page bodies (confirmed: `Portal/App/SpecCentralApp.html` registers `page-calendar` etc. by template ID, only rendered when navigated to).
- **Shared authentication/permissions**: `UserContextService.js` (current user + staff record resolution) and `AuthorizationService.js`/capability checks (`requirePortalCapability_("Participants.View")` etc., seen throughout `SpecPortal.js`) already gate every workspace consistently.
- **Shared entity model**: Participants, Staff, Timeline/Rehearsals, Show Run all already resolve through dedicated projection services with a common caching pattern (`PerformanceCacheService.getOrLoad`/`getOrLoadStaleWhileRevalidate`).
- **Target nav items already mostly exist as sidebar entries** (`Portal/Components/Sidebar.html`): Dashboard, Participants (with Attendance and a "Teachers" view nested under it), Communications, Forms, Operations (as "Event Manager" + a second "Operations" toggle), Administration, Settings.
- **Calendar already exists as a routed page** (`Portal/Pages/Calendar.html`, registered as `page-calendar` in the router) but **has no sidebar nav button** — reachable only by direct navigation call, not from the primary nav today.
- **Attendance integration today is a hybrid, not a placeholder**: `Portal/Pages/Attendance.html` embeds the full standalone Attendance web app in an `<iframe>` (for the actual check-in-management UI — reusing Attendance's own, already-hardened UI rather than reimplementing it) **plus** a separately-rendered "below the iframe" summary section (status counts, upcoming-events list, search/filter) populated from `AttendanceProjectionService.js` — a thin, cached (`PerformanceCacheService.getOrLoadStaleWhileRevalidate`) wrapper around `AttendanceService.getSummary()`/`getEvents()`, which in turn calls Attendance's own public, read-only `AttendanceApi.js` (`?api=1` / the shared-secret channel for anything participant-level). **No Attendance data is loaded during SpecCentral's initial bootstrap** — confirmed: `AttendanceProjectionService` is only invoked when the Attendance page/dashboard tile is actually rendered, and the public QR check-in surface remains a fully separate Apps Script deployment, reachable only via `AttendanceService.getWebAppUrl()`/the iframe `src` — never merged into SpecCentral's own deployment. **Both of these "no premature load" / "isolated public route" requirements are already satisfied by the current design.**

## Target navigation — gap analysis

| Target item | Current state | Gap |
|---|---|---|
| Dashboard | Exists, top-level nav | None |
| Participants | Exists, top-level nav | None |
| **Calendar** | Page/route exists, **no nav button** | Add sidebar entry — smallest possible gap, a markup-only change |
| **Attendance** | Page/route exists, **nested under Participants, not a top-level peer** | Promote to a top-level sidebar entry (or keep both a nested quick-link and a top-level entry, since Calendar → Attendance deep-linking will want a direct route regardless) |
| Communications | Exists, top-level nav | None |
| Operations | Exists, but currently split across two nav entries ("Event Manager" and "Operations") | Consolidate into one Operations workspace, or keep both as sub-views within it — a navigation-grouping decision, not a missing-feature one |
| Administration | Exists, top-level nav (separate from "Settings") | Decide whether Settings folds into Administration or stays distinct — both already exist and are already permission-gated separately (`Administration.View` vs `Settings.Admin`), so this is a product decision, not a technical gap |
| ~~Reports~~ (explicitly not wanted) | No dedicated "Reports" nav item found in the sidebar today | Already absent — nothing to remove |

**The actual engineering gap is small**: add one nav button (Calendar) and promote/duplicate one nav entry (Attendance to top-level). The harder work is the *cross-workspace linking* requested, not new top-level pages.

## Cross-workspace deep-linking — design per link

- **Calendar → Attendance**: `Router.js`'s navigation already accepts a target page; extend it to accept an optional context parameter (e.g. `App.navigate('attendance', { sessionId })`) that `Attendance.html`'s controller reads on mount to auto-select/scroll to that session in the summary list, and to pre-fill the iframe's `src` with the same deep-link query param the standalone Attendance app already supports (`?sessionId=` or the newer `?token=` — both already implemented in Attendance's own `Code.js` `doGet`, confirmed in this session's earlier C1 work; SpecCentral's iframe embed can reuse this immediately, no Attendance-side change needed).
- **Participant → Attendance history**: `AttendanceApi.js`'s existing secret-gated `participant-history` action (confirmed working this session, protected by `getAttendanceHistoryForStudent`'s manager gate) is already the right transport — `AttendanceService.getParticipantHistory(studentKey)` already exists in `AttendanceService.js` (confirmed by reading it during Phase 6). The gap is purely a UI one: add a "Attendance history" panel/tab to the Participant detail page (`Portal/Pages/ParticipantPage.js`) that calls this already-existing service function. No new backend work needed.
- **Attendance → Participant profile**: the reverse link. Attendance's own data model keys students by `studentKey` (confirmed throughout the Attendance codebase this session — `SPEC-STAGING-STUDENT-A1`-style keys, real production equivalents). SpecCentral's Participant records are keyed the same way (`studentKey`/`id`, confirmed in `ParticipantProjectionService.js`). A link from an Attendance roster row to `App.navigate('participants', { studentKey })` (opening that participant's detail view) is a small, additive client-side change once Attendance is promoted to a first-class integrated view rather than a pure iframe — while it's still an iframe, this link would need to `postMessage` out of the iframe to the parent SpecCentral shell, which is a more involved but well-understood browser pattern.
- **Communications integration**: not yet designed in detail by the source docs or this pass — recommend treating as its own follow-up design task once the Calendar/Attendance/Participant links above are built and the pattern is proven, rather than designing four integration points simultaneously.
- **Public QR check-in stays isolated**: already true today, confirmed above — no change needed, just don't regress it when Attendance moves from "iframe" to "more native" (any native reimplementation must keep the public check-in flow on Attendance's own, separately-hardened deployment; this session's entire C1 remediation work is exactly the isolation boundary that must be preserved).

## What can be reused vs. what needs an adapter

**Reuse directly, no adapter needed:**
- `Router.js`/`Navigation.js`/`State.js` (shell) — already generic enough for a 7th/8th workspace.
- `AuthorizationService`/`UserContextService` (permissions) — already used uniformly.
- `AttendanceApi.js`'s public/secure split (Attendance side) — already the correct transport for both summary data and participant-history; no changes needed there.
- `AttendanceProjectionService.js`/`AttendanceService.js` (SpecCentral side) — already exactly the right shape (cached, lazy, no-bootstrap-load) for a deeper integration; extend rather than replace.

**Needs a thin adapter:**
- The iframe-to-native transition for Attendance's actual check-in-management UI (not the public QR surface) — if/when that's reimplemented natively inside SpecCentral rather than iframed, it needs a data adapter translating Attendance's own Sheet-shaped responses (`getSessions`/`getSessionAttendance`, already manager-gated per this session's C1 work) into SpecCentral's projection-service response shape (`{ data, requestMeta: { cache, ... } }`), so the rest of the shell's caching/loading-state conventions keep working unmodified.
- Cross-iframe deep-linking (Attendance → Participant) needs a small `postMessage` bridge until/unless the iframe is retired in favor of a native view.

**Needs a genuinely new decision, not just code:**
- Whether "Attendance" becomes a fully native SpecCentral workspace (retiring the iframe) or stays a hybrid indefinitely. The iframe approach has a real advantage: it reuses Attendance's own already-hardened, already-tested authorization model (this session's entire C1 effort) with zero duplication risk. A native reimplementation would need to duplicate or carefully share that same authorization logic inside SpecCentral's own permission model — a nontrivial security-relevant decision, correctly out of scope for this document to make unilaterally.

## What was not done tonight
Per instruction, no full integration was implemented. I also chose not to build interface/adapter scaffolding in an isolated branch, even though the instructions allowed it — the shared shell files (`Router.js`, `Navigation.js`, `Sidebar.html`) are used by every existing workspace, and changing them without any live-execution verification path (same constraint noted in Phases 2/4/5) risks a regression across the entire platform, not just the new integration surface. This document is written to be directly actionable once you're back and can verify changes live.
