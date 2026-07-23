# ADR-006: Migrate to PostgreSQL one read model at a time

- **Status:** Proposed for Sprint 3; not approved for immediate implementation
- **Date:** 16 July 2026

## Context

Sheets, Script Properties, and CacheService cannot meet the stated long-term volumes for Attendance, workflows, responses, communications, and millions of audit entries. A full migration would introduce schema, synchronization, authorization, operational, backup, and source-of-truth risks while SpecCentral remains in active development.

The existing service and projection contracts provide a seam for adapter replacement.

## Decision

Use an evolutionary migration:

1. select one domain based on measured pain and business ownership;
2. define a PostgreSQL schema and indexes for that domain;
3. sync from the current source into a read model with revision/reconciliation;
4. run shadow comparisons;
5. feature-flag read cutover behind the existing service contract;
6. establish one authoritative owner per field before any write migration;
7. repeat only after the pilot meets load, correctness, recovery, and operating targets.

Preferred pilot order is Attendance transaction/revision data or append-only audit, then participant read models. One modular backend is preferred; microservice decomposition is explicitly not part of this decision.

## Alternatives considered

- **Immediate whole-platform migration:** rejected due to dual-source risk and excessive scope.
- **Keep all data in Sheets/Properties:** rejected for approved enterprise scale.
- **Dual-write indefinitely:** rejected because drift and recovery semantics become ambiguous.
- **Firestore/document database first:** not selected; core relationships and reporting are relational, while PostgreSQL supports indexed search and transactions.

## Consequences

- The transition temporarily operates source plus read model and needs reconciliation.
- Platform/security/backup/cost ownership is required.
- Current UI and projection contracts need not change.
- Apps Script can remain an integration/admin tool after runtime data moves.

## Acceptance

- selected domain passes representative volume and 50-concurrent-administrator load tests.
- required fields reconcile 100% or have documented accepted exceptions.
- feature-flag rollback is tested and non-destructive.
- RPO, RTO, backup restore, privacy, authorization, and operational ownership are approved.
- no ambiguous dual-write ownership at cutover.

