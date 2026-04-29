# Code Fixer Decisions

## Date
2026-04-29

## Iteration
code-fixer iteration 1 — addressing review-feedback-001.md CRITICAL/HIGH findings

## Fix History

### Finding #1 (HIGH) — Delete runProposeStepLegacy
**File**: src/core/pipeline.ts
**Action**: Deleted `runProposeStepLegacy` (~370 LOC). Rewrote `runProposePipeline` to use the `Pipeline` class with a propose-only transition table (`propose → success → end`). `runPipeline` updated to use `Pipeline` class with `STANDARD_TRANSITIONS`.
**Tests affected**: tests/pipeline.test.ts — migrated from raw SDK mock to `SessionClient` port mock.

### Finding #2 (HIGH) — Two sibling pipeline.ts files
**File**: src/core/pipeline.ts (kept as thin wrapper), src/core/pipeline/pipeline.ts (canonical)
**Action**: `src/core/pipeline.ts` reduced to ~93 LOC (thin wrapper + `runProposePipeline`). The legacy 454 LOC was split: `runProposeStepLegacy` deleted, `runPipeline` now delegates entirely to `Pipeline` class. The sibling file violation is resolved by eliminating all duplicate logic.

### Finding #3 (HIGH) — Pipeline.runInternal ignores STANDARD_TRANSITIONS
**File**: src/core/pipeline/pipeline.ts
**Action**: Rewrote `runInternal` as a table-driven state machine. At each step completion, the engine looks up `(currentStep, outcome) → nextStep` from `this.transitions`. Removed `runSpecReviewLoop`, `runSpecFixerPhase`, `runSpecReviewStep`, `appendLoopHistory` helpers that hardcoded transition logic. `STANDARD_TRANSITIONS` now drives all phase transitions.

### Finding #4 (HIGH) — JobState.steps StepResult|StepRun union
**File**: src/state/schema.ts, src/state/helpers.ts
**Action**: Changed `JobState.steps` from `Record<string, StepResult[] | StepRun[]>` to `Record<string, StepRun[]>`. Rewrote `pushStepResult` to produce `StepRun` objects (mapping legacy `StepResult`-shaped input to `StepRun` internally). Updated `normalizeSteps` in `schema.ts` to produce `StepRun[]` from any legacy format. Removed `as StepResult[] | StepRun[]` casts from `pipeline.ts` `handleExhausted`.
**Tests affected**: Updated 6 test files to use `StepRun`-shaped step data (`{ attempt, sessionId, outcome, startedAt, endedAt }` instead of `{ iteration, session, verdict, ... }`).

### Finding #5 (HIGH) — Core imports src/sdk/sessions.ts (transitive SDK dep)
**File**: src/core/step/spec-review.ts, src/core/session.ts, src/core/completion.ts
**Action**:
- `src/core/step/spec-review.ts`: Removed `createSession`, `sendEvents` (from sdk/sessions.js) and `pollUntilComplete` (from core/completion.js) imports. `runSpecReviewStep` now calls `deps.client.createSession(...)`, `deps.client.sendUserMessage(...)`, `deps.client.pollUntilComplete(...)` via the SessionClient port.
- `src/core/session.ts`: Rewrote `startProposeSession` to take `SessionClient` (port type) instead of `SdkClient` (structural duck-type). Delegates all SSE logic to `client.streamEvents(...)`. Removed all imports from `../sdk/sessions.js` and `./completion.js`.
- `src/core/completion.ts`: Deleted (dead code — nothing imported it after the above changes).
- Result: `src/core/` has 0 imports from `src/sdk/sessions.ts`.

### Finding #6 (HIGH) — Three as any casts in core
**File**: src/core/pipeline.ts:93, src/core/session.ts:88, src/core/step/spec-review.ts:162
**Action**: All three casts eliminated as a side effect of Finding #5 fixes. `src/core/pipeline.ts` no longer has the legacy `runProposeStepLegacy` (cast at line 93 gone). `src/core/session.ts` no longer casts to any (uses SessionClient port directly). `src/core/step/spec-review.ts` no longer casts (uses SessionClient port methods).
**Result**: `grep -rn "as any" src/core/` → 0 hits.

---

## code-fixer iteration 2 — addressing review-feedback-002.md HIGH findings

### Finding #1 (HIGH) — JobStateStore not the canonical persistence path

**Files**: src/store/job-state-store.ts, src/core/step/executor.ts, src/core/pipeline/pipeline.ts, src/state/store.ts

**Action**:
- Added `appendHistory(state, entry)`, `update(state, patch)`, `fail(state, errorInfo, step?)` methods to `JobStateStore`. All accept `JobState` (broader type than `NormalizedJobState`) so callers don't need casts.
- Migrated `executor.ts`: replaced all 63 calls to `appendHistory`, `updateJobState`, `failJobState`, `persistJobState` free functions with `store.appendHistory`, `store.update`, `store.fail`, `store.persist`. Store is constructed inside `runProposeStyleStep` and `runPollingStyleStep` via `getStore(jobState.jobId)` (cached per jobId). Private helpers updated to accept `store` parameter.
- Migrated `pipeline/pipeline.ts`: replaced 4 free function calls with `JobStateStore` instances.
- Deleted `appendHistory` and `failJobState` free functions from `src/state/store.ts`. Kept `updateJobState` as a thin shim (still used by tests in `spec-review-step.test.ts` setup). Kept `persistJobState` as a thin shim for `createJobState` internal use.
- Production code now imports only `createJobState` and `listJobStates` from `state/store.ts`.

**Decision — no `PipelineDeps` injection**: Instead of adding `store` to `PipelineDeps` (which would require updating all test dep objects), the store is constructed inside the executor from `jobState.jobId`. This minimizes test disruption while achieving the same canonical-path goal.

### Finding #2 (HIGH) — runSpecReviewStep legacy function (245 LOC, zero production callers)

**Files**: src/core/step/spec-review.ts, tests/core/steps/spec-review.test.ts

**Action**:
- Deleted `runSpecReviewStep` function from `src/core/step/spec-review.ts` (245 LOC removed).
- Also removed unused imports `appendHistory`, `updateJobState`, `failJobState`, `persistJobState`, `pushStepResult`, `getAgentId` that were only used by the deleted function.
- Migrated `tests/core/steps/spec-review.test.ts` (TC-044/TC-045/TC-046) from `runSpecReviewStep` to `StepExecutor.execute(SpecReviewStep, ...)`. Tests now use a persistent job state (written to tempDir) via `makePersistedJobState()` to satisfy the store's file I/O. TC-046's `iteration` assertion changed to `attempt` (StepRun field), which `toLegacyStepResult` maps correctly.
- `tests/spec-review-step.test.ts` already used `runSpecReviewViaExecutor` (canonical path) — no changes needed there.
- Removed unused `appendHistory` import from `tests/state-store.test.ts`.

## code-fixer iter 2 — Verification Results

- `bunx tsc --noEmit`: PASS (0 errors)
- `bun run test` (vitest): 214 pass, 0 fail (same 214/214 as iter 2 review baseline)
- `grep runSpecReviewStep src/`: 0 hits
- `grep -rn "from.*state/store" src/core/ src/cli/`: `createJobState` only in cli/run.ts, `listJobStates` only in cli/ps.ts
- Module boundary: 0 SDK imports in core/store, 0 adapter imports in core/store
- Module boundary greps:
  - `grep -rn "from.*@anthropic-ai/sdk" src/core/`: 0 hits
  - `grep -rn "from.*sdk/" src/core/`: 0 hits
  - `grep -rn "from.*adapter/" src/core/`: 0 hits

## Files Modified

- src/core/pipeline.ts
- src/core/pipeline/pipeline.ts
- src/core/pipeline/types.ts
- src/core/session.ts (rewritten — now uses SessionClient port)
- src/core/completion.ts (deleted)
- src/core/step/spec-review.ts (runSpecReviewStep migrated to SessionClient port)
- src/state/schema.ts (JobState.steps → Record<string, StepRun[]>)
- src/state/helpers.ts (pushStepResult now writes StepRun)
- tests/pipeline.test.ts
- tests/completion.test.ts (TC-034 updated)
- tests/custom-tools.test.ts (TC-018/TC-025 updated to point to sse-stream.ts)
- tests/core/steps/spec-review.test.ts (SessionClient mock)
- tests/core/pipeline/pipeline.test.ts (StepRun shape)
- tests/core/step/step-interface.test.ts (StepRun shape)
- tests/cli-run-verdict.test.ts (StepRun shape)
- tests/cli-stdout-snapshot.test.ts (StepRun shape)
- tests/schema.test.ts (TC-024 updated for StepRun shape)
- tests/spec-review-step.test.ts (SessionClient mock)
