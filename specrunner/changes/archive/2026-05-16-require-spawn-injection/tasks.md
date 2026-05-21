# Tasks: require-spawn-injection

## [x] Task 1: Make `spawn` required in `propagateVerificationResult`

**File**: `src/core/verification/propagate.ts`

1. Line 35: change `spawn?: SpawnFn;` to `spawn: SpawnFn;`
2. Line 37: change `const spawn = params.spawn ?? spawnCommand;` to `const spawn = params.spawn;`
3. Remove the unused import of `spawnCommand` from line 18 (only `SpawnFn` type is still needed)

**Verification**: `bun run typecheck` — expect compile error at `src/core/step/verification.ts:44` because `spawn` is now missing from the call site. This error is resolved in Task 3.

## [x] Task 2: Add `CliStepDeps` type and update `CliStep` interface

### 2a: `src/core/step/types.ts`

1. Add import: `import type { SpawnFn } from "../../util/spawn.js";`
2. After the existing `StepDeps` alias (line 19), add:
   ```ts
   /**
    * Dependencies for CLI-resident steps (kind: "cli").
    * Extends StepDeps with spawn — required for steps that invoke subprocesses.
    * Agent steps continue to use StepDeps (no spawn needed).
    *
    * Design D2 (require-spawn-injection): compile-time guarantee that CLI steps
    * receive an injected spawn function rather than falling back to a default.
    */
   export interface CliStepDeps extends StepDeps {
     spawn: SpawnFn;
   }
   ```
3. Update `CliStep.run` signature (line 181):
   - Before: `run(state: JobState, deps: StepDeps): Promise<void>;`
   - After: `run(state: JobState, deps: CliStepDeps): Promise<void>;`

### 2b: `src/core/types.ts`

1. Add import: `import type { SpawnFn } from "../util/spawn.js";`
2. Add `spawn: SpawnFn;` to the `PipelineDeps` interface, with JSDoc:
   ```ts
   /**
    * Subprocess spawning function. Injected by RuntimeStrategy.buildDeps().
    * CLI steps (verification, pr-create) pass this to subprocess-spawning functions.
    * Design D3 (require-spawn-injection): required to prevent leaky defaults in tests.
    */
   spawn: SpawnFn;
   ```

**Verification**: `bun run typecheck` — expect compile errors at `buildDeps` in local.ts and managed.ts (spawn missing). Resolved in Task 4.

## [x] Task 3: Wire `deps.spawn` in `VerificationStep`

**File**: `src/core/step/verification.ts`

1. Line 1: change import to `import type { CliStep, CliStepDeps } from "./types.js";`
2. Line 36: update run signature — `async run(state: JobState, deps: CliStepDeps): Promise<void>`
3. Lines 44-48: add `spawn: deps.spawn` to the `propagateVerificationResult` call:
   ```ts
   const result = await propagateVerificationResult({
     slug: deps.slug,
     branch: state.branch,
     iteration,
     cwd: verificationCwd,
     spawn: deps.spawn,
   });
   ```

## [x] Task 4: Inject `spawnCommand` in `buildDeps`

### 4a: `src/core/runtime/local.ts`

1. Add import: `import { spawnCommand } from "../../util/spawn.js";`
2. In `buildDeps()` (around line 263), add `spawn: spawnCommand,` to the returned object.

### 4b: `src/core/runtime/managed.ts`

1. Add import: `import { spawnCommand } from "../../util/spawn.js";`
2. In `buildDeps()` (around line 166), add `spawn: spawnCommand,` to the returned object.

**Verification**: `bun run typecheck` should pass after Tasks 1-4.

## [x] Task 5: Fix pipeline-integration tests

**File**: `tests/pipeline-integration.test.ts`

1. Add a shared `noopSpawn` helper near the top (after imports):
   ```ts
   import type { SpawnFn } from "../src/util/spawn.js";

   const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
   ```
2. In every `runPipeline` call (TC-010 through TC-DC-108), add `spawn: noopSpawn` to the deps object.

**Callers to update** (search for `await runPipeline(jobState,`):
- TC-010 (line ~250)
- TC-011 (line ~298)
- TC-012 (line ~342)
- TC-013 (line ~376)
- TC-014 (line ~412)
- TC-015 (line ~448)
- TC-016 (line ~491)
- TC-017 (line ~524)
- TC-018 (line ~564)
- TC-030 (line ~757)
- TC-050 (line ~607)
- TC-060 (line ~659)
- TC-061 (line ~714)
- TC-DC-101 (line ~819)
- TC-DC-102 (line ~844)
- TC-DC-103 (line ~888)
- TC-DC-104 (line ~926)
- TC-DC-105 (line ~973)
- TC-DC-106 (line ~1015)
- TC-DC-107 (line ~1043)
- TC-DC-108 (line ~1081)

## [x] Task 6: Verify

1. `bun run typecheck` — green
2. `bun run test` — green
3. Manual check: `git status && git log --oneline -3` before and after `bun run test` — no new commits or dirty state from test execution
