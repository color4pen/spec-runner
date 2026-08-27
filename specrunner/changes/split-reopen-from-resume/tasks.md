# Tasks: split-reopen-from-resume

## T-01: Update `REOPEN_TRANSITIONS` target and TC-016

**Files**:
- `src/state/lifecycle.ts`
- `src/state/__tests__/lifecycle-reopen.test.ts`

- [ ] In `lifecycle.ts`, change `REOPEN_TRANSITIONS` so that
  `"awaiting-archive"` maps to `new Set(["awaiting-resume"])` (was
  `new Set(["running"])`).
- [ ] Update the D1 comment above `REOPEN_TRANSITIONS` to say
  `awaiting-archive → awaiting-resume is permitted only through an explicit
  operator action` (remove `running` from the prose).
- [ ] Update `transitionJob`'s JSDoc `@param opts.allowReopen` comment to
  reflect `awaiting-resume` as the permitted target.
- [ ] In `lifecycle-reopen.test.ts` TC-016: change the `transitionJob` call
  target from `"running"` to `"awaiting-resume"`:
  `transitionJobWithOpts(state, "awaiting-resume", ctx, { allowReopen: true })`.
- [ ] Update TC-016 assertion from `expect(result.state.status).toBe("running")`
  to `expect(result.state.status).toBe("awaiting-resume")`.
- [ ] In TC-016-b, update the call target to `"awaiting-resume"` with
  `{ allowReopen: false }` — it must still throw.
- [ ] TC-002 and TC-017 assertions (testing `awaiting-archive → running` is
  forbidden by the general guard) are unchanged — do not modify them.

**Acceptance Criteria**:
- `canTransition("awaiting-archive", "running")` still returns `false`.
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

- [ ] Change `fromStep: string` to `fromStep?: string` in `OperatorEventRecord`
  (make it optional for backward compatibility with existing journal records).
- [ ] Update the JSDoc comment on `fromStep` to say it is optional: was recorded
  from `--from`; step selection has moved to `resume`.

### `src/core/command/reopen.ts`

- [ ] Remove `extends CommandRunner` from `ReopenCommand`; remove the
  `import { CommandRunner, type PrepareResult } from "./runner.js"` import.
- [ ] Remove `RuntimeStrategy` and `EventBus` from the constructor. New
  signature: `constructor(private readonly slug: string, private readonly
  options: ReopenOptions)`.
- [ ] Remove `from: string` from `ReopenOptions` (D3: `--from` is removed).
- [ ] Remove all imports that were only needed for pipeline execution:
  `resolveResumeStep` and `buildAllowedStepSet` from `resume/resolve-step.js`,
  `parseRequestMd` from `parser/request-md.js`,
  `loadConfig` from `config/store.js`,
  `resolveRepoRoot` from `util/repo-root.js`,
  `resolveLivenessWorktreePath` from `resume/resolve-worktree-path.js`,
  `RuntimeStrategy` from `port/runtime-strategy.js`,
  `EventBus` from `event/event-bus.js`.
- [ ] Remove the `PrepareError` inner class (no longer needed — `execute()` returns
  exit codes directly without throwing).
- [ ] Implement `async execute(): Promise<number>` (public) with this sequence:
  1. `setLogLevel(this.options.logLevel ?? "default")`; `cwd = this.options.cwd ?? process.cwd()`.
  2. **Worktree guard**: `detectSpecrunnerWorktree(cwd)`; if `isSpecrunnerWorktree: true`
     → `logError(guardErr.message)`, `stderrWrite(hint)`, return `2`.
  3. **Resolve job state**: `resolveJobStateBySlug(slug, cwd)` with the same
     fallback through `JobStateStore.list` / `JobStateStore.resolveId` /
     `loadStateByJobId` as the current `prepare()` implementation. On resolution
     failure → return `1` or `2` as appropriate (terminal-slug → `1`, not-found → `1`,
     other resolution error → `2`).
  4. **Status gate**: if `state.status !== "awaiting-archive"` → `logError(...)`
     → return `1`.
  5. **PR gate**: if no `state.pullRequest?.number` → `logError(...)` → return `1`.
     If `!this.options.githubClient` → `logError(...)` → return `1`.
     Call `getPullRequest`; on throw → `logError(...)` → return `1`.
     If `prState === "MERGED"` → `logError(...)` → return `1`.
     If `prState === "CLOSED"` → `logError(...)` → return `1`.
  6. **Build state store**: same `resolveStateStoreByJobId` / `noWorktree` branching
     as current implementation. On missing sidecar → `logError(...)` → return `1`.
  7. **Append operator event** (before transition — durability ordering):
     ```
     await store.appendOperatorEvent({
       type: "operator-event",
       action: "reopen",
       reason: this.options.reason,
       ts: new Date().toISOString(),
     });
     ```
     Note: `fromStep` is omitted (field is now optional; new events do not record it).
  8. **Transition** `awaiting-archive → awaiting-resume`:
     ```
     const { state: transitioned } = transitionJob(
       state, "awaiting-resume",
       { trigger: "reopen", reason: this.options.reason,
         patch: { error: null, resumePoint: null, mainCheckoutDrift: null, pid: null } },
       { allowReopen: true },
     );
     await store.persist(transitioned);
     ```
     On `transitionJob` or `persist` failure → `logError(...)` → return `1`.
  9. **Log success**: `logInfo(\`Job '${slug}' is now awaiting-resume. Run 'job resume ${slug} --from <step>' to continue.\`)`.
  10. Return `0`.
- [ ] Update the file-level JSDoc to describe the new contract: "transition
  only — no pipeline execution".
- [ ] Ensure `{ allowReopen: true }` literal is present in the `transitionJob`
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

- [ ] Remove imports: `bootstrap` from `./bootstrap.js`, `EventBus` from
  `../core/event/event-bus.js`, `wireProgressDisplay` from `./progress.js`.
- [ ] Remove the `resolveHeartbeatInterval` helper function.
- [ ] Remove `from: string` from the `ReopenOptions` interface in this file.
- [ ] Remove the `resolveJobStateBySlug` pre-resolution call (no longer needed;
  `ReopenCommand` resolves state internally).
- [ ] Remove the `bootstrap(...)` call and all references to `runtime` and `config`.
- [ ] Simplify `runReopenCore`:
  1. Call `setLogLevel(options.logLevel ?? "default")` for early error logging.
  2. Resolve GitHub client (keep existing token resolution: optional config
     load for host/baseUrl → `resolveGitHubToken` → `createGitHubClient`; on
     any failure → `githubClient = null`).
  3. Create `new ReopenCommand(slug, { reason: options.reason, githubClient,
     logLevel: options.logLevel, cwd: options.cwd, json: options.json,
     noWorktree: options.noWorktree })` and call `.execute()`.
  4. Return the exit code; wrap in try/catch that returns `1` on unexpected
     throws.
- [ ] Remove the `progress.dispose()` call (no progress display).
- [ ] Keep `runReopen` (calls `process.exit(await runReopenCore(...))`).

### `src/cli/command-registry.ts`

- [ ] Remove `from: { type: "string" }` from the `reopen` subcommand `flags`.
- [ ] Remove the `const fromStep = ...` variable and the
  `if (!fromStep) { logError(...); process.exit(ARG_ERROR); }` guard from the
  handler.
- [ ] Remove `from: fromStep` from the `runReopen(...)` call arguments.
- [ ] Update `REOPEN_USAGE`:
  - Usage line: `Usage: specrunner job reopen <slug> --reason <text> [options]`.
  - Description: "Transitions an awaiting-archive job to awaiting-resume without
    executing the pipeline. The associated PR must be OPEN."
  - Remove the `--from <step>` entry from the Options block.
  - Add a note: "After reopen, run 'specrunner job resume <slug> --from <step>
    [--prompt ...]' to start pipeline execution."
- [ ] Update `help.summary` to
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

- [ ] In the `elif [ "$ACTION" = "reopen" ]` branch, after the SLUG extraction,
  replace the single `bun ./bin/specrunner.ts job reopen "$SLUG" --from "$FROM"
  --reason "$REASON"` line with two sequential calls:
  ```bash
  bun ./bin/specrunner.ts job reopen "$SLUG" --reason "$REASON"
  set -- --from "$FROM"
  [ -n "$PROMPT" ] && set -- "$@" --prompt "$PROMPT"
  bun ./bin/specrunner.ts job resume "$SLUG" "$@"
  ```
  (Or equivalent conditional expansion matching the existing `action=resume`
  pattern in the workflow.)
- [ ] Keep the `if [ -z "$FROM" ] || [ -z "$REASON" ]; then exit 1; fi` guard.
- [ ] Update the inline comment to reflect the new two-step contract.

**Acceptance Criteria**:
- `action=reopen` runs `job reopen` (lifecycle) then `job resume` (execution).
- `--reason` is passed to `job reopen`; `--from` is passed to `job resume`.
- If `job reopen` fails (non-zero exit), the shell exits before `job resume`
  runs (fail-fast; no implicit `|| true`).
- Optional `$PROMPT` is forwarded to `job resume` when non-empty.

---

## T-05: Update guide and conformance documentation

**Files**:
- `src/core/command/guide.ts`
- `architecture/conformance.md`

### `src/core/command/guide.ts`

- [ ] In the `escalation` topic, locate section 3 ("awaiting-archive からの再開").
- [ ] Replace the single-command code block with the two-step flow:
  ```
  # Step 1: lifecycle 遷移のみ（pipeline は起動しない）
  specrunner job reopen <slug> --reason "<理由>"

  # Step 2: pipeline 再開（--from / --prompt / --adopt-commits 等が使える）
  specrunner job resume <slug> --from <step> [--prompt "<修正指示>"] [--adopt-commits] [--apply-canon]
  ```
- [ ] Replace the constraint note `"**reopen の制約**: --apply-canon /
  --adopt-commits / --detach / --prompt は使えない。--from と --reason が必須。"` with:
  `"**reopen の制約**: --reason のみ必須。pipeline 実行の指定（--from / --prompt /
  --apply-canon / --adopt-commits）は resume に渡す。"`

### `architecture/conformance.md`

- [ ] Locate the B-17 row in the invariants table (§ (A) 決定的レビュー).
- [ ] Append a parenthetical to the grep-check description noting the guarded
  transition is `awaiting-archive → awaiting-resume`:
  change
  `{ allowReopen: true } が src/core/command/reopen.ts 以外から渡されていないか`
  to
  `{ allowReopen: true } が src/core/command/reopen.ts 以外から渡されていないか（ガード対象: awaiting-archive → awaiting-resume）`.

**Acceptance Criteria**:
- `specrunner guide escalation` output describes the two-step flow (reopen for
  transition, resume for execution).
- The guide no longer mentions `--from` as a `reopen` option.
- `architecture/conformance.md` B-17 row accurately states that the guarded
  transition is `awaiting-archive → awaiting-resume`.

---

## T-06: Update test suite

**Files**:
- `src/core/command/__tests__/reopen-command.test.ts`
- `src/store/__tests__/event-journal-operator-event.test.ts`
- `src/cli/__tests__/command-registry-reopen.test.ts`

### `reopen-command.test.ts` — structural rewrite

The file currently tests `prepare()` (accessed via type cast) on a
`CommandRunner` subclass.  After T-02, `ReopenCommand` exposes only `execute()`.

- [ ] Remove imports of `PrepareResult` from `runner.js`.
- [ ] Remove `callPrepare()`, `callResumePrepare()`, `makeRuntime()`,
  `makeEventBus()` helpers.
- [ ] Remove mocks for `resolveResumeStep`, `buildAllowedStepSet`,
  `parseRequestMd`, `loadConfig`, `resolveRepoRoot` (these are no longer
  imported by `reopen.ts`).
- [ ] Remove `from` from all `ReopenCommand` constructor call sites.
- [ ] **TC-001**: call `cmd.execute()`; assert return `0`; assert `transitionJob`
  called with `("awaiting-resume", ..., { allowReopen: true })`; assert
  `persist` called with a state where `status === "awaiting-resume"`.
- [ ] **TC-003** (ResumeCommand pin): keep — it tests `ResumeCommand`; remove
  only the `ReopenCommand`-specific helper references.
- [ ] **TC-005**, **TC-006**, **TC-007**: call `cmd.execute()`; assert return `1`;
  assert `persist` not called (or not called with `status: "awaiting-resume"`
  for the rejection path — rejection must happen before the persist step).
- [ ] **TC-008-a** (evidence preserved): call `cmd.execute()`; configure
  `transitionJob` mock to return a state that carries over `steps` and
  `reviewerStatuses`; assert `persist` was called with a state preserving them.
- [ ] **TC-013**, **TC-014**, **TC-015**: call `cmd.execute()`; assert return `1`.
- [ ] **TC-018** (worktree guard): call `cmd.execute()`; assert return `2`.
- [ ] **TC-020** (patch fields): assert `transitionJob` called with
  `patch: { error: null, resumePoint: null, mainCheckoutDrift: null, pid: null }`.
  Change `expect(patch["pid"]).toBeDefined()` to `expect(patch["pid"]).toBeNull()`.
- [ ] **TC-021** (operator event before persist): call `cmd.execute()`; assert
  `appendOperatorEvent` call order before `persist` using `invocationCallOrder`.
  Assert the event record has `type: "operator-event"`, `action: "reopen"`,
  `reason: "post-review fix"`. Assert `fromStep` is NOT in the record
  (i.e., `operatorEventArg?.["fromStep"]` is `undefined`).
- [ ] **TC-010** (former `--from bogus-step` test): replace with a test that
  calls `cmd.execute()` on a valid job and asserts exit `0` (smoke test of
  the full new `execute()` flow without `--from`).

### `event-journal-operator-event.test.ts`

- [ ] In `makeOperatorEventLine()`: make `fromStep` optional. When `fromStep`
  is not provided in `overrides`, omit the field from the serialized JSON line.
- [ ] **TC-009-a**: pass `fromStep: "implementer"` explicitly to
  `makeOperatorEventLine` so the backward-compatibility read is still tested
  (old records still have `fromStep`). Keep `expect(evt["fromStep"]).toBe("implementer")`.
- [ ] **TC-009-b**: same — pass `fromStep: "spec-review"` explicitly.
- [ ] **TC-009-c** (multiple records): use at least one record with `fromStep`
  and one without to confirm both parse correctly.
- [ ] **TC-024** (round-trip): remove `fromStep: "spec-review"` from the
  `OperatorEventRecord` literal. After `fold()`, do not assert `fromStep` in
  the collected event (or assert it is `undefined`).

### `command-registry-reopen.test.ts`

- [ ] **TC-004** ("without `--reason` exits ARG_ERROR"): remains valid —
  update any `from`-related setup that was only there to satisfy the old
  `--from` requirement. Verify the handler still exits ARG_ERROR when `reason`
  is absent.
- [ ] **TC-019** (was "without `--from` exits ARG_ERROR"): replace with a
  test verifying that providing `--from` to `job reopen` exits with ARG_ERROR
  (the flag is no longer registered, so the parser should reject it).
- [ ] **TC-010** ("Reopen does not invoke cancel-style cleanup"): update any
  handler call setup to omit `from`. Verify the test still passes.

**Acceptance Criteria**:
- `reopen-command.test.ts` has no reference to `callPrepare`, `makeRuntime`,
  `makeEventBus`, or `PrepareResult`.
- `reopen-command.test.ts` has no reference to `resolveResumeStep`,
  `buildAllowedStepSet`, `parseRequestMd`, or `loadConfig`.
- TC-020 asserts `patch["pid"]` is `null`.
- TC-021 asserts `fromStep` is absent from the operator event record.
- `event-journal-operator-event.test.ts` TC-024 omits `fromStep` from the
  new-style record and confirms it is not asserted in the folded result.
- `command-registry-reopen.test.ts` TC-019 verifies `--from` is rejected on
  `job reopen`.
- All tests pass.

---

## T-07: Typecheck and test green verification

**Files**: all modified files.

- [ ] Run `bun run typecheck` — zero type errors.
- [ ] Run `bun run test` — all tests pass, zero failures.
- [ ] Confirm `lifecycle-reopen.test.ts` TC-016 passes with
  `status: "awaiting-resume"`.
- [ ] Confirm B-17 test in `core-invariants.test.ts` passes:
  - liveness check (`candidates.length > 0`) succeeds because `reopen.ts`
    still contains `{ allowReopen: true }`.
  - no violation: the literal appears only in `reopen.ts`.
- [ ] Confirm `reopen-command.test.ts` TC-001 returns `0` and transitions to
  `"awaiting-resume"`.
- [ ] Confirm `reopen-command.test.ts` TC-003 still passes (ResumeCommand
  rejects `awaiting-archive`).

**Acceptance Criteria**:
- `bun run typecheck` exits `0`.
- `bun run test` exits `0` with no failing tests.
