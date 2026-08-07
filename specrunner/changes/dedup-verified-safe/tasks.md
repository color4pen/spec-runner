# Tasks: dedup-verified-safe

## T-01: Delete compute*Iteration functions (C2)

- [ ] In `src/core/step/code-review.ts`: delete `computeCodeReviewIteration` (lines ~28-30); replace calls with `nextIteration(state, STEP_NAMES.CODE_REVIEW)`. Verify that `nextIteration` is already imported (it is).
- [ ] In `src/core/step/spec-review.ts`: delete `computeSpecReviewIteration` (lines ~51-53); replace calls in `prepareRoundContext` and `buildMessage` with `nextIteration(state, STEP_NAMES.SPEC_REVIEW)`.
- [ ] In `src/core/step/request-review.ts`: delete `computeRequestReviewIteration` (lines ~40-42); replace calls with `nextIteration(state, STEP_NAMES.REQUEST_REVIEW)`.
- [ ] In `src/core/step/conformance.ts`: delete `computeConformanceIteration` (lines ~35-37); replace calls with `nextIteration(state, STEP_NAMES.CONFORMANCE)`.
- [ ] Confirm grep 0 results for `computeCodeReviewIteration`, `computeSpecReviewIteration`, `computeRequestReviewIteration`, `computeConformanceIteration` in `src/` and `tests/`.

**Acceptance Criteria**:
- All four symbols are absent from `src/` and `tests/` (grep 0)
- `typecheck` passes (no type errors)
- `test` passes (behavior unchanged)

---

## T-02: Remove dead code (C8)

- [ ] In `src/core/pipeline/descriptor-input-completeness.ts`: at line ~117 and ~121, replace `PROBE_SLUG` with `VALIDATOR_PROBE_SLUG`; delete the alias declaration (`const PROBE_SLUG = VALIDATOR_PROBE_SLUG;` at line ~64).
- [ ] In `src/store/job-state-projection.ts`: delete the empty if block at lines ~79-86 (condition whose body is a comment only).
- [ ] In `src/core/step/spec-review.ts`: delete the identity `enrichContext` method (lines ~100-102; body `return dynamicContext`).
- [ ] Confirm grep 0 for `PROBE_SLUG` (as a standalone symbol, not as a substring of `VALIDATOR_PROBE_SLUG`) in `src/` and `tests/`.

**Acceptance Criteria**:
- `PROBE_SLUG` alias gone; `VALIDATOR_PROBE_SLUG` used directly at both call sites
- Empty if block in `job-state-projection.ts` removed
- Identity `enrichContext` in `spec-review.ts` removed
- `typecheck` and `test` pass

---

## T-03: Unify run / job-start handler (C1)

- [ ] In `src/cli/command-registry.ts`, above the `run` definition, add:
  ```ts
  const RUN_JOB_FLAGS = {
    verbose: { type: "boolean" },
    quiet: { type: "boolean" },
    json: { type: "boolean" },
    "no-worktree": { type: "boolean" },
    issue: { type: "string" },
    detach: { type: "boolean" },
  } as const satisfies Record<string, FlagDef>;
  ```
- [ ] Extract the handler body into a named async function `runJobHandler` (same signature as `CommandDef.handler`: `(parsed: ParsedArgs, ctx?: CommandContext) => Promise<void>`). The body is taken verbatim from the current `run` handler. Remove the comment-only differences (keep no misleading comments).
- [ ] Update the `run` entry to `{ flags: RUN_JOB_FLAGS, positional: { name: "request.md|slug", required: true }, handler: runJobHandler }`.
- [ ] Update the `job.subcommands.start` entry to `{ flags: RUN_JOB_FLAGS, positional: { name: "slug|file", required: true }, handler: runJobHandler }`.
- [ ] Verify `specrunner run --help` and `specrunner job start --help` output the same positional labels as before.

**Acceptance Criteria**:
- `run` handler and `job start` handler are the same function reference
- `--help` output for each command shows `request.md|slug` and `slug|file` respectively (unchanged)
- `typecheck` and `test` pass

---

## T-04: Delegate loadConfig to loadConfigWithSourceMetadata (C4)

- [ ] In `src/config/store.ts`, replace the body of `loadConfig` with:
  ```ts
  return (await loadConfigWithSourceMetadata(repoRoot)).config;
  ```
  The existing multi-branch read→migrate→merge→validate logic is deleted. The JSDoc comment describing the two-layer merge semantics remains.
- [ ] Confirm that `loadConfig` still throws `CONFIG_MISSING` when both config files are absent (this is guaranteed because `loadConfigWithSourceMetadata` calls `configMissingError()` in the same case).

**Acceptance Criteria**:
- `loadConfig` body is a single `return` statement
- All callers of `loadConfig` behavior is unchanged (same errors, same return values)
- `typecheck` and `test` pass

---

## T-05: Replace detectPackageManager phase-1 with findLockfile (C3)

- [ ] In `src/util/detect-pm.ts`, inside `detectPackageManager`, replace the `while (true)` walk loop (phase 1, lines ~58-79) with:
  ```ts
  const found = findLockfile(cwd, fs);
  if (found) {
    return { pm: found.pm, root: found.root };
  }
  ```
  The remaining code (phase 2: packageManager field lookup; phase 3: default) is unchanged.
- [ ] The `fs` parameter passed to `findLockfile` must use only `existsSync` (which `findLockfile` requires); the `detectPackageManager` `fsLike` provides `existsSync` already, so pass `{ existsSync: fs.existsSync }` or the full `fs` object (both satisfy `findLockfile`'s `{ existsSync }` parameter type).
- [ ] Do NOT change `findLockfile` itself.

**Acceptance Criteria**:
- `detectPackageManager` phase-1 no longer contains an inline walk loop
- Behavior unchanged for all inputs: same lockfile priority, same `.git` stop, same fs-root stop
- `typecheck` and `test` pass (detect-pm tests must be green without modification)

---

## T-06: Add private _appendRecord in JobJournal (C5)

- [ ] In `src/store/job-journal.ts`, add a private method:
  ```ts
  private async _appendRecord(record: InterruptionRecord | LineageRecord | OperatorEventRecord | FindingRecencyRecord): Promise<void> {
    await appendEventRecord(this.resolver.getEventsPath(), record);
  }
  ```
- [ ] Update the bodies of `appendInterruption`, `appendLineage`, `appendOperatorEvent`, `appendFindingRecency` to each call `return this._appendRecord(record)`. Their signatures and JSDoc remain unchanged.
- [ ] `src/store/job-state-store.ts`: no change required (its delegation methods still call `this._journal.appendX(record)` which now internally call `_appendRecord`).

**Acceptance Criteria**:
- The `appendEventRecord(this.resolver.getEventsPath(), record)` expression appears exactly once in `job-journal.ts` (inside `_appendRecord`)
- All four named methods remain on the public API with their original signatures
- `typecheck` and `test` pass; `artifact-observability.test.ts` green; `signal-handler-order.test.ts` green

---

## T-07: Extract worktreePath resolution helper (C7)

- [ ] Create `src/core/resume/resolve-worktree-path.ts` with an exported function:
  ```ts
  export async function resolveLivenessWorktreePath(
    state: { worktreePath?: string | null; jobId: string },
    slug: string,
    cwd: string,
  ): Promise<string | null>
  ```
  Body: the byte-identical block from `resume.ts:274-289` (including the `try/catch` and the jobId match guard). Import `livenessJsonPath` from `../../util/paths.js` and `nodeFs` from `node:fs/promises`.
- [ ] In `src/core/command/resume.ts`: import `resolveLivenessWorktreePath` from `../resume/resolve-worktree-path.js`; replace the block at lines ~274-289 with:
  ```ts
  const resolvedWorktreePath = await resolveLivenessWorktreePath(updatedState, resolvedSlug ?? "", cwd);
  ```
  Adjust the guarded condition: the original only runs the sidecar lookup when `resolvedSlug` is non-null, so pass `""` when `resolvedSlug` is null (or guard at the call site to match the original semantics). Preserve the `let` → `const` conversion only if the variable is not reassigned after this point; otherwise keep `let`.
- [ ] In `src/core/command/reopen.ts`: same replacement at lines ~311-326. Verify that `resolvedSlug` is the same variable available at that point in reopen's `prepare()`.
- [ ] Verify the helper is not called with `slug = ""` in a way that generates a wrong liveness path. The original block was guarded by `if (!resolvedWorktreePath && resolvedSlug)`, so the helper should only be invoked when `resolvedSlug` is truthy — wrap the call with the same guard.

**Acceptance Criteria**:
- The sidecar lookup block exists in exactly one place (`resolve-worktree-path.ts`)
- `resume.ts` and `reopen.ts` each call `resolveLivenessWorktreePath`
- `typecheck` and `test` pass

---

## T-08: Extract verification runner tail (C6)

- [ ] In `src/core/verification/runner.ts`, add a private async function (module-level, not exported):
  ```ts
  async function finalizeVerificationRun(args: {
    slug: string;
    cwd: string;
    phases: PhaseResult[];
    failed: boolean;
    coverage: import("../../config/schema.js").CoverageConfig | undefined;
    baseBranch: string | undefined;
    root: string;
    skipLabel: "command" | "phase";
  }): Promise<VerificationResult>
  ```
  The body is taken verbatim from either function's tail. The skip string is generated as:
  ```ts
  `_(skipped — previous ${args.skipLabel} failed)_`
  ```
  which produces exactly `"_(skipped — previous command failed)_"` or `"_(skipped — previous phase failed)_"`.
- [ ] In `runVerificationCommands`: after the command loop ends, remove the coverage-gate → lockfile-gate → verdict → write tail; replace with `return finalizeVerificationRun({ slug, cwd, phases, failed, coverage, baseBranch, root, skipLabel: "command" })`.
- [ ] In `runVerificationPhases`: after the phase loop ends (after the test-coverage and script-based phases), remove the same tail; replace with `return finalizeVerificationRun({ slug, cwd, phases, failed, coverage, baseBranch, root, skipLabel: "phase" })`. Note: `root` is available from `const { pm: detectedPm, root } = await detectPackageManager(cwd)` earlier in the function.
- [ ] Confirm that `coverageSkipNote` (set in the tail when `coverage === undefined`) is forwarded correctly through `finalizeVerificationRun` — the function must declare and set this local, then pass it to `writeVerificationResult`.

**Acceptance Criteria**:
- The coverage-gate → lockfile-gate → verdict → writeVerificationResult sequence exists in exactly one place (inside `finalizeVerificationRun`)
- Skip strings produced by the `skipLabel` template match the previous literals byte-for-byte
- `typecheck` and `test` pass; verification result markdown content is unchanged

---

## T-09: Final verification

- [ ] Run `bun run typecheck` — must exit 0
- [ ] Run `bun run test` — must exit 0, no test file modified
- [ ] Grep for deleted symbols: `computeCodeReviewIteration`, `computeSpecReviewIteration`, `computeRequestReviewIteration`, `computeConformanceIteration`, `PROBE_SLUG` (as a symbol, not substring) — all must return 0 matches in `src/` and `tests/`
- [ ] Grep for `enrichContext` in `spec-review.ts` — must return 0 matches
- [ ] Confirm the empty if block is gone from `job-state-projection.ts` (grep for `Counters are stale` in that file — must return 0)
- [ ] Confirm `appendEventRecord` appears exactly once in `job-journal.ts`

**Acceptance Criteria**:
- All above greps pass
- `typecheck && test` green
- No test file diff (all modified files are in `src/`)
