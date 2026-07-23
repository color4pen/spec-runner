# Spec: setupWorkspace 後の in-memory state を store から reload し、field 手動 mirror を廃止する

## Requirements

### Requirement: State reload after setupWorkspace

After `setupWorkspace()` completes, the runner SHALL reload the job state from the slug
store and use the reloaded state for all subsequent pipeline operations (including the
state passed to `pipeline.run()`). The manual mirror of `worktreePath` and `branch` into
the in-memory `jobState` SHALL be removed.

#### Scenario: Bootstrap OID reaches pipeline in-memory state

**Given** a new-run with a request file path set (requestFilePath provided)
**When** `setupWorkspace()` records the bootstrap commit OID in the slug store via
`appendSynthesizedCommit`, and the runner calls `reloadJobState()`
**Then** the `JobState` object passed to `pipeline.run()` has `synthesizedCommits`
containing the bootstrap OID, and the first egress check does not emit
`EGRESS_UNKNOWN_COMMIT`

#### Scenario: Mirror code is absent

**Given** the patched `runner.ts`
**When** inspecting lines 169–181 (the former manual mirror block)
**Then** no code assigns `jobState.worktreePath` or `jobState.branch` via mirror; those
fields arrive exclusively through the reloaded state

---

### Requirement: Reload failure is fail-closed

If `reloadJobState()` throws (e.g., the slug store file is unreadable or corrupt), the
runner SHALL NOT start the pipeline. It SHALL log the error, persist a `failed` state,
and return exit code 1.

#### Scenario: Store read fails after setupWorkspace

**Given** `setupWorkspace()` returns a workspace successfully
**When** `reloadJobState()` throws with any error
**Then** `pipeline.run()` is never called, exit code is 1, and the error is logged

---

### Requirement: In-memory-only fields are preserved through reload

Fields set on the in-memory `jobState` before `setupWorkspace()` is called
(`reviewers`, `noWorktree`, `issueNumber`) SHALL be present in the reloaded state
after `reloadJobState()`. This is guaranteed structurally: `setupWorkspace()` seeds
the slug store with `bootstrapState` (which already contains those fields) before any
`updateJobState()` calls, so the store snapshot always includes them.

#### Scenario: Reviewer snapshot survives reload

**Given** `jobState.reviewers` is set in `prepare()` before `workspaceOpts.bootstrapState`
is assigned
**When** `setupWorkspace()` seeds the store with that `bootstrapState` and then calls
`updateJobState()` to add `worktreePath`, `synthesizedCommits`, and `branch`
**Then** `reloadJobState()` returns a state where `reviewers`, `noWorktree`, and
`issueNumber` are still present and equal to the original values

---

### Requirement: Halt-path persist does not revert synthesizedCommits

When the pipeline halts mid-run and calls `persistJobState()` with the current in-memory
state, the persisted state SHALL retain `synthesizedCommits` and SHALL NOT revert them
to `null` or `undefined`.

#### Scenario: Halt persist after reload preserves ledger

**Given** `reloadJobState()` produced an in-memory state with `synthesizedCommits`
containing the bootstrap OID
**When** a halt transition persists that in-memory state to the store
**Then** the store's `synthesizedCommits` still contains the bootstrap OID; it does NOT
revert to `null`
