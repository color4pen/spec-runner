# Spec: operator-canon-apply-on-resume

## Requirements

### Requirement: resume --apply-canon commits operator canon changes before step execution

When `job resume <slug> --apply-canon` is invoked and the job's worktree
contains dirty changes on protected canon paths, the system SHALL:

1. Enumerate the dirty protected canon paths using `git status --porcelain`.
2. Stage those paths with `git add -- <paths>`.
3. Commit them with message `operator-apply: <slug>`.
4. Append the new commit OID to `state.synthesizedCommits` via
   `appendSynthesizedCommit` and persist the updated state.
5. Start the step with the protected canon paths clean in the worktree.

Non-protected-canon dirty paths SHALL remain untouched.

#### Scenario: canon escalation followed by hand-edit and resume --apply-canon succeeds

**Given** a job is in `awaiting-resume` status with error code
`CANON_FINDING_ESCALATION`
**And** the job's worktree has an operator edit on a protected canon path
(e.g., `specrunner/changes/<slug>/design.md`)
**When** the operator runs `job resume <slug> --apply-canon`
**Then** a new commit with message `operator-apply: <slug>` is created in the
worktree containing only the modified canon path
**And** the commit OID is appended to `state.synthesizedCommits` and persisted
**And** the step starts without encountering a `WRITE_SCOPE_VIOLATION`

#### Scenario: resume --apply-canon is a no-op when worktree is clean

**Given** a job is in `awaiting-resume` status
**And** no protected canon paths are dirty in the worktree
**When** the operator runs `job resume <slug> --apply-canon`
**Then** no operator-apply commit is created
**And** the step starts normally (same as flag-less resume with clean worktree)

---

### Requirement: --apply-canon applies only protected canon paths

When `--apply-canon` is given, the system SHALL commit only paths in
`protectedCanonPaths(slug)`. Non-protected-canon dirty files in the worktree
SHALL remain dirty and SHALL NOT be included in the operator-apply commit.

`protectedCanonPaths(slug)` is the set defined by `write-scope.ts`:
- `specrunner/changes/<slug>/request.md`
- `specrunner/changes/<slug>/spec.md`
- `specrunner/changes/<slug>/design.md`
- `specrunner/changes/<slug>/tasks.md`
- `specrunner/changes/<slug>/test-cases.md`
- `specrunner/changes/<slug>/request-review-attestation.json`

#### Scenario: non-canon dirty files remain untouched after --apply-canon

**Given** the worktree has an operator edit on `specrunner/changes/<slug>/design.md`
(protected)
**And** the worktree also has edits on `src/feature.ts` (not protected)
**When** the operator runs `job resume <slug> --apply-canon`
**Then** the operator-apply commit contains `specrunner/changes/<slug>/design.md`
and no other files
**And** `src/feature.ts` remains dirty in the worktree after the commit

---

### Requirement: flag-less resume fails closed when protected canon is dirty

When `job resume <slug>` is invoked WITHOUT `--apply-canon` and the job's
worktree contains dirty changes on protected canon paths, the system SHALL
stop without starting the step and SHALL display:
- The list of dirty protected canon paths
- A message directing the operator to use `--apply-canon` to adopt the changes
  as an operator commit, or to discard the changes first

#### Scenario: flag-less resume halts with guidance when protected canon is dirty

**Given** a job is in `awaiting-resume` status
**And** the job's worktree has an edit on `specrunner/changes/<slug>/tasks.md`
**When** the operator runs `job resume <slug>` (no `--apply-canon`)
**Then** the command exits with code 1
**And** the step has NOT started
**And** stderr contains the name of the dirty protected canon path
**And** stderr contains a reference to `--apply-canon`

#### Scenario: flag-less resume succeeds when worktree is clean

**Given** a job is in `awaiting-resume` status
**And** no protected canon paths are dirty in the worktree
**When** the operator runs `job resume <slug>` (no `--apply-canon`)
**Then** the step starts normally (no regression from pre-existing behavior)

---

### Requirement: operator-apply commit OID is recorded in synthesizedCommits before the step runs

The system SHALL append the operator-apply commit OID to
`state.synthesizedCommits` via `appendSynthesizedCommit` and persist the state
before the step starts, so that the egress backstop (`runInlineEgressCheck`)
recognizes the commit when `commitAndPush` runs.

#### Scenario: egress check passes for the operator-apply commit

**Given** `--apply-canon` has created an operator-apply commit
**And** the commit OID is in `state.synthesizedCommits`
**When** the subsequent step's `commitAndPush` calls `runInlineEgressCheck`
**Then** the operator-apply commit OID is in the egress ledger
**And** `EGRESS_UNKNOWN_COMMIT` is NOT thrown

---

### Requirement: CANON_FINDING_ESCALATION hint mentions --apply-canon

The `hint` stored in `state.error.hint` when a `CANON_FINDING_ESCALATION`
occurs SHALL mention `job resume <slug> --apply-canon` as the correct
resumption procedure. The hint SHALL NOT instruct the operator to run
`git commit` or `git push` manually.

Similarly, the reason string produced by `buildCanonEscalationReason` SHALL
include a reference to `--apply-canon` so the operator can read it in the
escalation report.

#### Scenario: hint text guides operator to --apply-canon

**Given** a step produces a `CANON_FINDING_ESCALATION`
**When** `commit-orchestrator.ts` sets `state.error.hint`
**Then** `state.error.hint` contains the substring `--apply-canon`
**And** `state.error.hint` does NOT contain `git push` or `git commit`

#### Scenario: buildCanonEscalationReason output mentions --apply-canon

**Given** there are unroutable canon findings
**When** `buildCanonEscalationReason(findings)` is called
**Then** the returned string contains the substring `--apply-canon`
