# Spec: archive を 1 回で完結させ、merge 後の再 archive 契約を撤回する

## Requirements

### Requirement: plain archive shall complete the whole archive operation in a single run

Plain `job archive <slug>` and `job archive --from-issue <issue>` (both without
`--with-merge`) SHALL, in one execution, record the archive (move the change folder to the
archive location, commit it, and push it to the feature branch), transition the job from
`awaiting-archive` to `archived`, and run local cleanup (worktree teardown, liveness /
managed marker / sidecar removal, local feature branch deletion). The operation MUST NOT
require, expect, or instruct a second invocation. `--from-issue` resolves the slug from the
issue number and ultimately calls the same `runPlainArchive` function, so the single-run
guarantee applies equally to both invocation forms.

#### Scenario: awaiting-archive job with an OPEN PR completes in one run

**Given** a job in status `awaiting-archive` whose change folder is at the active location
and whose PR is still OPEN
**When** the operator runs `specrunner job archive <slug>` once
**Then** the change folder is moved to the archive location, an archive commit is pushed to
the feature branch, the job status becomes `archived`, local cleanup runs, and the command
exits with code 0

#### Scenario: success output does not instruct a second archive run

**Given** a job in status `awaiting-archive` with a recorded PR number
**When** plain archive records the archive successfully
**Then** the stdout output contains no instruction to re-run `job archive` after the PR is
merged, and contains no statement that the job remains in `awaiting-archive`

#### Scenario: --from-issue invocation completes in one run

**Given** a job in status `awaiting-archive` with a recorded pull-request number
**When** the operator runs `specrunner job archive --from-issue <issue>` once
**Then** the slug is resolved from the issue number, `runPlainArchive` is called exactly
once, the archive completes (folder move, commit/push, `archived` transition, cleanup), and
the command exits with code 0 — identical behaviour to `specrunner job archive <slug>`

#### Scenario: no further SpecRunner command is needed after the PR is merged

**Given** a job that plain archive has already transitioned to `archived`
**When** the operator merges the PR on GitHub and runs `specrunner job archive <slug>` again
**Then** the command short-circuits on the terminal status, reports that the job is already
finished, performs no archive recording, and exits with code 0

### Requirement: plain archive shall not read GitHub PR state

Plain archive SHALL determine its outcome exclusively from local job state and git facts.
It MUST NOT call any GitHub pull-request API (`getPullRequest`, `getCheckStatus`,
`mergePullRequest`, `listPullRequestFiles`), and the `archived` transition MUST NOT be
conditioned on a PR being merged, open, or closed.

#### Scenario: PR merge state is never queried during plain archive

**Given** a job in status `awaiting-archive` with a recorded PR number
**When** plain archive runs to completion
**Then** no GitHub pull-request API call is made at any point in the run

#### Scenario: archived transition happens while the PR is still OPEN

**Given** a job in status `awaiting-archive` whose PR has not been merged
**When** plain archive pushes the archive record successfully
**Then** the job is transitioned to `archived` without any merge confirmation

### Requirement: plain archive cleanup shall preserve the remote feature branch

Cleanup invoked from plain archive SHALL NOT delete the remote feature branch, because the
archive commit must remain reachable for the still-open PR. Cleanup invoked from
`job archive --with-merge` SHALL continue to delete the remote feature branch after a
successful merge. Deletion of the remote branch for plain archive is delegated to GitHub
governance (merge-time head-branch auto-deletion or manual operator action).

#### Scenario: plain archive keeps the remote branch

**Given** a job in status `awaiting-archive` with feature branch `change/foo-1234`
**When** plain archive completes and runs cleanup
**Then** the worktree, sidecars and the local branch `change/foo-1234` are removed, and no
`git push origin --delete change/foo-1234` is executed

#### Scenario: with-merge still deletes the remote branch after merging

**Given** `job archive --with-merge` has successfully squash-merged the PR
**When** post-merge cleanup runs
**Then** both the local and the remote feature branch are deleted

### Requirement: the archived transition shall be gated on a successful archive record push

The job SHALL be transitioned to `archived` only after the archive record has been committed
and pushed to the feature branch. When the folder move, the commit, or the push fails, the
command MUST escalate (exit code 1) without transitioning the job and without running
cleanup, so that a retry can complete the operation. Cleanup MUST run after the transition,
never before it.

#### Scenario: push failure blocks the transition and cleanup

**Given** a job in status `awaiting-archive` whose archive commit cannot be pushed
**When** plain archive runs
**Then** the command exits with code 1 and an escalation, the job status stays
`awaiting-archive`, and no cleanup is performed

#### Scenario: transition failure blocks cleanup on the recording path

**Given** a job whose archive record was pushed successfully but whose status transition
to `archived` fails
**When** plain archive runs
**Then** the command exits with code 1 and an escalation, and no cleanup is performed

### Requirement: plain archive shall idempotently finish jobs whose archive record already exists

When the change folder is already at the archive location, plain archive SHALL still reach
`archived` + cleanup in a single run. In that state the run MUST NOT create a second archive
commit; it MUST skip the push when the remote feature branch no longer exists. When the
remote feature branch still exists (or its existence cannot be determined), a push failure
MUST exit with code 1 and an escalation — the record commit may exist only locally (a prior
run committed but failed to push), so the job MUST NOT transition to `archived` or run
cleanup until the push succeeds. When the recording working
tree is unusable (the worktree directory is absent, or in `--no-worktree` mode the local
feature branch is absent), plain archive SHALL bypass archive recording entirely and perform
a best-effort transition followed by cleanup, exiting with code 0.

#### Scenario: leftover two-phase job with a merged PR is finished in one run

**Given** a job in status `awaiting-archive` whose change folder is already at the archive
location, whose PR has been merged, and whose remote feature branch has been deleted by
GitHub
**When** the operator runs `specrunner job archive <slug>` once
**Then** no new archive commit is created, the push is skipped with a warning, the job
status becomes `archived`, cleanup runs, and the command exits with code 0

#### Scenario: already-recorded job with an OPEN PR re-pushes harmlessly

**Given** a job in status `awaiting-archive` whose change folder is already at the archive
location and whose remote feature branch still exists
**When** plain archive runs
**Then** the existing archive commit is pushed again (a no-op push), the job status becomes
`archived`, and cleanup runs

#### Scenario: already-recorded job whose push fails again does not reach archived

**Given** a job in status `awaiting-archive` whose change folder is already at the archive
location, whose remote feature branch still exists, and whose previous archive run committed
the record but failed to push it
**When** plain archive runs and the push fails again
**Then** the command exits with code 1 and an escalation, the job status stays
`awaiting-archive`, and no cleanup is performed

#### Scenario: recorded job with a missing worktree is finished without recording

**Given** a job in status `awaiting-archive` whose change folder is already at the archive
location and whose worktree directory no longer exists on disk
**When** plain archive runs
**Then** archive recording is not attempted, a best-effort transition to `archived` is
performed, cleanup runs, and the command exits with code 0

#### Scenario: unrecorded job with a missing worktree still escalates

**Given** a job in status `awaiting-archive` whose change folder is at the active location
and whose worktree directory does not exist
**When** plain archive runs
**Then** the command escalates with exit code 1 and the job is not transitioned

### Requirement: plain archive shall treat PR-less jobs identically to PR-bearing jobs

A job without a recorded pull-request number SHALL follow the same single path: record,
transition to `archived`, then cleanup. The absence of a PR MUST NOT skip cleanup.

#### Scenario: PR-less job gets cleanup as well

**Given** a job in status `awaiting-archive` with no recorded pull-request number
**When** plain archive runs successfully
**Then** the job status becomes `archived` and cleanup runs (without deleting the remote
feature branch)

### Requirement: operator-facing guidance shall state the archive-then-merge order

Operator-facing text SHALL present `archive → merge` as the operating order and MUST NOT
describe a two-phase archive or instruct a re-run after merge. The `job ls` next-action for
an `awaiting-archive` job SHALL be `job archive <slug>` regardless of the PR merge state.
The archive success output SHALL tell the operator that the next step is merging the PR on
GitHub and that the archive commit will not reach the base branch if the PR is already
merged or closed.

#### Scenario: job ls recommends archive for an unmerged PR

**Given** a job row with status `awaiting-archive` and `prMerged` equal to `false` or `null`
**When** the operations view derives the next action
**Then** the next action is `job archive <slug>`

#### Scenario: workflow dispatch documents a single-run archive

**Given** the `specrunner-dispatch` workflow definition
**When** the `archive` action is described in the workflow comments and input descriptions
**Then** the text describes one single run and contains no two-phase or re-run-after-merge
guidance

#### Scenario: success output points to the GitHub merge as the next step

**Given** a job with a recorded PR number
**When** plain archive records the archive successfully
**Then** the stdout output states that the PR should now be merged on GitHub and warns that
an already merged or closed PR will not carry the archive commit to the base branch
