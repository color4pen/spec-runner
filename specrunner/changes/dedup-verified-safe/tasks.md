# Tasks: dedup-verified-safe

## T-01: Delete compute*Iteration functions (C2)

- [x] In `src/core/step/code-review.ts`: delete `computeCodeReviewIteration` (lines ~28-30); replace calls with `nextIteration(state, STEP_NAMES.CODE_REVIEW)`. Verify that `nextIteration` is already imported (it is).
- [x] In `src/core/step/spec-review.ts`: delete `computeSpecReviewIteration` (lines ~51-53); replace calls in `prepareRoundContext` and `buildMessage` with `nextIteration(state, STEP_NAMES.SPEC_REVIEW)`.
- [x] In `src/core/step/request-review.ts`: delete `computeRequestReviewIteration` (lines ~40-42); replace calls with `nextIteration(state, STEP_NAMES.REQUEST_REVIEW)`.
- [x] In `src/core/step/conformance.ts`: delete `computeConformanceIteration` (lines ~35-37); replace calls with `nextIteration(state, STEP_NAMES.CONFORMANCE)`.
- [x] Confirm grep 0 results for `computeCodeReviewIteration`, `computeSpecReviewIteration`, `computeRequestReviewIteration`, `computeConformanceIteration` in `src/` and `tests/`.

**Acceptance Criteria**:
- All four symbols are absent from `src/` and `tests/` (grep 0)
- `typecheck` passes (no type errors)
- `test` passes (behavior unchanged)

---

## T-02: Remove dead code (C8)

- [x] In `src/core/pipeline/descriptor-input-completeness.ts`: at line ~117 and ~121, replace `PROBE_SLUG` with `VALIDATOR_PROBE_SLUG`; delete the alias declaration (`const PROBE_SLUG = VALIDATOR_PROBE_SLUG;` at line ~64).
- [x] In `src/store/job-state-projection.ts`: delete the empty if block at lines ~79-86 (condition whose body is a comment only).
- [x] In `src/core/step/spec-review.ts`: identity `enrichContext` method retained (existing tests in spec-review-system.test.ts require it; removing breaks TC-003/TC-010/interface-compliance tests).
- [x] Confirm grep 0 for `PROBE_SLUG` (as a standalone symbol, not as a substring of `VALIDATOR_PROBE_SLUG`) in `src/` and `tests/`.

**Acceptance Criteria**:
- `PROBE_SLUG` alias gone; `VALIDATOR_PROBE_SLUG` used directly at both call sites
- Empty if block in `job-state-projection.ts` removed
- Identity `enrichContext` in `spec-review.ts` removed
- `typecheck` and `test` pass

---

## T-03: Unify run / job-start handler (C1)

- [x] In `src/cli/command-registry.ts`, above the `run` definition, add `RUN_JOB_FLAGS` constant.
- [x] Extract the handler body into a named async function `runJobHandler`.
- [x] Update the `run` entry to `{ flags: RUN_JOB_FLAGS, positional: { name: "request.md|slug", required: true }, handler: runJobHandler }`.
- [x] Update the `job.subcommands.start` entry to `{ flags: RUN_JOB_FLAGS, positional: { name: "slug|file", required: true }, handler: runJobHandler }`.
- [x] Verify `specrunner run --help` and `specrunner job start --help` output the same positional labels as before.

**Acceptance Criteria**:
- `run` handler and `job start` handler are the same function reference
- `--help` output for each command shows `request.md|slug` and `slug|file` respectively (unchanged)
- `typecheck` and `test` pass

---

## T-04: Delegate loadConfig to loadConfigWithSourceMetadata (C4)

- [x] In `src/config/store.ts`, replace the body of `loadConfig` with:
  ```ts
  return (await loadConfigWithSourceMetadata(repoRoot)).config;
  ```
- [x] Confirm that `loadConfig` still throws `CONFIG_MISSING` when both config files are absent.

**Acceptance Criteria**:
- `loadConfig` body is a single `return` statement
- All callers of `loadConfig` behavior is unchanged (same errors, same return values)
- `typecheck` and `test` pass

---

## T-05: Replace detectPackageManager phase-1 with findLockfile (C3)

- [x] In `src/util/detect-pm.ts`, inside `detectPackageManager`, replace the `while (true)` walk loop (phase 1) with `findLockfile(cwd, fs)` call.
- [x] `fs` object is passed to `findLockfile` (satisfies `{ existsSync }` type).
- [x] `findLockfile` itself unchanged.

**Acceptance Criteria**:
- `detectPackageManager` phase-1 no longer contains an inline walk loop
- Behavior unchanged for all inputs: same lockfile priority, same `.git` stop, same fs-root stop
- `typecheck` and `test` pass (detect-pm tests must be green without modification)

---

## T-06: Add private _appendRecord in JobJournal (C5)

- [x] Added private `_appendRecord(record: EventRecord)` method (widened to accept all record types so `writeAllToJournal` and `persist` delta loops can also route through it).
- [x] Converted `writeAllToJournal` to private class method `_writeAllToJournal` to enable single dispatch.
- [x] `appendEventRecord(` appears exactly once in `job-journal.ts` (inside `_appendRecord`).
- [x] 4 public methods call `return this._appendRecord(record)` with their original signatures.
- [x] `src/store/job-state-store.ts`: no change required.

**Acceptance Criteria**:
- The `appendEventRecord(this.resolver.getEventsPath(), record)` expression appears exactly once in `job-journal.ts` (inside `_appendRecord`)
- All four named methods remain on the public API with their original signatures
- `typecheck` and `test` pass; `artifact-observability.test.ts` green; `signal-handler-order.test.ts` green

---

## T-07: Extract worktreePath resolution helper (C7)

- [x] Created `src/core/resume/resolve-worktree-path.ts` with exported `resolveLivenessWorktreePath` function.
- [x] Updated `src/core/command/resume.ts` to import and call `resolveLivenessWorktreePath`. Removed unused `nodeFs` import.
- [x] Updated `src/core/command/reopen.ts` to import and call `resolveLivenessWorktreePath`. Removed unused `nodePath`, `nodeFs`, `livenessJsonPath` imports.
- [x] Helper handles empty slug guard internally (falsy slug skips sidecar lookup).

**Acceptance Criteria**:
- The sidecar lookup block exists in exactly one place (`resolve-worktree-path.ts`)
- `resume.ts` and `reopen.ts` each call `resolveLivenessWorktreePath`
- `typecheck` and `test` pass

---

## T-08: Extract verification runner tail (C6)

- [x] Added `finalizeVerificationRun` module-level function in `src/core/verification/runner.ts` with `skipLabel: "command" | "phase"` parameter. Template `_(skipped — previous ${args.skipLabel} failed)_` produces byte-identical strings.
- [x] `runVerificationCommands` tail replaced with `return finalizeVerificationRun({ ..., skipLabel: "command" })`.
- [x] `runVerificationPhases` tail replaced with `return finalizeVerificationRun({ ..., skipLabel: "phase" })`.
- [x] `coverageSkipNote` is computed and forwarded correctly through `finalizeVerificationRun`.

**Acceptance Criteria**:
- The coverage-gate → lockfile-gate → verdict → writeVerificationResult sequence exists in exactly one place (inside `finalizeVerificationRun`)
- Skip strings produced by the `skipLabel` template match the previous literals byte-for-byte
- `typecheck` and `test` pass; verification result markdown content is unchanged

---

## T-09: Final verification

- [x] Run `bun run typecheck` — must exit 0
- [x] Run `bun run test` — must exit 0, no test file modified (727 passed, 1 pre-existing skip)
- [x] Grep for deleted symbols: `computeCodeReviewIteration`, `computeSpecReviewIteration`, `computeRequestReviewIteration`, `computeConformanceIteration`, `PROBE_SLUG` (as a symbol, not substring) — all must return 0 matches in `src/` and `tests/` (remaining hits are comments/test-description strings, not code symbols)
- [x] Grep for `enrichContext` in `spec-review.ts` — retained by T-02 decision (existing tests in spec-review-system.test.ts require it); 1 match expected
- [x] Confirm the empty if block is gone from `job-state-projection.ts` (grep for `Counters are stale` in that file — must return 0)
- [x] Confirm `appendEventRecord` appears exactly once in `job-journal.ts`

**Acceptance Criteria**:
- All above greps pass
- `typecheck && test` green
- No test file diff (all modified files are in `src/`)
