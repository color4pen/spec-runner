# Spec: operator-commit-adoption

## Requirements

### Requirement: resume reconciles the publish range against the ledger before any step runs

At resume entry, after the apply-canon gate and before the pipeline launches,
the system SHALL enumerate the publish range
(`git rev-list HEAD --not --remotes=origin`) in the job worktree and compare each
OID against `state.synthesizedCommits` (read after any apply-canon append). This
reconciliation SHALL run unconditionally, with no flag required, and SHALL NOT
mutate the ledger by itself.

When the publish range is empty (the normal path — the pipeline pushes after
every synthesis), the reconciliation SHALL be a no-op and resume SHALL proceed
exactly as before.

A `git rev-list` failure whose error indicates the path is not a git repository
(`exit 128`) SHALL be treated as an empty range and resume SHALL continue; any
other `git rev-list` failure SHALL halt resume (fail-closed) without starting a
step.

#### Scenario: unknown committed commit halts before any step executes

**Given** a job is in `awaiting-resume` status with a worktree
**And** the worktree branch contains a commit whose OID is NOT in
`state.synthesizedCommits` and is NOT on origin (it is in the publish range)
**When** the operator runs `job resume <slug>` without `--adopt-commits`
**Then** no pipeline step is executed (no step side effect occurs)
**And** the command halts with exit code 1

#### Scenario: empty publish range leaves resume behavior unchanged

**Given** a job is in `awaiting-resume` status with a worktree
**And** the publish range (`git rev-list HEAD --not --remotes=origin`) is empty
**When** the operator runs `job resume <slug>`
**Then** the reconciliation makes no change to `state.synthesizedCommits`
**And** resume proceeds to the pipeline exactly as it did before this change

---

### Requirement: flag-less halt presents each unknown commit and the three resolution options

When an unknown publish-range OID exists and `--adopt-commits` is not given, the
escalation the system displays SHALL, for each unknown commit, include its short
SHA, its subject, its author, and the paths it changed. The escalation SHALL also
present exactly three resolution options:

1. Re-run `resume` with `--adopt-commits` to record the commit(s) in the ledger.
2. Push the commit(s) to origin so they leave the publish range.
3. Remove the commit(s) from the branch (e.g. reset / revert) so they leave the
   publish range.

The system SHALL NOT append the unknown OID to `state.synthesizedCommits` on this
path.

#### Scenario: escalation names the commit and offers three fixes

**Given** a job whose worktree has an unknown commit in the publish range
**When** the operator runs `job resume <slug>` without `--adopt-commits`
**Then** the escalation text contains the unknown commit's short SHA
**And** the escalation text references `--adopt-commits` as one option
**And** the escalation text references pushing the commit to origin as one option
**And** the escalation text references removing/reverting the commit as one option
**And** `state.synthesizedCommits` does not contain the unknown OID

---

### Requirement: resume --adopt-commits records unknown OIDs then launches the pipeline

When `job resume <slug> --adopt-commits` is invoked and unknown publish-range
OIDs exist, the system SHALL append every unknown OID to
`state.synthesizedCommits` via `appendSynthesizedCommit`, persist the updated
state, and only after a successful persist launch the pipeline. If the persist
fails, the system SHALL NOT launch the pipeline (fail-closed). Adoption SHALL NOT
create, move, or delete any git commit.

#### Scenario: adopted OID is recorded in persisted state

**Given** a job whose worktree has an unknown commit `C` in the publish range
**When** the operator runs `job resume <slug> --adopt-commits`
**Then** `C`'s OID is present in `state.synthesizedCommits`
**And** the persisted job state reflects the appended OID
**And** the pipeline is launched

#### Scenario: persist failure prevents pipeline launch

**Given** a job whose worktree has an unknown commit in the publish range
**And** persisting the updated job state fails
**When** the operator runs `job resume <slug> --adopt-commits`
**Then** the pipeline is NOT launched
**And** resume halts with exit code 1

---

### Requirement: --apply-canon does not adopt committed operator commits

The meaning of `--apply-canon` SHALL remain "commit dirty protected canon paths
as an operator-apply commit." When `--apply-canon` is given alone and the
worktree is clean (the operator already committed their fix) but an unknown
commit exists in the publish range, `--apply-canon` SHALL NOT adopt that commit,
and the unconditional reconciliation SHALL halt exactly as it would without
`--apply-canon`.

#### Scenario: --apply-canon alone still halts on a committed operator commit

**Given** a job whose worktree has no dirty protected canon paths
**And** the worktree branch contains an unknown commit in the publish range
**When** the operator runs `job resume <slug> --apply-canon` (without
`--adopt-commits`)
**Then** the unknown commit is NOT appended to `state.synthesizedCommits`
**And** resume halts with exit code 1 and presents the three resolution options

---

### Requirement: egressUnknownCommitError names the three resolution options

The `egressUnknownCommitError` message SHALL include the same three resolution
options as the resume-entry escalation: adopting via `--adopt-commits`, pushing
the commit to origin, and removing/reverting the commit. The three options SHALL
be sourced from a single shared definition so the resume-entry escalation and the
in-pipeline halt stay consistent.

#### Scenario: in-pipeline egress halt message lists the three options

**Given** the in-pipeline egress backstop detects an unknown OID in the publish
range
**When** `egressUnknownCommitError(oid, branch)` is constructed
**Then** the resulting error's operator-facing text references `--adopt-commits`
**And** it references pushing the commit to origin
**And** it references removing/reverting the commit
