# Design: lineage-output-attribution

## Context

Each step attempt, on completion, records a `lineage` event in `events.jsonl` that lists the files the attempt read (inputs) and wrote (outputs), with content hashes. This lineage serves as an audit trail and will be used by the upcoming revision-binding mechanism.

**Root cause**: In `CommitOrchestrator`, lineage is recorded inside `applySuccessPostPersistEffects`, which receives the **post-`projectSuccess`** state `s`. `projectSuccess` calls `pushStepResult`, which appends a new `StepRun` to `state.steps[step.name]`. When a step's `writes()` method calls `nextIteration(state, stepName)`, the result is `state.steps[stepName].length + 1`. Because the new `StepRun` is already appended at evaluation time, the length is one too high, returning the *next* iteration's path rather than the current one.

**Evidence** (`archive/2026-07-20-packaged-smoke-contract/events.jsonl`):
- Line 114: `step-attempt` for `spec-review`, `findingsPath: spec-review-result-002.md`
- Line 115: `lineage` for `spec-review`, `outputs: [{path: spec-review-result-003.md, hash: null}]`

The file `spec-review-result-002.md` exists; `spec-review-result-003.md` does not. The wrong path causes the hash to also be null (no file to hash). The fix to the path automatically fixes the hash for the local runtime.

**Affected steps** (all use `nextIteration` in `writes()`):
- `spec-review`, `code-review`, `conformance`, `request-review`, `custom-reviewer`, `regression-gate`

**Parallel round path**: `commitRound` evaluates each member's `writes()` against the fully-folded final state (all members' `StepRun`s already appended), producing the same off-by-N defect. The fix applies to this path too.

## Goals / Non-Goals

**Goals**:
- Correct the `writes()` evaluation timing in both sequential (`commitSuccess`) and parallel round (`commitRound`) paths so that `lineage.outputs` paths match the files actually generated.
- Achieve non-null hashes for outputs that exist on disk (local runtime).

**Non-Goals**:
- Changing `writes()` / `reads()` method signatures (no argument additions).
- Changing the `nextIteration` calculation logic.
- Fixing managed-runtime hash (no filesystem available; `hash: null` remains correct there).
- Retroactively correcting existing `events.jsonl` files.
- Adding lineage hash verification / revision binding (subsequent request).

## Decisions

### D1: Evaluate `writes()` / `reads()` before `projectSuccess`, carry the paths forward

`commitSuccess` saves `preWriteIo = step.writes(state, deps)` and `preReadIo = step.reads ? step.reads(state, deps) : []` before calling `projectSuccess`. These pre-evaluated `IoRef[]` values are passed into `applySuccessPostPersistEffects` as additional parameters, replacing the in-method re-evaluation.

**Rationale**: The simplest change that isolates the timing fix to a single caller pair. `applySuccessPostPersistEffects` no longer needs `state` to derive I/O paths; it only needs `state` for the usage path. Evaluation point moves from *after* state update to *before*.

**Alternative considered — pass pre-push state as extra param**: Would require threading the original `state` alongside the updated `s`, increasing cognitive load and risk of confusion about which state is which. Rejected.

**Alternative considered — modify `writes()` to accept explicit iteration**: Would change all affected step signatures. Rejected (per architect decision in request).

### D2: Same fix in `commitRound` — capture pre-push `IoRef[]` per member before folding

In `commitRound`, for each member whose `result.kind === "success"`, evaluate `writes()` / `reads()` against the accumulating `state` **before** calling `projectSuccess` for that member. Carry the result in the `successEntries` accumulator alongside `{ step, result }`.

**Rationale**: The parallel path has the same defect (state is fully folded before any `writes()` evaluation). The same pre-evaluation pattern fixes it. The fix is local to `commitRound` with no external API change.

### D3: `applySuccessPostPersistEffects` signature — add `preWriteIo: IoRef[]` and `preReadIo: IoRef[]`

The private method is extended from:
```
applySuccessPostPersistEffects(store, state, step, result, deps)
```
to:
```
applySuccessPostPersistEffects(store, state, step, result, deps, preWriteIo: IoRef[], preReadIo: IoRef[])
```

The method body replaces `step.writes(state, deps)` with `preWriteIo` and the `step.reads?.(state, deps)` call with `preReadIo`. The outer guard `if (deps.runtimeStrategy && step.writes && deps.cwd)` becomes `if (deps.runtimeStrategy && preWriteIo.length > 0 && deps.cwd)`.

**Rationale**: Private method; no external callers. Making both parameters required (not optional) ensures callers can't accidentally omit them. The guard condition adapts naturally: if `writes` is absent, the caller passes `[]`, and the guard short-circuits on `preWriteIo.length === 0`.

### D4: Import `IoRef` in `commit-orchestrator.ts`

`IoRef` is already defined in `src/core/port/step-types.ts` and exported via `types.ts`. Add the import to `commit-orchestrator.ts`.

## Risks / Trade-offs

**[Risk] Private API change breaks a test that mocks `applySuccessPostPersistEffects`**
→ Mitigation: the method is private; it is not directly mockable by external tests. Existing test mocks target `store.appendLineage`. No breakage expected; verified by `typecheck && test`.

**[Risk] `commitRound` fold order matters — member A's `writes()` must be evaluated before member A's state is pushed**
→ Mitigation: D2 evaluates writes/reads immediately before calling `projectSuccess` for that member, within the same loop iteration. The accumulating `state` at that moment has only prior members' results, not the current member's.

## Open Questions

None — root cause, scope, and fix approach are fully determined by the architect evaluation in the request.
