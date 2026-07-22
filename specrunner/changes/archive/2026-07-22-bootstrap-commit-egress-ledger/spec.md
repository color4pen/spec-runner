# Spec: bootstrap-commit-egress-ledger

## Requirements

### Requirement: Bootstrap commit OID SHALL be recorded in synthesizedCommits

All three bootstrap paths that execute `git commit -m "add request.md for <slug>"` MUST
capture the resulting commit OID via `git rev-parse HEAD` and append it to
`state.synthesizedCommits` using `appendSynthesizedCommit` before returning from the
bootstrap function.

#### Scenario: workspace-materializer new-run path records bootstrap OID

**Given** `WorkspaceMaterializer.materialize()` is called with `opts.requestFilePath` set  
**When** the bootstrap `git commit` succeeds and `git rev-parse HEAD` returns an OID  
**Then** `host.updateJobState` is called with a mutator that adds the OID to `synthesizedCommits`  
**And** the job state persisted after bootstrap contains that OID in `synthesizedCommits`

#### Scenario: local.ts no-worktree run path records bootstrap OID

**Given** `LocalRuntime.setupWorkspaceNoWorktree()` is called with `opts.requestFilePath` set  
**When** the bootstrap `git commit` succeeds and `git rev-parse HEAD` returns an OID  
**Then** `updateJobState` is called with a mutator that adds the OID to `synthesizedCommits`  
**And** the job state persisted after bootstrap contains that OID in `synthesizedCommits`

#### Scenario: managed.ts run path records bootstrap OID

**Given** `ManagedRuntime.setupWorkspace()` is called with `opts.requestFilePath` and `opts.branchName` set  
**When** the bootstrap `git commit` succeeds and `git rev-parse HEAD` returns an OID  
**Then** `updateJobState` is called with a mutator that adds the OID to `synthesizedCommits`  
**And** the job state persisted after bootstrap contains that OID in `synthesizedCommits`

---

### Requirement: Bootstrap SHALL fail closed when rev-parse fails

After a bootstrap `git commit`, if `git rev-parse HEAD` returns a non-zero exit code,
the bootstrap function MUST throw an error and MUST NOT allow the job to continue with
an unlisted pipeline commit.

For `workspace-materializer.ts`, the worktree MUST be cleaned up (manager.remove + prune)
before the error is propagated, consistent with the existing commit-failure cleanup pattern.

#### Scenario: workspace-materializer rev-parse failure aborts bootstrap

**Given** `WorkspaceMaterializer.materialize()` is called with `opts.requestFilePath` set  
**When** the bootstrap `git commit` succeeds but `git rev-parse HEAD` returns exitCode ≠ 0  
**Then** `materialize()` throws  
**And** `host.manager.remove` was called (worktree cleanup)  
**And** `host.manager.prune` was called  
**And** the job does NOT continue

#### Scenario: local.ts rev-parse failure aborts bootstrap

**Given** `LocalRuntime.setupWorkspaceNoWorktree()` is called with `opts.requestFilePath` set  
**When** the bootstrap `git commit` succeeds but `git rev-parse HEAD` returns exitCode ≠ 0  
**Then** `setupWorkspaceNoWorktree()` throws

#### Scenario: managed.ts rev-parse failure aborts bootstrap

**Given** `ManagedRuntime.setupWorkspace()` is called with `opts.requestFilePath` and `opts.branchName` set  
**When** the bootstrap `git commit` succeeds but `git rev-parse HEAD` returns exitCode ≠ 0  
**Then** `setupWorkspace()` throws

---

### Requirement: Egress check SHALL pass on the first push after bootstrap

After the bootstrap path records the materialization commit OID in `synthesizedCommits`,
the first pipeline step's push MUST succeed without `EGRESS_UNKNOWN_COMMIT`.

#### Scenario: first push egress passes with bootstrap OID in ledger

**Given** a real git repo with initial commits already on origin (excluded by `--remotes=origin`)  
**And** the bootstrap path has run and recorded the bootstrap commit OID in `synthesizedCommits`  
**And** a scoped step commit has been synthesized and its OID added to `synthesizedCommits`  
**When** `verifyEgressLedger` is called with the full ledger (bootstrap OID + step OID)  
**Then** `verifyEgressLedger` resolves without error

#### Scenario: first push egress fails when bootstrap OID is absent (destruction confirmation)

**Given** the same real git repo setup as above  
**And** the bootstrap OID is NOT present in `synthesizedCommits` (simulating pre-fix behavior)  
**When** `verifyEgressLedger` is called with only the step OID in the ledger  
**Then** `verifyEgressLedger` throws with error code `EGRESS_UNKNOWN_COMMIT`

---

### Requirement: Existing egress and synthesis tests SHALL remain green

All existing tests in `tests/unit/step/`, `tests/unit/state/`, and `tests/unit/pipeline/`
that exercise egress verification, synthesizedCommit tracking, or revision binding MUST pass
without modification.
