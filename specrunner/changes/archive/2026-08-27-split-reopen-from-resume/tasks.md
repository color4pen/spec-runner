# Tasks: split-reopen-from-resume

## T-01: Update `REOPEN_TRANSITIONS` target and TC-016

**Files**:
- `src/state/lifecycle.ts`
- `src/state/__tests__/lifecycle-reopen.test.ts`

- [x] In `lifecycle.ts`, change `REOPEN_TRANSITIONS` so that
  `"awaiting-archive"` maps to `new Set(["awaiting-resume"])` (was
  `new Set(["running"])`).
- [x] Update the D1 comment above `REOPEN_TRANSITIONS` to say
  `awaiting-archive → awaiting-resume is permitted only through an explicit
  operator action` (remove `running` from the prose).
- [x] Update `transitionJob`'s JSDoc `@param opts.allowReopen` comment to
  reflect `awaiting-resume` as the permitted target.
- [x] In `lifecycle-reopen.test.ts` TC-016: change the `transitionJob` call
  target from `"running"` to `"awaiting-resume"`:
  `transitionJobWithOpts(state, "awaiting-resume", ctx, { allowReopen: true })`.
- [x] Update TC-016 assertion from `expect(result.state.status).toBe("running")`
  to `expect(result.state.status).toBe("awaiting-resume")`.
- [x] In TC-016-b, update the call target to `"awaiting-resume"` with
  `{ allowReopen: false }` — it must still throw.
- [x] TC-002-a and TC-002-b assertions (testing `awaiting-archive → running` is
  forbidden by the general guard) are unchanged — do not modify them.
- [x] **EXCEPTION — TC-002-c must be updated**: TC-002-c currently asserts
  `targets!.has("running")` for the `REOPEN_TRANSITIONS` awaiting-archive entry.
  After D2, `REOPEN_TRANSITIONS["awaiting-archive"]` maps to
  `new Set(["awaiting-resume"])` (not `running`). Update TC-002-c:
  - Change the describe/it label from `"awaiting-archive → running edge"` to
    `"awaiting-archive → awaiting-resume edge"`.
  - Change `expect(targets!.has("running")).toBe(true)` to
    `expect(targets!.has("awaiting-resume")).toBe(true)`.
- [x] TC-017 assertions (testing `transitionJob` without opts throws for
  `awaiting-archive → running`) are unchanged. In addition, add a new TC-017-d
  sub-test to directly assert that `canTransition("awaiting-archive", "awaiting-resume")`
  returns `false`. This covers test-cases.md TC-017: "General guard still forbids
  `awaiting-archive → awaiting-resume` without opt-in." Example:
  ```ts
  it("TC-017-d: canTransition('awaiting-archive', 'awaiting-resume') returns false", () => {
    expect(canTransition("awaiting-archive", "awaiting-resume")).toBe(false);
  });
  ```

**Acceptance Criteria**:
- `canTransition("awaiting-archive", "running")` still returns `false`.
- `canTransition("awaiting-archive", "awaiting-resume")` returns `false` (general
  guard; TC-017 / test-cases.md TC-017).
- `transitionJob(state, "awaiting-resume", ctx, { allowReopen: true })` returns
  `{ state: { status: "awaiting-resume" }, noop: false }` for `awaiting-archive` input.
- `transitionJob(state, "awaiting-resume", ctx)` (no opts) throws for
  `awaiting-archive` input (general guard unchanged).
- `transitionJob(state, "running", ctx, { allowReopen: true })` now throws
  (target `running` is no longer in `REOPEN_TRANSITIONS`).
- All TC-002, TC-016, TC-017 sub-tests pass.

---

## T-02: Rewrite `ReopenCommand` as standalone command

**Files**:
- `src/core/command/reopen.ts`
- `src/store/event-journal.ts`

### `src/store/event-journal.ts`

- [x] Change `fromStep: string` to `fromStep?: string` in `OperatorEventRecord`
  (make it optional for backward compatibility with existing journal records).
- [x] Update the JSDoc comment on `fromStep` to say it is optional: was recorded
  from `--from`; step selection has moved to `resume`.

### `src/core/command/reopen.ts`

- [x] Remove `extends CommandRunner` from `ReopenCommand`; remove the
  `import { CommandRunner, type PrepareResult } from "./runner.js"` import.
- [x] Remove `RuntimeStrategy` and `EventBus` from the constructor. New
  signature: `constructor(private readonly slug: string, private readonly
  options: ReopenOptions)`.
- [x] Remove `from: string` from `ReopenOptions` (D3: `--from` is removed).
- [x] Remove all imports that were only needed for pipeline execution:
  `resolveResumeStep` and `buildAllowedStepSet` from `resume/resolve-step.js`,
  `parseRequestMd` from `parser/request-md.js`,
  `loadConfig` from `config/store.js`,
  `resolveRepoRoot` from `util/repo-root.js`,
  `resolveLivenessWorktreePath` from `resume/resolve-worktree-path.js`,
  `RuntimeStrategy` from `port/runtime-strategy.js`,
  `EventBus` from `event/event-bus.js`.
- [x] Remove the `PrepareError` inner class (no longer needed — `execute()` returns
  exit codes directly without throwing).
- [x] Implement `async execute(): Promise<number>` (public) with this sequence.
- [x] Update the file-level JSDoc to describe the new contract: "transition
  only — no pipeline execution".
- [x] Ensure `{ allowReopen: true }` literal is present in the `transitionJob`
  call (required for B-17 liveness check in `core-invariants.test.ts`).

**Acceptance Criteria**:
- `ReopenCommand` has no `extends CommandRunner` clause.
- Constructor signature is `(slug: string, options: ReopenOptions)` — no
  `runtime` or `events` parameters.
- `ReopenOptions` has no `from` field.
- `execute()` returns `0` for a valid `awaiting-archive` job with OPEN PR.
- `execute()` returns `1` for status gate, PR gate, missing PR, API failures.
- `execute()` returns `2` for worktree guard violations.
- `transitionJob` is called with target `"awaiting-resume"` and `{ allowReopen: true }`.
- `appendOperatorEvent` is called before `persist`.
- The operator event record does not include `fromStep`.
- `patch` passed to `transitionJob` contains
  `{ error: null, resumePoint: null, mainCheckoutDrift: null, pid: null }`.
- No imports of `CommandRunner`, `PrepareResult`, `resolveResumeStep`,
  `buildAllowedStepSet`, `parseRequestMd`, `loadConfig`,
  `resolveLivenessWorktreePath` remain in `reopen.ts`.

---

## T-03: Update CLI entry and command registry

**Files**:
- `src/cli/reopen.ts`
- `src/cli/command-registry.ts`

### `src/cli/reopen.ts`

- [x] Remove imports: `bootstrap` from `./bootstrap.js`, `EventBus` from
  `../core/event/event-bus.js`, `wireProgressDisplay` from `./progress.js`.
- [x] Remove the `resolveHeartbeatInterval` helper function.
- [x] Remove `from: string` from the `ReopenOptions` interface in this file.
- [x] Remove the `resolveJobStateBySlug` pre-resolution call (no longer needed;
  `ReopenCommand` resolves state internally).
- [x] Remove the `bootstrap(...)` call and all references to `runtime` and `config`.
- [x] Simplify `runReopenCore`:
  1. Call `setLogLevel(options.logLevel ?? "default")` for early error logging.
  2. Resolve GitHub client (keep existing token resolution: optional config
     load for host/baseUrl → `resolveGitHubToken` → `createGitHubClient`; on
     any failure → `githubClient = null`).
  3. Create `new ReopenCommand(slug, { reason: options.reason, githubClient,
     logLevel: options.logLevel, cwd: options.cwd, json: options.json,
     noWorktree: options.noWorktree })` and call `.execute()`.
  4. Return the exit code; wrap in try/catch that returns `1` on unexpected
     throws.
- [x] Remove the `progress.dispose()` call (no progress display).
- [x] Keep `runReopen` (calls `process.exit(await runReopenCore(...))`).

### `src/cli/command-registry.ts`

- [x] Remove `from: { type: "string" }` from the `reopen` subcommand `flags`.
- [x] Remove the `const fromStep = ...` variable and the
  `if (!fromStep) { logError(...); process.exit(ARG_ERROR); }` guard from the
  handler.
- [x] Remove `from: fromStep` from the `runReopen(...)` call arguments.
- [x] Update `REOPEN_USAGE`:
  - Usage line: `Usage: specrunner job reopen <slug> --reason <text> [options]`.
  - Description: "Transitions an awaiting-archive job to awaiting-resume without
    executing the pipeline. The associated PR must be OPEN."
  - Remove the `--from <step>` entry from the Options block.
  - Add a note: "After reopen, run 'specrunner job resume <slug> --from <step>
    [--prompt ...]' to start pipeline execution."
- [x] Update `help.summary` to
  `"  job reopen <slug>               awaiting-archive job を awaiting-resume に遷移する"`.

**Acceptance Criteria**:
- `runReopenCore` does not call `bootstrap()`, `wireProgressDisplay()`, or
  `new EventBus()`.
- `runReopenCore` does not call `resolveJobStateBySlug` before creating
  `ReopenCommand`.
- Passing `--from` to `job reopen` via CLI causes an ARG_ERROR exit (unknown
  flag or explicitly rejected by the handler).
- `--reason` is still required; omitting it exits with ARG_ERROR.
- `REOPEN_USAGE` does not mention `--from`.

---

## T-04: Update Actions workflow

**File**: `.github/workflows/specrunner-dispatch.yml`

- [x] In the `elif [ "$ACTION" = "reopen" ]` branch, after the SLUG extraction,
  replace the single `bun ./bin/specrunner.ts job reopen "$SLUG" --from "$FROM"
  --reason "$REASON"` line with two sequential calls (applied by operator in commit 8e1e1c8f).
- [x] Keep the `if [ -z "$FROM" ] || [ -z "$REASON" ]; then exit 1; fi` guard.
- [x] Update the inline comment to reflect the new two-step contract.

- [x] Add an automated unit test (TC-019 per test-cases.md) verifying that the
  `action=reopen` branch of the Actions YAML dispatches two sequential CLI
  commands (implemented in `tests/unit/workflow/specrunner-dispatch.test.ts`).

**Acceptance Criteria**:
- `action=reopen` runs `job reopen` (lifecycle) then `job resume` (execution).
- `--reason` is passed to `job reopen`; `--from` is passed to `job resume`.
- If `job reopen` fails (non-zero exit), the shell exits before `job resume`
  runs (fail-fast; no implicit `|| true`).
- Optional `$PROMPT` is forwarded to `job resume` when non-empty.
- TC-019 automated test passes (YAML content verification).

---

## T-05: Update guide and conformance documentation

**Files**:
- `src/core/command/guide.ts`
- `architecture/conformance.md`

### `src/core/command/guide.ts`

- [x] In the `escalation` topic, locate section 3 ("awaiting-archive からの再開").
- [x] Replace the single-command code block with the two-step flow.
- [x] Replace the constraint note with the new reopen-only note.

### `architecture/conformance.md`

- [x] Locate the B-17 row in the invariants table (§ (A) 決定的レビュー).
- [x] Append a parenthetical to the grep-check description noting the guarded
  transition is `awaiting-archive → awaiting-resume`.

### `tests/unit/architecture/core-invariants.test.ts`

- [x] Locate the B-17 describe block JSDoc comment and update the prose to
  say `awaiting-archive → awaiting-resume transition` to reflect D2.

**Acceptance Criteria**:
- `specrunner guide escalation` output describes the two-step flow (reopen for
  transition, resume for execution).
- The guide no longer mentions `--from` as a `reopen` option.
- `architecture/conformance.md` B-17 row accurately states that the guarded
  transition is `awaiting-archive → awaiting-resume`.
- `core-invariants.test.ts` B-17 JSDoc comment accurately says
  `awaiting-archive → awaiting-resume transition`.

---

## T-06: Update test suite

**Files**:
- `src/core/command/__tests__/reopen-command.test.ts`
- `src/store/__tests__/event-journal-operator-event.test.ts`
- `src/cli/__tests__/command-registry-reopen.test.ts`

### `reopen-command.test.ts` — structural rewrite

The file currently tests `prepare()` (accessed via type cast) on a
`CommandRunner` subclass.  After T-02, `ReopenCommand` exposes only `execute()`.

> **TC number mapping** — the existing test file uses TC labels from the original
> ADR that diverge from test-cases.md. When rewriting, **rename TC labels** to
> match test-cases.md numbers. The table below maps current test-file TC labels
> to the correct test-cases.md TC numbers:
>
> | Current test-file TC label | test-cases.md TC | Description |
> |---|---|---|
> | TC-003 (ResumeCommand pin) | TC-015 | Resume directly on awaiting-archive is still refused |
> | TC-006 (archived job rejected) | TC-003 | Reopen rejected for archived job |
> | TC-007 (canceled job rejected) | TC-004 | Reopen rejected for canceled job |
> | TC-010 (--from bogus-step) | (replace; no direct TC) | Replace with addendum to TC-001 |
> | TC-011 (--from regression-gate) | (replace; no direct TC) | Replace with addendum to TC-001 |
> | TC-013 (no PR recorded) | TC-030 | Reopen rejected when no PR number |
> | TC-014 (CLOSED PR) | TC-006 | Reopen rejected for closed (non-merged) PR |
> | TC-015 (no GitHub client) | TC-007 | Reopen fails when PR state unavailable |
> | TC-018 (worktree guard) | TC-029 | Reopen inside specrunner worktree returns exit code 2 |
> | TC-020 (patch fields) | TC-009 | Run-control fields are reset by reopen |
> | TC-021 (operator event) | TC-010 + TC-011 | Operator event durably recorded + no fromStep |
>
> Note: TC-005 (merged PR), TC-008 (evidence preserved), and TC-001 retain the
> same numbers in both systems and need no renaming. The rewritten test file
> MUST use the test-cases.md TC numbers as labels to avoid confusion.

- [x] Remove imports of `PrepareResult` from `runner.js`.
- [x] Remove `callPrepare()`, `callResumePrepare()`, `makeRuntime()`,
  `makeEventBus()` helpers.
- [x] Remove mocks for `resolveResumeStep`, `buildAllowedStepSet`,
  `parseRequestMd`, `loadConfig`, `resolveRepoRoot` (these are no longer
  imported by `reopen.ts`).
- [x] Remove `from` from all `ReopenCommand` constructor call sites.
- [x] **TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009,
  TC-010, TC-011, TC-015, TC-020, TC-021, TC-029, TC-030**: all implemented with
  `cmd.execute()` and correct assertions.
- [x] Former TC-010 / TC-011 (`--from bogus-step` / `--from regression-gate`
  tests): removed entirely.

### `event-journal-operator-event.test.ts`

- [x] In `makeOperatorEventLine()`: `fromStep` is now optional.
- [x] **TC-009-a, TC-009-b**: pass `fromStep` explicitly for backward-compat testing.
- [x] **TC-009-c**: uses one record with `fromStep` and one without.
- [x] **TC-024** (round-trip): `fromStep` is absent from new-style record;
  asserted as `undefined` in the folded result.

### `command-registry-reopen.test.ts`

- [x] **TC-004-registry**: exits ARG_ERROR when `--reason` is absent.
- [x] **TC-012**: verifies `--from` is NOT a declared flag and providing it still
  causes ARG_ERROR (via missing --reason check).
- [x] **TC-010-registry**: reopen has `worktreeGuard: true` and positional slug.
- [x] **TC-024-registry**: handler does not exit with ARG_ERROR when `--reason`
  is provided (only `--reason` required now).

**Acceptance Criteria**:
- `reopen-command.test.ts` has no reference to `callPrepare`, `makeRuntime`,
  `makeEventBus`, or `PrepareResult`.
- `reopen-command.test.ts` has no reference to `resolveResumeStep`,
  `buildAllowedStepSet`, `parseRequestMd`, or `loadConfig`.
- `reopen-command.test.ts` TC labels match test-cases.md TC numbers (TC-001,
  TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-010, TC-011,
  TC-015, TC-020, TC-021, TC-029, TC-030).
- TC-009 asserts `patch["pid"]` is `null`.
- TC-010 + TC-011 assert `fromStep` is absent from the operator event record.
- `event-journal-operator-event.test.ts` TC-024 omits `fromStep` from the
  new-style record and confirms it is not asserted in the folded result.
- `command-registry-reopen.test.ts` TC-012 verifies `--from` is rejected on
  `job reopen`.
- All tests pass.

---

## T-07: Typecheck and test green verification

**Files**: all modified files.

- [x] Run `bun run typecheck` — zero type errors.
- [x] Run `bun run test` — all 840 test files pass, zero failures.
- [x] Confirm `lifecycle-reopen.test.ts` TC-016 passes with
  `status: "awaiting-resume"`.
- [x] Confirm B-17 test in `core-invariants.test.ts` passes:
  - liveness check (`candidates.length > 0`) succeeds because `reopen.ts`
    still contains `{ allowReopen: true }`.
  - no violation: the literal appears only in `reopen.ts`.
- [x] Confirm `reopen-command.test.ts` TC-001 returns `0` and transitions to
  `"awaiting-resume"`.
- [x] Confirm `reopen-command.test.ts` TC-015 still passes (ResumeCommand
  rejects `awaiting-archive`).

**Notes on test files changed beyond the spec'd test files**:
- `tests/unit/core/command/reopen-terminal-slug.test.ts`: updated constructor
  from 4-arg to 2-arg to match new `ReopenCommand` signature.
- `tests/dispatch-workflow-reopen-action.test.ts`: updated TC-R02 assertions to
  match new two-step workflow contract (job reopen → job resume).
- `src/cli/__tests__/from-flag-no-enum.test.ts`: TC-004 updated to assert `--from`
  is NOW rejected (was accepted); TC-014 updated to assert `--from` not in Options
  block (was "custom reviewers mentioned").

**Acceptance Criteria**:
- `bun run typecheck` exits `0`.
- `bun run test` exits `0` with no failing tests.
