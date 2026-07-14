# Tasks: CommitOrchestrator projection unification

## T-01: Extract `projectSuccess` pure projector

- [ ] Add `import { appendHistoryEntry } from "../../state/schema.js"` to `commit-orchestrator.ts` (alongside the existing `pushStepResult` import)
- [ ] Add module-level (non-exported) function `projectSuccess(state: JobState, step: Step, result: StepExecutionResult & { kind: "success" }, findingsPath: string | null, now: string): JobState` — body: `pushStepResult(...)` then `appendHistoryEntry(...)` for `{step.name}-verdict`, return new state
- [ ] Verify the function is synchronous, contains no `await`, no `store.` references, and no `this`

**Acceptance Criteria**:
- `projectSuccess` is a module-level function (not a class method) in `commit-orchestrator.ts`
- No async keywords, no store calls, no side effects inside `projectSuccess`
- `bun run typecheck` passes

## T-02: Extract `projectSkip` pure projector

- [ ] Add module-level (non-exported) function `projectSkip(state: JobState, step: AgentStep, skipReason: string, startedAt: string, now: string): JobState` — body: `pushStepResult(...)` with `verdict: "skipped" as Verdict` and `startedAt`/`completedAt: now`, then `appendHistoryEntry(...)` for `{step.name}-skipped` warning, return new state
- [ ] Verify the function is synchronous, contains no `await`, no `store.` references, and no `this`

**Acceptance Criteria**:
- `projectSkip` is a module-level function in `commit-orchestrator.ts`
- No async keywords, no store calls, no side effects inside `projectSkip`
- `bun run typecheck` passes

## T-03: Extract `applySuccessPostPersistEffects` private class method

- [ ] Add `private async applySuccessPostPersistEffects(store: JobStateStore, state: JobState, step: Step, result: StepExecutionResult & { kind: "success" }, deps: PipelineDeps): Promise<void>` to `CommitOrchestrator`
- [ ] Move usage block into the method: `if (modelUsage && deps.cwd && deps.slug) { try { await appendInvocation(...) } catch {} }`
- [ ] Move lineage block into the method: `if (deps.runtimeStrategy && step.writes && deps.cwd) { try { ... await store.appendLineage(lineageRecord) } catch {} }`
- [ ] Move `this.events.emit("verdict:parsed", {...})` for success outcomes into the method (at the end, after lineage)

**Acceptance Criteria**:
- `applySuccessPostPersistEffects` is a private method on `CommitOrchestrator`
- Contains all three effect blocks: usage, lineage, and emit — in that order
- Each of usage and lineage is individually wrapped in its own `try { ... } catch {}` (best-effort)
- `bun run typecheck` passes

## T-04: Refactor `commitSuccess` to use shared projector and helper

- [ ] Compute `findingsPath` and `now` before the projection call (as they currently are)
- [ ] Replace `pushStepResult(...)` + `await store.appendHistory(s, {...})` with `projectSuccess(state, step, result, findingsPath, now)` + `await store.persist(s)` (persist #1)
- [ ] Retain branch/pullRequest reflection (`agentBranch`, `setsBranch`, `completion.pullRequest`) unchanged after persist #1
- [ ] Replace inline usage / lineage / emit with `await this.applySuccessPostPersistEffects(store, s, step, result, deps)` — placed after the final `store.persist(s)` (persist #2)
- [ ] Remove the "Mirrors finalizeStep" comment from the method docstring; replace with a description of the actual call sequence (projectSuccess → persist #1 → branch/pullRequest → persist #2 → applySuccessPostPersistEffects)

**Acceptance Criteria**:
- `commitSuccess` calls `projectSuccess(` and `this.applySuccessPostPersistEffects(`
- `store.appendHistory` is not called in `commitSuccess`
- Exactly two `store.persist` calls remain in `commitSuccess`
- No "mirrors" or "matches" comment strings in `commitSuccess`
- `bun run typecheck` passes

## T-05: Refactor `commitSkipped` to use shared projector

- [ ] Replace inline `pushStepResult(...)` + `await store.appendHistory(s, {...})` with `projectSkip(state, step, skipReason, now, now)` (both `startedAt` and `completedAt` are `now` for sequential skip)
- [ ] Retain `this.events.emit("verdict:parsed", {...})` for skipped verdict **before** `store.persist(s)` (preserves sequential emit-before-persist order)
- [ ] Remove the "Mirrors finalizeSkippedStep" comment from the method docstring; replace with a description of the actual call sequence (projectSkip → emit → persist)

**Acceptance Criteria**:
- `commitSkipped` calls `projectSkip(`
- `store.appendHistory` is not called in `commitSkipped`
- `events.emit("verdict:parsed", ...)` is called before `store.persist(s)` in `commitSkipped`
- No "mirrors" or "matches" comment strings in `commitSkipped`
- `bun run typecheck` passes

## T-06: Refactor `commitRound` member fold to use shared projectors

- [ ] In the success arm (`result.kind === "success"`):
  - Remove inline `pushStepResult(...)` and in-memory history spread for `{step}-started` and `{step}-verdict`
  - Add `state = appendHistoryEntry(state, { ts: startedAt, step: \`${step.name}-started\`, status: "started", message: \`Starting ${step.name} step\` })` (round-only, before projector)
  - Add `state = projectSuccess(state, step, result, findingsPath, now)` (shared projector; compute `findingsPath` from `step.resultFilePath(base, deps)` as before)
- [ ] In the skipped arm (`result.kind === "skipped"`):
  - Remove inline `pushStepResult(...)` and in-memory history spreads for `{step}-started` and `{step}-skipped`
  - Add `state = appendHistoryEntry(state, { ts: startedAt, step: \`${step.name}-started\`, status: "started", message: \`Starting ${step.name} step\` })` (round-only, before projector)
  - Add `state = projectSkip(state, step, result.skipReason, startedAt, now)` (shared projector)
- [ ] In the halt arm (`result.kind === "halt"`): leave `recordFailedStepResult` + in-memory `appendHistoryEntry` for `halt.history` unchanged
- [ ] Remove all "mirrors commit\*" and "matches commit\*" inline comments from the fold block

**Acceptance Criteria**:
- `commitRound` fold block calls `projectSuccess(` and `projectSkip(`
- No "mirrors commit" or "matches commit" strings in the fold block
- History order in round for success/skip: `{step}-started` entry appears before `{step}-verdict` / `{step}-skipped` in the resulting state (maintained by append-before-projector ordering)
- `bun run typecheck` passes

## T-07: Refactor `commitRound` post-persist loop to use shared helper

- [ ] In the post-persist success loop, replace the inline usage + lineage + emit block with `await this.applySuccessPostPersistEffects(store, state, step, result, deps)` per success entry
- [ ] Retain the skipped `verdict:parsed` emit loop (`for (const { step } of skippedEntries)`) unchanged — skipped entries have no usage or lineage
- [ ] Remove all "mirrors commit\*" and "matches commit\*" inline comments from the post-persist section
- [ ] Remove the `successEntries` / `skippedEntries` tracking arrays if they are still used only for the post-persist loop — retain them only if needed; update as appropriate given the helper now handles the success post-persist work

**Acceptance Criteria**:
- `commitRound` post-persist section calls `this.applySuccessPostPersistEffects(`
- Skipped `verdict:parsed` emit is still present in `commitRound`
- No "mirrors commit" or "matches commit" strings in the post-persist section
- The single `store.persist(state)` call in `commitRound` is unchanged (still exactly once)
- `bun run typecheck` passes

## T-08: Add structure gate tests to `core-invariants.test.ts`

- [ ] Add a new `describe("commit-projection-unify structure gates", ...)` block at the end of `tests/unit/architecture/core-invariants.test.ts`
- [ ] Test 1: grep `src/core/step/commit-orchestrator.ts` for `"mirrors commit"` → `nonComment` matches length equals 0
- [ ] Test 2: grep `src/core/step/commit-orchestrator.ts` for `"matches commit"` → `nonComment` matches length equals 0
- [ ] Test 3 (liveness): grep `src/core/step/commit-orchestrator.ts` for `"projectSuccess\\("` → non-comment matches count ≥ 2 (appears in both `commitSuccess` and `commitRound` call sites)
- [ ] Test 4 (liveness): grep `src/core/step/commit-orchestrator.ts` for `"projectSkip\\("` → non-comment matches count ≥ 2 (appears in both `commitSkipped` and `commitRound` call sites)
- [ ] Use the existing `grepE`, `parseGrepOutput`, and `isCommentLine` helpers already in scope in that file (no new imports needed)
- [ ] Verify all four tests are green with the refactored code from T-01 through T-07

**Acceptance Criteria**:
- New `describe("commit-projection-unify structure gates", ...)` block exists in `core-invariants.test.ts`
- All 4 new tests pass
- All pre-existing B-13 and B-14 tests remain green (no regressions)
- `bun run test` exits 0

## T-09: Full verification

- [ ] Run `bun run typecheck` — exits 0
- [ ] Run `bun run test` — all tests green; no existing test expectations modified
- [ ] Confirm `grep -c "mirrors commit\|matches commit" src/core/step/commit-orchestrator.ts` outputs `0`
- [ ] Confirm `grep -c "projectSuccess(" src/core/step/commit-orchestrator.ts` outputs ≥ 2
- [ ] Confirm `grep -c "projectSkip(" src/core/step/commit-orchestrator.ts` outputs ≥ 2

**Acceptance Criteria**:
- `bun run typecheck && bun run test` exits 0 with no test modifications
- Zero "mirrors commit" / "matches commit" strings in `commit-orchestrator.ts`
- `projectSuccess(` and `projectSkip(` each appear at ≥ 2 call sites in `commit-orchestrator.ts`
