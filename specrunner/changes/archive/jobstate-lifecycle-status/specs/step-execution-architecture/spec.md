



## MODIFIED Requirements

### Requirement: Pipeline escalate terminal writes `awaiting-resume`

When `Pipeline.runInternal` reaches the `escalate` terminal (`nextStep === "escalate"`), the pipeline SHALL set `state.status` to `"awaiting-resume"` and populate `state.resumePoint` with the halted step's information, UNLESS `state.status` is already `"failed"` AND `state.error.code` is in the `FATAL_ERROR_CODES` set.

`FATAL_ERROR_CODES` SHALL be defined as:

```typescript
const FATAL_ERROR_CODES: Set<string> = new Set([
  "SESSION_CREATE_FAILED",
  "CONFIG_MISSING",
  "CONFIG_INCOMPLETE",
  "CONFIG_INVALID",
]);
```

For non-fatal errors that reach the escalate terminal (e.g., `SPEC_REVIEW_RESULT_NOT_FOUND`, `CODE_REVIEW_RESULT_NOT_FOUND`, `NO_COMMIT_DETECTED`), the status SHALL be overwritten to `"awaiting-resume"`. The `error` field SHALL be preserved (not cleared) so that diagnostic information is available to the resume command.

This MODIFIED Requirement extends the existing lifecycle in:
- `Requirement: StepExecutor Manages Lifecycle and Emits Events` — the pipeline-level terminal behavior is now specified

#### Scenario: escalation verdict leads to awaiting-resume

- **GIVEN** `spec-review` returns verdict `"escalation"`
- **WHEN** the transition table routes to `"escalate"` and the pipeline reaches the terminal
- **THEN** `state.status === "awaiting-resume"`
- **AND** `state.resumePoint.step === "spec-review"`
- **AND** `state.resumePoint.iterationsExhausted` equals the number of iterations completed for spec-review

#### Scenario: fatal error remains failed

- **GIVEN** a step throws with `SESSION_CREATE_FAILED` error, setting `state.status = "failed"`
- **WHEN** the transition table routes to `"escalate"` and the pipeline reaches the terminal
- **THEN** `state.status === "failed"` (unchanged)
- **AND** `state.resumePoint` is not set

#### Scenario: non-fatal error becomes awaiting-resume

- **GIVEN** a step throws with `NO_COMMIT_DETECTED` error, setting `state.status = "failed"`
- **WHEN** the transition table routes to `"escalate"` and the pipeline reaches the terminal
- **THEN** `state.status === "awaiting-resume"`
- **AND** `state.error.code === "NO_COMMIT_DETECTED"` (error info preserved)
- **AND** `state.resumePoint.step` equals the step that failed

## ADDED Requirements

### Requirement: SIGINT handler persists `awaiting-resume` instead of deleting worktree

When the pipeline receives SIGINT (or SIGTERM) during execution in local runtime mode, the signal handler SHALL:

1. Persist `state.status = "awaiting-resume"` and `state.resumePoint` via `updateJobState`
2. NOT delete the worktree (it is preserved for future resume)
3. Exit with code 130 (128 + SIGINT)

The worktree remains on disk for the resume command to reuse. Orphan worktrees are cleaned up by `specrunner rm --all-terminated` or `git worktree prune`.

This NEW Requirement modifies the behavior described in the `3-layer cleanup` comment block in `src/cli/run.ts`.

#### Scenario: SIGINT during local pipeline persists state and exits

- **GIVEN** a pipeline running in local runtime mode at step `"implementer"`
- **WHEN** SIGINT is received
- **THEN** `state.status === "awaiting-resume"`
- **AND** `state.resumePoint.step === "implementer"`
- **AND** `state.resumePoint.reason === "Interrupted by signal"`
- **AND** the worktree directory still exists on disk
- **AND** the process exits with code 130

#### Scenario: post-pipeline failure cleanup skips worktree for awaiting-resume

- **GIVEN** a pipeline that completed with `status: "awaiting-resume"`
- **WHEN** `cleanupWorktreeOnFailure` is called
- **THEN** the worktree is NOT deleted (preserved for resume)
