# Design: CommitOrchestrator projection unification

## Context

`src/core/step/commit-orchestrator.ts` contains `CommitOrchestrator`, the single-writer for sequential and parallel round step commits. The parallel round path (`commitRound`) inlines duplicates of the sequential projection logic from `commitSuccess` / `commitSkipped`, annotated with "mirrors commit\*" / "matches commit\*" comments at eight locations.

The projection logic falls into two categories:
1. **In-memory projection**: `pushStepResult` (the success/skip field mapping) — pure state fold, no I/O. The `{step}-verdict` / `{step}-skipped` history entries are produced by shared pure builders and applied by each path via its own write (durable `store.appendHistory` for sequential, in-memory `appendHistoryEntry` for round).
2. **Post-persist effects**: usage `appendInvocation` + lineage `appendLineage` + `verdict:parsed` emit — best-effort async I/O, called after `store.persist`.

Structural differences that must be preserved:
- Sequential: `store.appendHistory({step}-verdict)` then `store.persist` (after branch/pullRequest reflection) per success; `store.appendHistory({step}-skipped)` then `store.persist` per skip — identical to the pre-refactor call pattern.
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

`projectSuccess` and `projectSkip` are module-level, non-exported functions in `commit-orchestrator.ts`. They apply only `pushStepResult` (the success/skip field mapping) and return a new `JobState` — no `store` calls, no `await`, no `this`. The shared history entries are produced by the pure builders `verdictHistoryEntry` / `skipHistoryEntry` (also module-level, non-exported), applied by each caller.

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

### D4: Keep `store.appendHistory` in the sequential path; share the history entry via a pure builder

The sequential `commitSuccess` / `commitSkipped` keep using `store.appendHistory` to durably record the `{step}-verdict` / `{step}-skipped` entry, preserving the exact pre-refactor store-call pattern (`store.appendHistory` then `store.persist`; persist count unchanged). Sharing is achieved by extracting the *entry content* into pure builders (`verdictHistoryEntry` / `skipHistoryEntry`) used by both the sequential `store.appendHistory` call and the round in-memory `appendHistoryEntry` fold — so `pushStepResult` (projector) and the history-entry content (builder) are both shared without altering persist semantics.

Usage `appendInvocation` moves from before the final `store.persist` to after it (inside `applySuccessPostPersistEffects`). Since usage is explicitly best-effort (failure swallowed), this reordering has no observable effect.

**Rationale**: keeping `store.appendHistory` makes the sequential observable behavior byte-identical to the pre-refactor path — no persist-count change, no existing test-expectation changes — while the full projection (field mapping + history entry + post-persist effects) is still shared.

**Alternatives considered**:
- Fold the history into the projector and replace `store.appendHistory` with `appendHistoryEntry` + `store.persist` — rejected: changes the sequential persist-call pattern (surfaced as a persist-count change in existing tests) for no behavioral benefit.

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

[Risk] History-entry content duplicated between the sequential `store.appendHistory` call and the round `appendHistoryEntry` fold.
→ Mitigation: the entry content is produced by a single shared builder (`verdictHistoryEntry` / `skipHistoryEntry`); only the write mechanism (durable vs in-memory) differs per path — the intended structural difference between sequential and round.

[Risk] Usage `appendInvocation` reordered from before final persist to after in `commitSuccess`.
→ Mitigation: usage is already wrapped in `try { ... } catch {}` (best-effort). The ordering within the "post-first-persist" window has no observable effect.

[Risk] New import of `appendHistoryEntry` in `commit-orchestrator.ts`.
→ Mitigation: `state/schema.ts` is a shared-kernel module; the import is valid in domain (core/) code. No layer boundary violation.

[Risk] Structural gate tests use grep on file content — sensitive to projector rename.
→ Mitigation: if the projectors are renamed, the liveness tests (checks 3/4) will fail, prompting a test update. This is the desired ratchet behavior.

## Open Questions

None. The request fully specifies the design constraints and the preserved invariants.
