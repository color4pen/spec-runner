# Spec: job-reopen-from-awaiting-archive

## Requirements

### Requirement: reopen transitions an awaiting-archive job to running

The `job reopen <slug> --from <step> --reason <text>` command SHALL transition a
job whose status is `awaiting-archive` to `running` and re-run the pipeline
starting from the given step. The `awaiting-archive → running` edge MUST be
permitted only through the reopen operation.

#### Scenario: reopen restarts an awaiting-archive job from the requested step

**Given** a job with status `awaiting-archive` and an OPEN, unmerged PR
**When** the operator runs `job reopen <slug> --from spec-review --reason "review fix"`
**Then** the job status becomes `running`
**And** the pipeline begins execution at the `spec-review` step

#### Scenario: the general transition guard still forbids the edge

**Given** a job with status `awaiting-archive`
**When** `canTransition("awaiting-archive", "running")` is evaluated
**Then** it returns `false`
**And** `transitionJob` throws for that transition unless the reopen opt-in is passed

### Requirement: job resume still rejects awaiting-archive → running

The `job resume` command SHALL continue to reject resuming a job whose status is
`awaiting-archive`. Reopen MUST NOT make this transition available to resume.

#### Scenario: resume of an awaiting-archive job is rejected

**Given** a job with status `awaiting-archive`
**When** the operator runs `job resume <slug>`
**Then** the command exits with a non-zero status
**And** the job status remains `awaiting-archive`

### Requirement: reopen requires --from and --reason

The reopen command SHALL require both `--from` and `--reason`. Invocation missing
either flag MUST fail with an argument error and MUST NOT change job state.

#### Scenario: reopen without --reason is an argument error

**Given** a job with status `awaiting-archive`
**When** the operator runs `job reopen <slug> --from implementer` with no `--reason`
**Then** the command exits with an argument error
**And** the job status remains `awaiting-archive`

### Requirement: reopen rejects ineligible jobs

Reopen SHALL reject, with a non-zero exit and a clear message, a job whose PR is
merged, and a job whose status is `archived` or `canceled` (or any status other
than `awaiting-archive`). A job with no recorded PR, or whose PR state cannot be
determined, MUST also be rejected (fail-closed).

#### Scenario: reopen of a job with a merged PR is rejected

**Given** a job with status `awaiting-archive` whose PR state is `MERGED`
**When** the operator runs `job reopen <slug> --from implementer --reason "x"`
**Then** the command exits with a non-zero status and reports the PR is merged
**And** the job status is unchanged

#### Scenario: reopen of an archived job is rejected

**Given** a job with status `archived`
**When** the operator runs `job reopen <slug> --from implementer --reason "x"`
**Then** the command exits with a non-zero status and reports the status is not reopenable
**And** the job status remains `archived`

#### Scenario: reopen of a canceled job is rejected

**Given** a job with status `canceled`
**When** the operator runs `job reopen <slug> --from implementer --reason "x"`
**Then** the command exits with a non-zero status
**And** the job status remains `canceled`

### Requirement: reopen preserves prior evidence and appends new iterations

Reopen SHALL NOT overwrite, truncate, or delete existing evidence (review,
verification, attestation, journal, `events.jsonl`). Re-execution MUST add new
iterations alongside the prior ones.

#### Scenario: re-run after reopen adds a new iteration without touching prior evidence

**Given** an `awaiting-archive` job whose change folder already holds
`spec-review-result-001.md` and a populated `events.jsonl`
**When** the job is reopened from `spec-review` and the step re-runs
**Then** `spec-review-result-001.md` is unchanged
**And** the new run is written as `spec-review-result-002.md`
**And** existing `events.jsonl` lines are preserved and new records are appended

### Requirement: reopen records an operator event in the journal

Reopen SHALL append an operator event to the job's `events.jsonl` recording the
action, the `--reason`, the from-step, and the execution timestamp. The record
MUST be appended without rewriting existing journal lines.

#### Scenario: the reopen operator event is present in the journal

**Given** a job reopened with `--from implementer --reason "post-review fix"`
**When** the journal is folded
**Then** it contains an operator event with action `reopen`, reason
`"post-review fix"`, from-step `implementer`, and a timestamp

### Requirement: reopen preserves the branch and PR

Reopen SHALL NOT delete the remote branch or close the PR, and MUST NOT invoke
cancel-style cleanup.

#### Scenario: the PR and branch survive a reopen

**Given** an `awaiting-archive` job with an OPEN PR on its feature branch
**When** the job is reopened and re-runs through pr-create
**Then** the remote branch still exists
**And** the existing OPEN PR is reused rather than duplicated or closed

### Requirement: reopen re-binds approvals to the new revision

After reopen, approvals bound to the pre-reopen revision SHALL NOT be reused by
routing on a new revision. Reviewer approvals and conformance approval MUST be
re-established against the current revision via the existing commit-binding
checks.

#### Scenario: a stale reviewer approval is not reused on a new revision

**Given** a reopened job whose reviewer was approved at commit `oldSha`
**And** the branch HEAD has advanced to `newSha`
**When** the reviewer coordinator selects pending members against the current HEAD
**Then** the reviewer bound to `oldSha` is treated as pending and re-runs

#### Scenario: stale conformance approval does not short-circuit re-verification

**Given** a reopened job whose latest conformance approval is bound to `oldSha`
**And** the latest verification run is bound to a different commit
**When** the verification→adr-gen / verification→pr-create guard is evaluated
**Then** the guard returns `false` and re-verification proceeds
