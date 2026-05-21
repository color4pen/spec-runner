# Design: require-spawn-injection

## Problem

`propagateVerificationResult` has `spawn?: SpawnFn` with a default fallback to the real `spawnCommand`. `VerificationStep.run` calls `propagate` without passing `spawn`, so even in tests the real `git commit` + `git push` run. The pipeline-integration tests mock `runVerification` and `runPrCreate` but miss this second side-effect boundary.

## Decision

### D1: `spawn` required on `propagateVerificationResult`

Remove the `?` and the `?? spawnCommand` fallback. Callers must explicitly provide spawn.

**Rationale**: "leaky default" pattern lets a single caller omission cause real git operations in CI. Making the parameter required turns caller omission into a compile error.

### D2: `CliStepDeps` — CLI-step-specific deps with `spawn`

Introduce `CliStepDeps` in `src/core/step/types.ts`:

```ts
import type { SpawnFn } from "../../util/spawn.js";

export interface CliStepDeps extends StepDeps {
  spawn: SpawnFn;
}
```

Update `CliStep.run` signature:

```ts
run(state: JobState, deps: CliStepDeps): Promise<void>;
```

**Why not `StepContext`**: `StepContext` is shared by all steps including agent steps that never need `spawn`. The request explicitly says don't touch it. `CliStepDeps` narrows the type to only CLI-resident steps.

**Backward compat**: `PrCreateStep.run(state, deps: StepDeps)` remains assignable to the updated `CliStep.run(state, deps: CliStepDeps)` because TypeScript uses bivariant checking for object literal methods. No code change needed in `PrCreateStep`.

### D3: `spawn` on `PipelineDeps`

Add `spawn: SpawnFn` (required) to `PipelineDeps` in `src/core/types.ts`.

`PipelineDeps extends StepContext`, and `CliStepDeps extends StepDeps (= StepContext)`. Since `PipelineDeps` gains `spawn`, it satisfies `CliStepDeps`, so `executor.ts` line 319 (`step.run(state, deps)` where `deps: PipelineDeps`) compiles without casts.

Agent steps receive the extra field but never access it — harmless.

### D4: `buildDeps` injection

Both `LocalRuntimeStrategy.buildDeps()` and `ManagedRuntimeStrategy.buildDeps()` return `PipelineDeps`. Add `spawn: spawnCommand` to both. If either omits it, TypeScript flags the error — compile-time guarantee achieved.

### D5: Test-side fake spawn

`tests/pipeline-integration.test.ts` builds deps inline for each `runPipeline` call. Add a shared `noopSpawn` helper that returns `{ exitCode: 0, stdout: "", stderr: "" }`. This feeds through `VerificationStep → propagateVerificationResult` and prevents any real git subprocess.

`tests/unit/core/verification/propagate.test.ts` already injects a fake spawn — no changes needed there.

## Files Changed

| File | Change |
|------|--------|
| `src/core/verification/propagate.ts` | `spawn` required, remove fallback |
| `src/core/step/types.ts` | Add `CliStepDeps`, update `CliStep.run` signature |
| `src/core/types.ts` | Add `spawn: SpawnFn` to `PipelineDeps` |
| `src/core/step/verification.ts` | Pass `deps.spawn` to `propagateVerificationResult` |
| `src/core/runtime/local.ts` | `buildDeps` adds `spawn: spawnCommand` |
| `src/core/runtime/managed.ts` | `buildDeps` adds `spawn: spawnCommand` |
| `tests/pipeline-integration.test.ts` | Add `noopSpawn` to deps in all test cases |

## Not Changed

| File | Reason |
|------|--------|
| `src/core/types.ts` `StepContext` | Shared by agent steps — not touched per requirement |
| `src/core/step/pr-create.ts` | `PrCreateStep.run` accepts `StepDeps` which is wider than `CliStepDeps`; bivariant method checking passes |
| `src/core/step/executor.ts` | Already passes `PipelineDeps` to `step.run()` — no change needed |
| `tests/unit/core/verification/propagate.test.ts` | Already injects fake spawn |
