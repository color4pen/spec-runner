# Design: CommitOrchestrator projection unification

## Context

`src/core/step/commit-orchestrator.ts` contains `CommitOrchestrator`, the single-writer for sequential and parallel round step commits. The parallel round path (`commitRound`) inlines duplicates of the sequential projection logic from `commitSuccess` / `commitSkipped`, annotated with "mirrors commit\*" / "matches commit\*" comments at eight locations.

The projection logic falls into two categories:
1. **In-memory projection**: `pushStepResult` + history `appendHistoryEntry` — pure state fold, no I/O.
2. **Post-persist effects**: usage `appendInvocation` + lineage `appendLineage` + `verdict:parsed` emit — best-effort async I/O, called after `store.persist`.

Structural differences that must be preserved:
- Sequential: two `store.persist` calls per success (one after history, one after branch/pullRequest reflection); one per skip.
- Round: single `store.persist` for all members; post-persist effects batched per member after the one persist.
- Round only: `{step}-started` history per member (sequential covered by `begin()`).
- Round halt: `recordFailedStepResult` only — no `store.fail` / `transitionJob`.

`appendHistoryEntry` is already a pure function exported from `src/state/schema.ts` (via `schema/operations.ts`). `pushStepResult` is also pure (from `src/state/helpers.ts`). Both are usable in a pure projector without new dependencies.

## Goals / Non-Goals

**Goals**:
- Extract success and skip in-memory projections as pure module-level functions shared by sequential and round paths.
- Extract post-persist effects (usage + lineage + emit) as a shared private class method.
- Eliminate all "mirrors commit\*" / "matches commit\*" duplication markers.
- Add structural gate tests that prevent re-introduction of the duplication.

**Non-Goals**:
- Changing persist count or timing (sequential inline vs. round batch is preserved).
- Changing halt lifecycle (failed / awaiting-resume transition ownership stays in `commitHalt`).
- Changing coordinator patch contents (`reviewerStatuses` / `error` / `updatedAt`).
- Modifying `architecture/` files.
- Adding new exported symbols beyond what the test infrastructure requires.

## Decisions

### D1: Module-level pure functions for projectors (not class methods)

`projectSuccess` and `projectSkip` are module-level, non-exported functions in `commit-orchestrator.ts`. They take `(state, step, result/skipReason, findingsPath, now, startedAt)` as plain data and return a new `JobState` — no `store` calls, no `await`, no `this`.

**Rationale**: pure functions are verifiable without mocking; same-file placement avoids creating a new module for a refactoring-only change.

**Alternatives considered**:
- Private class methods — rejected: `this` access undermines purity reasoning even if not used.
- Separate file `commit-projectors.ts` — rejected: adds a new dependency edge for same-file callers with no benefit.

### D2: `{step}-started` history is added outside projectors (round-only composition)

The round fold adds `appendHistoryEntry` for `{step}-started` immediately before calling `projectSuccess` / `projectSkip`. The projectors do not include `{step}-started`. Sequential paths get it from `begin()`.

**Rationale**: the projector contract is "success/skip fold only". Including a round-specific entry would require a boolean flag parameter, breaking the single-responsibility of the projector and making the sequential call site pass `false`.

**Alternatives considered**:
- `projectSuccess(state, ..., withStarted: boolean)` — rejected: conditional behavior in a pure function adds accidental complexity.
- Separate `projectSuccessRound` — rejected: duplication defeats the goal.

### D3: `applySuccessPostPersistEffects` as a private class method

Usage (`appendInvocation`), lineage (`appendLineage`), and `verdict:parsed` emit for a single success entry are extracted into `private async applySuccessPostPersistEffects(store, state, step, result, deps)`. Called after the final `store.persist` in `commitSuccess`, and after the single `store.persist` in `commitRound`'s post-persist loop.

For skipped members, only `verdict:parsed` emit is needed — kept inline (one line, not worth a helper).

**Rationale**: the three operations always compose together for a success entry. Extracting as a class method gives natural access to `this.events` without passing the event bus as a parameter.

**Alternatives considered**:
- Module-level function with `events` parameter — workable but slightly more verbose at each call site.
- Inline in both callers — status quo; this is what we are replacing.

### D4: Replace `store.appendHistory` with `appendHistoryEntry` + `store.persist` in `commitSuccess`

`store.appendHistory(state, entry)` is semantically `appendHistoryEntry(state, entry)` (pure) + `store.persist(updated)`. After refactoring, `commitSuccess` calls `projectSuccess` (which uses `appendHistoryEntry` internally) then `store.persist(s)` — equivalent sequence, same persist count of 2.

Usage `appendInvocation` moves from before the final `store.persist` to after it (inside `applySuccessPostPersistEffects`). Since usage is explicitly best-effort (failure swallowed), this reordering has no observable effect.

**Rationale**: the pure projector uses `appendHistoryEntry` directly; the caller owns persist timing, consistent with the contract.

**Alternatives considered**:
- Keep `store.appendHistory` in `commitSuccess` and call projector only partially — rejected: would leave the projector covering only `pushStepResult`, not the verdict history, making the "shared" claim weaker.

### D5: Structural gate tests in `core-invariants.test.ts`

Four new tests are added to the existing architecture test file (same `grepE` / `parseGrepOutput` infrastructure):
1. "mirrors commit" strings → 0 non-comment matches in `commit-orchestrator.ts`.
2. "matches commit" strings → 0 non-comment matches in `commit-orchestrator.ts`.
3. `projectSuccess(` call count ≥ 2 in `commit-orchestrator.ts` (liveness: both sequential and round).
4. `projectSkip(` call count ≥ 2 in `commit-orchestrator.ts` (liveness: both sequential and round).

**Rationale**: grep-based tests catch source-level regression (e.g., someone re-inlining the logic with new comment text) without requiring runtime behavior tests. Tests 3 and 4 block the "row moved" failure class where a projector call is deleted from one path.

**Alternatives considered**:
- New dedicated test file — unnecessary overhead; the existing file has the exact infrastructure needed.
- Import-based unit tests for the projectors — useful but orthogonal; the gate tests focus on structural coupling, not function correctness.

## Risks / Trade-offs

[Risk] `store.appendHistory` replaced by `appendHistoryEntry` + `store.persist` — different atomicity surface.
→ Mitigation: `store.appendHistory` itself does `appendHistoryEntry` + `persist` with no additional transaction semantics. The refactored two-operation sequence is identical. No new failure modes introduced.

[Risk] Usage `appendInvocation` reordered from before final persist to after in `commitSuccess`.
→ Mitigation: usage is already wrapped in `try { ... } catch {}` (best-effort). The ordering within the "post-first-persist" window has no observable effect.

[Risk] New import of `appendHistoryEntry` in `commit-orchestrator.ts`.
→ Mitigation: `state/schema.ts` is a shared-kernel module; the import is valid in domain (core/) code. No layer boundary violation.

[Risk] Structural gate tests use grep on file content — sensitive to projector rename.
→ Mitigation: if the projectors are renamed, the liveness tests (checks 3/4) will fail, prompting a test update. This is the desired ratchet behavior.

## Open Questions

None. The request fully specifies the design constraints and the preserved invariants.
