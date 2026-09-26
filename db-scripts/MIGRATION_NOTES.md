# SkilledProz — Database Migration Notes

**Status**: schema is complete, tested, and rehost-safe.
**Last updated**: 2026-09-26
**Audience**: whoever runs the Deep Ocean rehost, plus future devs maintaining
the schema.

---

## Table of Contents

1. [TL;DR](#tldr)
2. [What changed](#what-changed)
3. [Fresh-DB rebuild — exact commands](#fresh-db-rebuild--exact-commands)
4. [Existing-DB incremental update — exact commands](#existing-db-incremental-update--exact-commands)
5. [Controller bugs found + fixes](#controller-bugs-found--fixes)
6. [Seed script bugs found + fixes](#seed-script-bugs-found--fixes)
7. [Acceptance checklist after rehost](#acceptance-checklist-after-rehost)
8. [Rollback plan](#rollback-plan)
9. [File inventory](#file-inventory)
10. [Cross-cutting notes for maintainers](#cross-cutting-notes-for-maintainers)

---

## TL;DR

- **The schema is complete.** Every controller in the codebase reads/writes
  columns that exist.
- **The schema is idempotent.** `_full-schema.sql` can be run repeatedly
  without error.
- **The rehost is safe.** A fresh DB built from `_full-schema.sql` will boot
  the app and serve every endpoint.
- **6 controller bugs** were found during the audit and fixed (see §5).
- **3 seed script bugs** were found and fixed (see §6).
- **Two new tables** were added during the audit: `Dispute` and `WorkerDebt`.

---

## What changed

Everything below was applied during the schema audit. Each item shows **what**,
**why**, and **which file** the change lives in.

### 1. New tables (2)

| Table        | Reason                                                                                                                                                                              | Owning file                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `Dispute`    | Owns the modern dispute model (replaces legacy `Booking.status = 'DISPUTED'`). Referenced by `Refund.disputeId`.                                                                    | `db-scripts/controllers/11-dispute.sql`    |
| `WorkerDebt` | Tracks amounts workers owe the platform (created when a dispute refund cannot be clawed back from available balance). Referenced by `WorkerProfile.debts` and `Refund.workerDebts`. | `db-scripts/controllers/12-workerDebt.sql` |

### 2. New enums (4)

| Enum                | Values                                                               | Reason                                 |
| ------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| `BookingSource`     | `DIRECT`, `JOB_POST`                                                 | `Booking.source` column references it. |
| `DisputeStatus`     | `PENDING_REVIEW`, `RESOLVED_REFUND`, `RESOLVED_RELEASE`, `CANCELLED` | `Dispute.status`.                      |
| `DisputeResolution` | `REFUND`, `RELEASE`                                                  | `Dispute.resolution`.                  |
| `DisputeRaisedBy`   | `HIRER`, `WORKER`                                                    | `Dispute.raisedByRole`.                |

### 3. New enum values (existing enums)

**`AuditAction` — added 15 values:**
