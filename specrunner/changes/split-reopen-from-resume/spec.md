# Spec: split-reopen-from-resume

## Requirements

### Requirement: reopen SHALL transition awaiting-archive to awaiting-resume without pipeline execution

`job reopen <slug> --reason <text>` SHALL transition the job from
`awaiting-archive` to `awaiting-resume` and exit cleanly.  No agent query, no
CLI step, no pipeline MUST be started as a result of the `reopen` command.

#### Scenario: successful reopen on OPEN-PR awaiting-archive job

**Given** a job with `status: "awaiting-archive"` and an associated PR in
`OPEN` state
**When** `job reopen <slug> --reason "human review feedback"` is executed
**Then** the job status is `awaiting-resume`
**And** no pipeline step is executed
**And** the process exits with code `0`

#### Scenario: reopen does not start the pipeline even when a start step is implied

**Given** a job with `status: "awaiting-archive"` and an OPEN PR
**When** `job reopen <slug> --reason "fix needed"` is executed
**Then** the process exits after persisting `status: "awaiting-resume"`
**And** no `setupWorkspace`, `buildDeps`, or pipeline `run` is called

---

### Requirement: reopen SHALL be refused for non-awaiting-archive or non-OPEN-PR jobs

The `reopen` command MUST refuse with exit code `1` if the job status is not
`awaiting-archive`, or if the associated PR is not in `OPEN` state, or if the
PR state cannot be confirmed.  The job state MUST NOT be modified in these
cases.

#### Scenario: reopen rejected for archived job

**Given** a job with `status: "archived"`
**When** `job reopen <slug> --reason "x"` is executed
**Then** the command logs an error and exits with code `1`
**And** no state transition is persisted

#### Scenario: reopen rejected for canceled job

**Given** a job with `status: "canceled"`
**When** `job reopen <slug> --reason "x"` is executed
**Then** the command exits with code `1`
**And** the job status remains `canceled`

#### Scenario: reopen rejected for merged PR

**Given** a job with `status: "awaiting-archive"` whose associated PR is in
`MERGED` state
**When** `job reopen <slug> --reason "x"` is executed
**Then** the command logs an error and exits with code `1`
**And** no state transition is persisted

#### Scenario: reopen rejected for closed (non-merged) PR

**Given** a job with `status: "awaiting-archive"` whose associated PR is in
`CLOSED` state
**When** `job reopen <slug> --reason "x"` is executed
**Then** the command exits with code `1`

#### Scenario: reopen fails closed when PR state is unavailable

**Given** a job with `status: "awaiting-archive"` and a recorded PR number
**When** `job reopen <slug> --reason "x"` is executed with no GitHub client
  or when the GitHub API call fails
**Then** the command exits with code `1` without modifying the job state

---

### Requirement: reopen SHALL preserve all prior evidence

The `reopen` transition patch MUST NOT clear or overwrite `steps`,
`reviewerStatuses`, `decisions`, or `biteEvidence`.  Existing iterations of
evidence remain intact.  Only run-control fields SHALL be reset:
`error`, `resumePoint`, `mainCheckoutDrift`, `pid`.

#### Scenario: evidence fields are preserved after reopen

**Given** a job with `status: "awaiting-archive"` that has prior step results
in `steps["spec-review"]` and approved entries in `reviewerStatuses`
**When** `job reopen <slug> --reason "post-review fix"` succeeds
**Then** the persisted state contains the original `steps["spec-review"]`
  entries
**And** the original `reviewerStatuses` entries are unchanged

#### Scenario: run-control fields are reset by reopen

**Given** a job with `status: "awaiting-archive"`
**When** `job reopen` succeeds and persists the transitioned state
**Then** the persisted state has `error: null`, `resumePoint: null`,
  `mainCheckoutDrift: null`, `pid: null`

---

### Requirement: reopen operator event SHALL be persisted before the state transition

The `appendOperatorEvent` write MUST complete before `transitionJob` result is
persisted.  This ensures the audit record survives even if the subsequent
persist fails.  The event SHALL contain `type: "operator-event"`,
`action: "reopen"`, `reason`, and `ts`.  The event SHALL NOT include `fromStep`
(step selection belongs to `resume`).

#### Scenario: operator event is durably recorded

**Given** a job eligible for reopen
**When** `job reopen <slug> --reason "human review"` succeeds
**Then** `appendOperatorEvent` is called with `{ type: "operator-event",
  action: "reopen", reason: "human review", ts: <ISO-timestamp> }`
**And** `appendOperatorEvent` completes before `persist(transitionedState)` is
  called

#### Scenario: operator event does not include fromStep

**Given** a successful reopen execution
**When** the `events.jsonl` is read back via `fold()`
**Then** the collected operator event has no `fromStep` field

---

### Requirement: reopen SHALL NOT accept `--from`

The `job reopen` command MUST NOT accept a `--from` flag.  Providing `--from`
on the `reopen` subcommand SHALL result in an argument error and exit code
indicating misuse.

#### Scenario: --from is rejected on reopen

**Given** the operator runs `job reopen <slug> --from spec-review --reason "x"`
**When** the CLI parses the command
**Then** the command exits with a non-zero code indicating an argument error
**And** the job state is not modified

---

### Requirement: resume SHALL be the execution entry point after reopen

After `job reopen` succeeds, `job resume <slug> --from <step>` MUST be the
mechanism to start pipeline execution.  `resume` SHALL accept `awaiting-resume`
status (already in `VALID_TRANSITIONS`).  All `resume` safety inputs
(`--prompt`, `--adopt-commits`, `--apply-canon`, `--wontfix`) SHALL apply
normally.

#### Scenario: resume executes the pipeline after reopen

**Given** a job transitioned to `awaiting-resume` by a successful `job reopen`
**When** `job resume <slug> --from code-fixer --prompt "指摘内容..."` is executed
**Then** the job transitions to `running`
**And** the pipeline starts from `code-fixer`
**And** the prompt is delivered to the `code-fixer` step

#### Scenario: resume --adopt-commits applies after reopen with uncommitted changes

**Given** a job transitioned to `awaiting-resume` by `job reopen`
**And** the worktree has commits not in the synthesizedCommits ledger
**When** `job resume <slug> --from <step> --adopt-commits` is executed
**Then** the unadopted commits are recorded in the ledger before the pipeline starts
**And** the pipeline runs normally

#### Scenario: resume directly on awaiting-archive is still refused

**Given** a job with `status: "awaiting-archive"` (not yet reopened)
**When** `job resume <slug>` is executed directly
**Then** the command exits with code `1` and logs a status gate error
**And** no transition occurs
**And** no pipeline starts

---

### Requirement: reopen transition SHALL use the REOPEN_TRANSITIONS opt-in

The `awaiting-archive → awaiting-resume` transition MUST be performed via
`transitionJob(..., "awaiting-resume", ctx, { allowReopen: true })`.
The `{ allowReopen: true }` literal MUST appear only in
`src/core/command/reopen.ts` (B-17 invariant).  `canTransition("awaiting-archive",
"awaiting-resume")` without the opt-in MUST return `false`.

#### Scenario: B-17 invariant preserved

**Given** the codebase after this change
**When** the architecture test B-17 greps for `allowReopen: true` in `src/`
**Then** the literal is found only in `src/core/command/reopen.ts`
**And** the liveness check passes (at least one match found)

#### Scenario: general guard still forbids awaiting-archive → awaiting-resume

**Given** a `JobState` with `status: "awaiting-archive"`
**When** `canTransition("awaiting-archive", "awaiting-resume")` is called
**Then** it returns `false`

#### Scenario: general guard still forbids awaiting-archive → running

**Given** a `JobState` with `status: "awaiting-archive"`
**When** `canTransition("awaiting-archive", "running")` is called
**Then** it returns `false`

---

### Requirement: Actions workflow SHALL compose reopen and resume explicitly

The `action=reopen` branch in the Actions dispatch workflow MUST execute
`job reopen` (lifecycle transition) and then `job resume` (pipeline execution)
as two separate sequential commands.  `--reason` SHALL be passed to `reopen`;
`--from` SHALL be passed to `resume`.

#### Scenario: Actions reopen dispatches two CLI commands

**Given** the `action=reopen` workflow path with `FROM`, `REASON`, and optionally
`PROMPT` inputs
**When** the workflow step runs
**Then** `bun ./bin/specrunner.ts job reopen "$SLUG" --reason "$REASON"` is
  called first
**And** `bun ./bin/specrunner.ts job resume "$SLUG" --from "$FROM" [--prompt
  "$PROMPT"]` is called second
**And** if `job reopen` exits non-zero, `job resume` is not executed
