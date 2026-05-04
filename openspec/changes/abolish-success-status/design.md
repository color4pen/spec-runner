# Design: Abolish `success` JobStatus

## Design Decisions

### Decision 1: Complete abolition vs. alias preservation

**Adopted**: Complete abolition — remove `"success"` from the `JobStatus` union type entirely.

**Rejected Alternative**: Keep `"success"` as a deprecated alias that maps internally to `"awaiting-merge"`.

**Rationale**:
- TypeScript's discriminated union analysis will catch all unhandled pattern-match sites at compile time, forcing a comprehensive audit.
- An alias would permit legacy code to continue using the ambiguous term, deferring the debt rather than resolving it.
- The migration layer in `store.ts` already handles backward compatibility for persisted state; runtime code does not need dual handling.

**Trade-offs**:
- ✅ Compile-time exhaustiveness checking forces thorough migration.
- ✅ Prevents future confusion about which term to use.
- ❌ Requires updating all code sites (but this is a one-time cost paid at refactor time).

---

### Decision 2: `failed` / `terminated` jobs are not finish-able

**Adopted**: `assertJobFinishable` rejects `status === "failed"` and `status === "terminated"` with a distinct error hint suggesting the `cancel` command.

**Rejected Alternative**: Allow finish to archive failed jobs, treating "archive" as a generic disposal mechanism.

**Rationale**:
- Finish semantics are "pipeline succeeded; merge the PR; clean up artifacts." Applying finish to a failed job would destroy forensic evidence (error state, partial outputs).
- The `cancel` command is the appropriate workflow for disposing of failed jobs (not yet implemented, but design intent is clear).
- Clear separation of concerns: `finish` = happy path; `cancel` = cleanup for failures.

**Trade-offs**:
- ✅ Preserves failure state for debugging.
- ✅ Enforces clear lifecycle semantics.
- ❌ Requires implementing `cancel` for full workflow coverage (tracked separately; out of scope for this change).

---

### Decision 3: `handleExhausted` writes `status: "failed"`

**Adopted**: When retries are exhausted, `pipeline.ts:303` sets `status: "failed"` in addition to the existing `error.code` write.

**Rejected Alternative**: Leave status at whatever it was previously (e.g., `"running"` or residual `"success"`).

**Rationale**:
- The error.code `*_RETRIES_EXHAUSTED` is an implementation detail for diagnostic messages; status is the primary lifecycle signal for CLI and UI consumers.
- Leaving status ambiguous (e.g., `"running"` for an escalated job) creates UX confusion and breaks the invariant that running jobs have active sessions.
- Terminal failures should transition to a terminal status to enable correct downstream handling (e.g., disallowing finish, enabling future cancel).

**Trade-offs**:
- ✅ Status field accurately reflects job lifecycle.
- ✅ Enables `assertJobFinishable` guard to reject failed jobs.
- ❌ None identified (this is strictly an improvement).

---

### Decision 4: Backward compatibility via 1-time read migration

**Adopted**: `loadJobState` in `src/state/store.ts` detects legacy `status: "success"` and remaps it to `"awaiting-merge"` on read, mutating the parsed object so subsequent writes persist the new value.

**Rejected Alternative 1**: Version the state file schema (e.g., `version: 2`) and require a migration script.

**Rejected Alternative 2**: Hard-break backward compatibility; require users to purge old state files.

**Rationale**:
- On-read migration is transparent to users; no manual intervention required.
- State files are transient (jobs complete within hours/days); a migration layer with limited TTL (1-2 releases) is acceptable technical debt.
- Version bumps would complicate the codebase for minimal gain; state schema changes have so far been additive (optional fields with defaults).

**Trade-offs**:
- ✅ Zero-downtime migration.
- ✅ No user action required.
- ❌ Adds temporary complexity in `loadJobState` (plan to remove after 1-2 releases).

**Migration plan**:
- Implement in `src/state/schema.ts:validateJobState` alongside existing `SESSION_TIMEOUT` → `SESSION_TERMINATED` migration (lines 268-276).
- Add a TODO comment with removal target (e.g., "Remove after 2026-06 release").

---

### Decision 5: Step-level status writes are removed, not replaced

**Adopted**: Delete `state = await store.update(state, { status: "success" })` at `executor.ts:195` and `:733` without replacement.

**Rejected Alternative**: Replace with a neutral status or a new intermediate status (e.g., `"step-complete"`).

**Rationale**:
- Job-level status is for lifecycle tracking; step-level progress is recorded in `state.steps[stepName][]`.
- Overwriting job status at every step completion conflates two concerns and was the root cause of the bug.
- The executor already persists step outcomes via `pushStepResult`; a redundant job-level status write serves no purpose and introduces risk.

**Trade-offs**:
- ✅ Eliminates ambiguity.
- ✅ Prevents future regression.
- ❌ None (the writes were redundant).

---

## Open Questions

_(None at this stage. All design choices are deterministic and ready for implementation.)_

---

## Alternatives Considered (Summary)

| Alternative | Reason for Rejection |
|-------------|---------------------|
| Keep `success` as a deprecated alias | Defers the problem; prevents compile-time safety |
| Allow finish to archive failed jobs | Loses forensic data; violates semantic separation |
| Leave status unchanged on handleExhausted | Creates UX confusion; breaks lifecycle invariants |
| Require schema version bump + migration script | Over-engineered for a transient state file format |
| Add `"step-complete"` intermediate status | Conflates concerns; step progress tracked via `state.steps` |

---

## Implementation Notes for Implementer

1. **Order of changes**: Update schema first, then fix compiler errors in sequence (executor → CLI → finish → pipeline → tests). TypeScript will guide the audit.

2. **Test migration**: Focus on `tests/finish-job-state.test.ts` (TC-029, TC-031) and any tests that assert on `status === "success"`. Replace with `"awaiting-merge"` or appropriate terminal status.

3. **Backward compat testing**: Add a test case that writes a legacy state file with `status: "success"`, loads it, and asserts that it reads as `"awaiting-merge"`.

4. **ADR template**: Follow existing ADR structure in `openspec-workflow/adr/` (status / context / decision / consequences). Date format: `ADR-YYYYMMDD-<slug>.md`.

5. **Grep audit**: After implementation, run `grep -r '"success"' src/` to catch any remaining string literals (e.g., in error messages or comments). Update as needed for clarity, but these are not blockers if they don't affect runtime behavior.
