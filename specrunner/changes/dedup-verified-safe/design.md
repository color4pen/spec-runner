# Design: dedup-verified-safe

## Context

A codebase audit found multiple byte-identical or logic-identical code blocks. This change consolidates only the subset that has been verified as having zero semantic difference, covering 8 categories of duplication. The guiding invariant throughout is behavioral preservation: the existing test suite must pass without modification to any test file. Any test-expectation change would indicate a behavioral regression.

Current state of each duplication (verified by fact-check attestation):

| ID | Location | Nature |
|----|----------|--------|
| C1 | `command-registry.ts` run handler (:400-454) and job-start handler (:523-577) | Byte-identical handler body; only positional help label and comments differ |
| C2 | `compute{CodeReview,SpecReview,RequestReview,Conformance}Iteration` in 4 step files | All return `(state.steps?.[NAME]?.length ?? 0) + 1`; `nextIteration` from io-iteration.ts is already imported |
| C3 | `detectPackageManager` phase-1 upward walk (:48-79) and `findLockfile` (:128-157) | Same LOCKFILE_MAP iteration, same `.git` stop, same fs-root stop |
| C4 | `loadConfig` (:77) and `loadConfigWithSourceMetadata` (:144) | Identical read→migrate→merge→validate chain; only return value differs |
| C5 | `appendInterruption/Lineage/OperatorEvent/FindingRecency` in `job-journal.ts` | Four methods with identical bodies: `appendEventRecord(this.resolver.getEventsPath(), record)` |
| C6 | `runVerificationCommands` tail (:390-471) and `runVerificationPhases` tail (:614-696) | Identical coverage-gate → lockfile-gate → verdict → write sequence; skip strings differ by one word |
| C7 | Liveness-sidecar worktreePath block in `resume.ts:274-289` and `reopen.ts:311-326` | Byte-identical |
| C8 | `PROBE_SLUG` alias in `descriptor-input-completeness.ts:63-64`; empty if block in `job-state-projection.ts:79-86`; identity `enrichContext` in `spec-review.ts:100-102` | Dead/no-op code |

## Goals / Non-Goals

**Goals**:
- Remove C1-C8 without changing any observable behavior
- All existing tests pass without modification to any test file
- Verification result markdown skip strings remain byte-for-byte identical

**Non-Goals**:
- Unifying semantically different near-duplicates (adapter repair loops, runtime bootstrap variants, spawn wrapper null-exit semantics)
- Migrating production callers of `appendInterruption`/`appendLineage`/etc. that have test assertions on the specific method names (would require test changes)
- Changing any public API surface beyond the minimum required for each consolidation

## Decisions

### D1: run/job-start handler unification (C1)

Extract a shared `RUN_JOB_FLAGS` constant and a `runJobHandler` async function. Both command entries reference the same handler; each keeps its own `positional.name` for help output.

**Why not a shared CommandDef object**: `positional.name` differs between the two (`"request.md|slug"` vs `"slug|file"`), so the definition object cannot be fully shared. Extracting only the handler + flags constant removes all duplication.

**Help output**: Unchanged — positional names are separate per-command entry.

### D2: compute*Iteration deletion (C2)

Delete all four private functions (`computeCodeReviewIteration`, `computeSpecReviewIteration`, `computeRequestReviewIteration`, `computeConformanceIteration`). Replace each call site with `nextIteration(state, STEP_NAMES.X)`. All four files already import `nextIteration`; no new imports required.

### D3: detectPackageManager phase-1 replacement (C3)

Replace the inline walk loop in `detectPackageManager` with `findLockfile(cwd, fs)` and map the result to `{ pm, root }`. When `findLockfile` returns `null`, fall through to the existing packageManager-field fallback.

`findLockfile` returns `{ pm, filename, root }`. Only `pm` and `root` are used in the caller; `filename` is discarded. The walk logic, LOCKFILE_MAP order, and stop conditions are identical, so this is a pure refactoring with no behavioral change.

### D4: loadConfig delegation (C4)

`loadConfig` body becomes:
```ts
return (await loadConfigWithSourceMetadata(repoRoot)).config;
```

The metadata-only fields (`userGlobal.path`, `projectLocal.migrated`, etc.) are not returned by `loadConfig`, so callers are unaffected. The `projectLocalPath` computation in `loadConfigWithSourceMetadata` (the one extra step) derives path metadata from the same `repoRoot` argument and does not affect the config value returned.

### D5: journal append consolidation (C5)

**Approach**: Add a private `_appendRecord(record: JournalEventRecord): Promise<void>` method to `JobJournal`. The four named public methods become one-line wrappers that call `_appendRecord`. The public method signatures are unchanged.

**Why not full public API consolidation**: Several tests assert that specific named methods are called at specific points:
- `executor-sequential-regression.test.ts:352` asserts `store.appendInterruption.toHaveBeenCalledOnce()`
- `signal-handler-order.test.ts:68` spies on `JobStateStore.prototype.appendInterruption`
- `artifact-observability.test.ts:215` calls `store.appendLineage()` directly on a real `JobStateStore` instance

Renaming or removing the named methods would require changing test files, violating the acceptance criterion. The private helper achieves internal body dedup without touching the public API.

**job-state-store.ts**: The four delegation methods in `JobStateStore` (which call `this._journal.appendX`) remain unchanged. They are already thin delegations and contain no duplicated logic.

### D6: verification runner tail extraction (C6)

Extract a private `finalizeVerificationRun` function in `runner.ts`. It accepts:
```
{ slug, cwd, phases, failed, coverage, baseBranch, root, skipLabel: "command" | "phase" }
```

Skip strings are generated from `skipLabel` to preserve exact current strings:
- `"command"` → `"_(skipped — previous command failed)_"`
- `"phase"` → `"_(skipped — previous phase failed)_"`

**Critical**: The generated strings must be byte-for-byte identical to the current literals. The extraction function does not unify the strings; it parameterizes them.

Both `runVerificationCommands` and `runVerificationPhases` call `finalizeVerificationRun` after their respective loop finishes, passing `"command"` or `"phase"` as the label.

### D7: worktreePath resolution helper (C7)

Extract the liveness-sidecar lookup into a new exported function `resolveLivenessWorktreePath(state, slug, cwd)` in `src/core/resume/resolve-worktree-path.ts`. Both `resume.ts` and `reopen.ts` call this helper and use its return value as `resolvedWorktreePath`.

**Why new file vs existing module**: The `resume-context.ts` module is about building resume prompts; the other modules (`resolve-job.ts`, `resolve-step.ts`) have distinct single responsibilities. A new file with a clear name avoids coupling unrelated concerns.

### D8: dead code removal (C8)

Three removals:
1. `PROBE_SLUG` alias in `descriptor-input-completeness.ts`: Replace the two uses (lines 117, 121) with `VALIDATOR_PROBE_SLUG`, then delete the alias declaration.
2. Empty if block in `job-state-projection.ts:79-86`: Delete the block. The condition had no body; removing it does not change behavior.
3. Identity `enrichContext` in `spec-review.ts:100-102`: Delete the method. The interface declares `enrichContext?` as optional; when absent, the adapter skips enrichment and returns `dynamicContext` unchanged — the same result.

## Risks / Trade-offs

**[Risk] D5 partial dedup**: Only the journal class body is deduplicated; the store's delegation methods remain as four separate methods. The trade-off is test stability (full consolidation would require test changes) vs internal cleanliness.
**Mitigation**: The named methods are already thin one-liners; the risk of divergence is low.

**[Risk] D6 skip string preservation**: If the label-to-string mapping ever produces a different string, verification markdown is silently corrupted.
**Mitigation**: The acceptance criteria includes an explicit check for skip string content; this is covered by an integration assertion in the test suite and visible in written output files.

**[Risk] D3 findLockfile async mismatch**: `findLockfile` is synchronous; `detectPackageManager` is async (uses `readFile` in phase 2). The phase-1 replacement uses the sync API, consistent with the existing `findLockfile` signature.
**Mitigation**: `findLockfile` already accepts the same `fsLike` abstraction used in `detectPackageManager`'s tests; test coverage is preserved.

## Open Questions

None — all design decisions locked by the architect evaluation in request.md.
