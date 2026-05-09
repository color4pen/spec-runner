## MODIFIED Requirements

### Requirement: markJobArchived execution timing

The finish command SHALL execute markJobArchived immediately after Phase 3 (PR merge success), before Phase 4 cleanup begins. PR merge is an irreversible external operation; internal state MUST be confirmed at that point.

#### Scenario: Phase 3 merge success triggers archived transition
- WHEN Phase 3 `gh pr merge` succeeds
- THEN `markJobArchived` is called immediately after merge, before Phase 4 cleanup
- AND state.status is persisted as `archived` before worktree/branch cleanup begins

#### Scenario: Phase 4 cleanup failure does not affect archived state
- WHEN Phase 3 merge succeeds and Phase 4 worktree removal fails
- THEN state.status remains `archived` (already confirmed)
- AND the failure is reported as a stderr warning with exit code 0

#### Scenario: Phase 1 escalation does not trigger markJobArchived
- WHEN Phase 1 `openspec archive` subprocess exits non-zero and escalates
- THEN state.status remains unchanged and `archived` transition does not occur

### Requirement: assertJobFinishable uses canTransition

The finish command SHALL use `canTransition(state.status, "archived")` from lifecycle.ts to determine whether a job can be finished.

#### Scenario: running status is rejected
- WHEN `state.status` is `running` and `specrunner finish` is executed
- THEN `canTransition("running", "archived")` returns false
- AND a `JOB_NOT_FINISHABLE` error is thrown with hint "Wait for the running job to complete before finishing"

### Requirement: Phase 4 cleanup is best-effort

Phase 4 operations (worktree removal, git checkout, git pull, branch deletion) SHALL be best-effort. Failures are reported as stderr warnings and do not affect exit code.

#### Scenario: updateJobState for worktreePath clearing is protected
- WHEN Phase 4 `updateJobState(... worktreePath: null)` throws an exception
- THEN the exception is caught and a warning is written to stderr
- AND the finish command continues without failing
