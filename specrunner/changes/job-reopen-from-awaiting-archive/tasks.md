# Tasks: job-reopen-from-awaiting-archive

## T-01: Add the operator-scoped reopen FSM edge to lifecycle

- [ ] In `src/state/lifecycle.ts`, add
      `export const REOPEN_TRANSITIONS: ReadonlyMap<JobStatus, ReadonlySet<JobStatus>>`
      = a `Map` with the single entry `["awaiting-archive", new Set(["running"])]`.
- [ ] Add an optional 4th parameter to `transitionJob`, e.g.
      `opts?: { allowReopen?: boolean }`.
- [ ] In `transitionJob`, change the validation so a transition is allowed when
      `VALID_TRANSITIONS.get(state.status)?.has(to)` **or**
      (`opts?.allowReopen === true` **and** `REOPEN_TRANSITIONS.get(state.status)?.has(to)`).
      Keep the same-status noop short-circuit and the thrown-error path otherwise.
- [ ] Do **not** modify `canTransition`, `VALID_TRANSITIONS`, `TERMINAL_STATUSES`,
      or `ACTIVE_STATUSES`.

**Acceptance Criteria**:
- `canTransition("awaiting-archive", "running")` still returns `false`.
- `transitionJob(state, "running", ctx)` (no opts) on an `awaiting-archive`
  state throws, exactly as before.
- `transitionJob(state, "running", ctx, { allowReopen: true })` on an
  `awaiting-archive` state succeeds, appends a history entry, applies the patch,
  and sets status to `running`.
- `bun run typecheck` passes with no new errors.

## T-02: Add the OperatorEventRecord journal type and append/fold plumbing

- [ ] In `src/store/event-journal.ts`, add an `OperatorEventRecord` interface:
      `{ type: "operator-event"; action: "reopen"; reason: string; fromStep: string; ts: string }`
      and add it to the `EventRecord` union.
- [ ] Add `operatorEvents: OperatorEventRecord[]` to the `FoldResult` interface.
- [ ] In `fold()`, collect `operatorEvents` in chronological order (mirror the
      existing `lineage` handling: push on `obj["type"] === "operator-event"`),
      and include `operatorEvents` in the returned object. Keep unknown types
      silently ignored.
- [ ] In `src/store/job-journal.ts`, update the hand-built `FoldResult` literal in
      the `ENOENT` branch of `persist()` (the `{ steps: {}, history: [], ... }`
      object) to include `operatorEvents: []`.
- [ ] Add `JobJournal.appendOperatorEvent(record: OperatorEventRecord): Promise<void>`
      that calls `appendEventRecord(this.resolver.getEventsPath(), record)`
      (mirror `appendLineage` — journal-only, no `state.json` mutation).
- [ ] Surface it on `JobStateStore` as
      `appendOperatorEvent(record): Promise<void>` delegating to `this._journal`
      (mirror `appendLineage` / `appendInterruption`).

**Acceptance Criteria**:
- `fold()` of a journal containing an `operator-event` line returns it in
  `operatorEvents` with all fields intact.
- `fold()` of a journal with no operator events returns `operatorEvents: []`.
- Existing `fold()` behavior for step-attempt / transition / interruption /
  lineage / unknown-type lines is unchanged (existing tests pass).
- `bun run typecheck` passes.

## T-03: Implement ReopenCommand (core)

- [ ] Create `src/core/command/reopen.ts` with `ReopenCommand extends CommandRunner`,
      constructed with `(runtime, events, slug, options)` where `options` includes
      at least `{ from: string; reason: string; logLevel?; cwd?; json?; noWorktree?; repoRoot? }`.
- [ ] Model the structure on `src/core/command/resume.ts` (reuse its
      `PrepareError` pattern for controlled exit codes 1/2 and the `execute()`
      override that maps `PrepareError` to its exit code).
- [ ] In `prepare()`:
  - [ ] Set log level; resolve `cwd`.
  - [ ] Worktree guard: reject with exit 2 when invoked from inside a specrunner
        worktree (`detectSpecrunnerWorktree`), same as `ResumeCommand.prepare()`.
  - [ ] Resolve job state by slug with short-Job-ID fallback (reuse
        `resolveJobStateBySlug` + `JobStateStore.resolveId` + `loadStateByJobId`,
        as resume does).
  - [ ] Status gate: if `state.status !== "awaiting-archive"`, reject with exit 1
        and a message naming the current status (call out `archived` / `canceled`
        as non-reopenable).
  - [ ] PR gate: if `state.pullRequest?.number` is absent, reject (exit 1, "no PR
        to reopen"). Otherwise call `githubClient.getPullRequest(owner, repo, number)`
        using `state.repository.owner` / `state.repository.name`. Reject (exit 1)
        when the PR state is `MERGED` (message: already merged) or `CLOSED`
        (message: closed). Reject (exit 1) when the query fails or the client is
        unavailable (fail-closed; message points to `specrunner login`). Proceed
        only on `OPEN`.
  - [ ] Resolve the start step from `--from` via `buildAllowedStepSet(state.reviewers)`
        + `resolveResumeStep(this.options.from, null, state.step, allowedSteps, state.reviewers)`
        (reuse `src/core/resume/resolve-step.ts`). Reject with exit 1 on an
        invalid step.
  - [ ] Parse `request.md` (reuse `resolveRequestPath` + `parseRequestMd`), as
        resume does, before committing to `running`.
  - [ ] Build the job state store (reuse `resolveStateStoreByJobId`, or the
        no-worktree store construction, exactly as resume does).
  - [ ] Append the operator event **before** persisting the transition:
        `store.appendOperatorEvent({ type: "operator-event", action: "reopen",
        reason: this.options.reason, fromStep: startStep, ts: new Date().toISOString() })`.
  - [ ] Transition `awaiting-archive → running` via
        `transitionJob(state, "running", { trigger: "reopen", reason: <reason>,
        patch: { error: null, resumePoint: null, mainCheckoutDrift: null, pid: process.pid } },
        { allowReopen: true })` and persist it.
  - [ ] Return a `PrepareResult` with `jobState`, `startStep`, `request`, `config`,
        `slug`, `logLevel`, `repoRoot`, and `workspaceOpts` (resolve the existing
        worktree path exactly as resume does). Do **not** set `resumeContext`; do
        **not** set `resumePrompt`.
- [ ] Do not clear or rewrite `steps`, `reviewerStatuses`, `decisions`,
      `biteEvidence`, or any artifact file.

**Acceptance Criteria**:
- Reopen on an `awaiting-archive` + OPEN-PR job returns a `PrepareResult` whose
  `startStep` equals the resolved `--from` step and whose `jobState.status` is
  `running`.
- Reopen on a merged-PR job, a no-PR job, an `archived` job, and a `canceled`
  job each throws `PrepareError` with the documented exit code, and the persisted
  status is unchanged.
- The transition patch clears only `error` / `resumePoint` / `mainCheckoutDrift`
  / `pid`; `steps` and `reviewerStatuses` are untouched.
- `bun run typecheck` passes.

## T-04: Implement the CLI entry (src/cli/reopen.ts)

- [ ] Create `src/cli/reopen.ts` mirroring `src/cli/resume.ts`:
      `runReopenCore(slug, options)` and `runReopen(slug, options)` (the latter
      `process.exit`s). Bootstrap the runtime via `bootstrap(cwd, repo, repoRoot)`,
      wire the progress display, and run `new ReopenCommand(...).execute()`.
- [ ] Construct a `GitHubClient` for the PR-state gate (resolve host/token as
      `job ls` does: `resolveGitHubHost`, `resolveGitHubApiBaseUrl`,
      `resolveGitHubToken`, `createGitHubClient`) and pass it into `ReopenCommand`
      (via options or constructor). When no token is available, the client is
      absent → the PR gate fails closed (per T-03).
- [ ] Map `SpecRunnerError` to `Error:`/`Hint:` output with its exit code, as
      resume does.

**Acceptance Criteria**:
- `runReopenCore` returns `0` on a successful reopen path and a non-zero code on
  each rejection path.
- `bun run typecheck` passes.

## T-05: Register the reopen subcommand in the CLI registry

- [ ] In `src/cli/command-registry.ts`, add a `reopen` entry under
      `job.subcommands` with:
  - `flags`: `from` (`type: "string"`, `values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]`),
    `reason` (`type: "string"`), `verbose`, `quiet`, `json`, `no-worktree`.
  - `positional`: `{ name: "slug", required: true }`.
  - A handler that: rejects (exit `EXIT_CODE.ARG_ERROR`) when `--from` or
    `--reason` is missing; resolves log level; and calls `runReopen(slug, {...})`.
- [ ] Add `"reopen"` to `job.guardedSubcommands`.
- [ ] Add a `REOPEN_USAGE` string (follow the `ARCHIVE_USAGE` / `PRUNE_USAGE`
      pattern) and reference it on the subcommand.

**Acceptance Criteria**:
- `job reopen <slug> --from <step> --reason <text>` dispatches to `runReopen`.
- `job reopen <slug> --from <step>` (missing `--reason`) exits with the argument
  error code without running the pipeline.
- `bun run typecheck` passes.

## T-06: Verify approval invalidation on the real routing path; add a tooth (D5)

- [ ] Investigate, by reading the actual routing code
      (`src/core/pipeline/parallel-review-round.ts`, `reviewer-status.ts`,
      `reverification.ts`, and the transition wiring in `pipeline/types.ts`),
      whether any path can reuse a pre-reopen approval on a *new* revision after
      reopen re-runs.
- [ ] If (and only if) a reuse path is found that `commitOid` comparison does not
      cover, add explicit invalidation for that path and document it in a code
      comment referencing D5. Otherwise, add no invalidation code.
- [ ] Add a test that pins the intended behavior on the real functions:
  - [ ] `selectPendingMembers` with an approved member at `oldSha` and
        `baselineCommit = newSha` returns that member as pending.
  - [ ] `conformanceApprovedForVerifiedRevision` returns `false` when the latest
        conformance `commitOid` differs from the latest verification `commitOid`.

**Acceptance Criteria**:
- A written note (in this task's PR description or a code comment) states whether
  an uncovered reuse path exists; if none, no invalidation code is added.
- The two pin tests pass and fail if the respective binding check is weakened to
  ignore `commitOid`.
- `bun test` passes.

## T-07: Test — reopen transitions and preserves evidence (AC1)

- [ ] Add a test for `ReopenCommand.prepare()` (or `runReopenCore`) with an
      `awaiting-archive` job that has an OPEN PR and existing
      `spec-review-result-001.md` + populated `events.jsonl`.
- [ ] Assert the persisted status becomes `running` and `startStep` equals the
      resolved `--from`.
- [ ] Assert the prior `events.jsonl` lines are still present after prepare and
      that `state.steps` / `reviewerStatuses` were not cleared.
- [ ] Assert (via `src/util/paths.ts` helpers) that the next `spec-review`
      iteration path is `...-002.md`, i.e. re-execution appends rather than
      overwrites (assert on the iteration-number computation, not a full pipeline
      run).

**Acceptance Criteria**:
- Test passes with the implementation; fails if reopen clears `steps` or rewrites
  the journal.

## T-08: Test — reopen rejects ineligible jobs (AC2)

- [ ] Add tests asserting `ReopenCommand.prepare()` rejects with the documented
      non-zero exit for: PR state `MERGED`; status `archived`; status `canceled`;
      no recorded PR; and PR-state query failure / absent client (fail-closed).
- [ ] Assert the persisted status is unchanged in each rejection case.

**Acceptance Criteria**:
- All rejection cases exit non-zero and leave state unchanged.
- `bun test` passes.

## T-09: Test — reopen writes the operator event (AC3)

- [ ] Add a test that runs `ReopenCommand.prepare()` and then folds the job's
      `events.jsonl`, asserting `operatorEvents` contains one record with
      `action: "reopen"`, the supplied `reason`, the resolved `fromStep`, and a
      timestamp.
- [ ] Assert the operator-event line is present in addition to (not instead of)
      the `awaiting-archive → running` transition record.

**Acceptance Criteria**:
- Test passes; fails if the operator event is missing or omits `reason`.

## T-10: Test — job resume still rejects awaiting-archive → running (AC5)

- [ ] Add/extend a test asserting `ResumeCommand.prepare()` on an
      `awaiting-archive` job throws `PrepareError(1)` and does not transition the
      job to `running`.
- [ ] Add a unit assertion that `canTransition("awaiting-archive", "running")`
      is `false` and `transitionJob(..., "running", ctx)` without `allowReopen`
      throws.

**Acceptance Criteria**:
- Both tests pass and would fail if `VALID_TRANSITIONS` were widened.

## T-11: Final verification

- [ ] Run `bun run build`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun test`.

**Acceptance Criteria**:
- All three commands exit 0.
