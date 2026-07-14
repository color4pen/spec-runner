# Spec: CommitOrchestrator projection unification

## Requirements

### Requirement: Shared projectors unify success/skip in-memory projection

`projectSuccess` and `projectSkip` SHALL be non-exported, synchronous, module-level functions in `commit-orchestrator.ts`. They SHALL accept job state and step result inputs, perform the in-memory step-result projection using `pushStepResult`, and return the new state — with no store calls, no async operations, and no side effects. The `{step}-verdict` / `{step}-skipped` history entries SHALL be produced by shared non-exported pure builders (`verdictHistoryEntry` / `skipHistoryEntry`) and applied by each caller.

#### Scenario: commitSuccess uses projectSuccess projector

**Given** `commitSuccess` is called with a successful step result
**When** the in-memory state projection runs
**Then** `projectSuccess` applies the step result (`pushStepResult`), and the `{step}-verdict` entry from `verdictHistoryEntry` is durably recorded via `store.appendHistory`

#### Scenario: commitRound uses projectSuccess projector in the member fold

**Given** `commitRound` is called with one or more success member results
**When** the in-memory member fold runs
**Then** for each success member: `appendHistoryEntry` is called first with `{step}-started` (round-only), then `projectSuccess` applies the step result, then the `{step}-verdict` entry from `verdictHistoryEntry` is appended in-memory via `appendHistoryEntry`

#### Scenario: commitSkipped uses projectSkip projector

**Given** `commitSkipped` is called with a skip reason
**When** the in-memory state projection runs
**Then** `projectSkip` applies the skipped step result (`pushStepResult`), and the `{step}-skipped` entry from `skipHistoryEntry` is durably recorded via `store.appendHistory`

#### Scenario: commitRound uses projectSkip projector in the member fold

**Given** `commitRound` is called with one or more skipped member results
**When** the in-memory member fold runs
**Then** for each skipped member: `appendHistoryEntry` is called first with `{step}-started` (round-only), then `projectSkip` applies the skip result, then the `{step}-skipped` entry from `skipHistoryEntry` is appended in-memory via `appendHistoryEntry`

### Requirement: Post-persist effects are shared via a common helper

Usage `appendInvocation`, lineage `appendLineage`, and `verdict:parsed` emit for success steps SHALL be extracted into a single private method `applySuccessPostPersistEffects` on `CommitOrchestrator`. Both `commitSuccess` (after its final `store.persist`) and `commitRound` (in the post-persist loop per success member) SHALL call this method.

#### Scenario: Sequential success uses shared post-persist helper

**Given** `commitSuccess` has applied the success projection and persisted the final state (including branch/pullRequest reflection)
**When** post-persist effects run
**Then** `this.applySuccessPostPersistEffects(...)` is called and handles usage, lineage, and emit in that order

#### Scenario: Round uses shared post-persist helper per success member

**Given** `commitRound` has applied the coordinator patch and persisted the round state exactly once
**When** the post-persist loop runs for success entries
**Then** `this.applySuccessPostPersistEffects(...)` is called for each success member

### Requirement: No duplication markers remain in source

The strings `"mirrors commit"` and `"matches commit"` SHALL NOT appear anywhere in `src/core/step/commit-orchestrator.ts` (as non-comment text).

#### Scenario: Structure gate test — no duplication markers

**Given** the refactoring is complete
**When** `commit-orchestrator.ts` is searched for `"mirrors commit"` and `"matches commit"` (excluding comment lines)
**Then** zero matches are found for each pattern

### Requirement: Projectors are referenced from both sequential and round paths

`projectSuccess` SHALL appear as a call site in both `commitSuccess` and `commitRound`. `projectSkip` SHALL appear as a call site in both `commitSkipped` and `commitRound`. Each projector function SHALL have at least two non-comment call sites in `commit-orchestrator.ts`.

#### Scenario: Structure gate test — liveness

**Given** the refactoring is complete
**When** `commit-orchestrator.ts` is searched for `projectSuccess(` and `projectSkip(`
**Then** each pattern has at least 2 non-comment matches (definition is excluded by the `(` suffix)

### Requirement: Behavioral invariants preserved

The refactoring SHALL NOT change observable behavior of sequential or round commits:
- **Store-call pattern**: sequential success = `store.appendHistory({step}-verdict)` then one `store.persist` (after branch/pullRequest reflection); sequential skip = `store.appendHistory({step}-skipped)` then one `store.persist`; round = one `store.persist`. This is identical to the pre-refactor call pattern (`store.persist` called once per sequential commit).
- **`{step}-started` history**: emitted only for round members, by the round fold calling `appendHistoryEntry` before the projector. Sequential gets it from `begin()`.
- **History order**: `{step}-started` appears before `{step}-verdict` / `{step}-skipped` for round members.
- **Sequential skip emit order**: `verdict:parsed` emitted before `store.persist` in `commitSkipped`.
- **Halt lifecycle**: `store.fail` / `transitionJob` / `attachStateAndRethrow` remain owned by `commitHalt`; round halt calls only `recordFailedStepResult` + in-memory history.

#### Scenario: B-13 architecture test remains green

**Given** no store mutation calls are moved to executor or parallel-review-round
**When** B-13 grep runs on executor and parallel-review-round
**Then** all existing B-13 tests pass without modification

#### Scenario: B-14 architecture test remains green

**Given** `commitHalt` still owns `transitionJob` and `attachStateAndRethrow`
**When** B-14 grep runs on executor
**Then** all existing B-14 tests pass without modification

#### Scenario: Full test suite green

**Given** the refactoring is complete and no test expectations are modified
**When** `bun run typecheck && bun run test` runs
**Then** all tests pass and `typecheck` exits 0
